/**
 * @file app/api/transcribe/route.ts
 * @description Transcription API route for the ULTRON desktop application.
 *
 * Subsystem:
 * Audio Ingestion / Speech-to-Text fallback endpoint.
 *
 * Key Responsibilities:
 * - Accepts audio blob uploads from the HUD or JSON `{ text }` payloads from non-audio clients.
 * - Bounds request sizes before allocating buffers.
 * - Returns the JSON contract shape `{ text, security }` expected by the HUD; binary uploads
 *   return `text: ""` because speech recognition happens in the browser (Web Speech API) and
 *   this route only acknowledges receipt.
 *
 * Safety / Security Guarantees:
 * - Local single-user design: authentication is not required (fingerprint/Zero-Trust gating
 *   removed per user request).
 * - Oversized audio bodies are rejected with HTTP 413 instead of being buffered into memory.
 * - Internal error detail stays in server logs, never in the response body.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCryptoStatus } from "@/lib/crypto";

/** Upper bound on accepted audio upload size (25 MiB ≈ several minutes of Opus/WebM audio). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Upper bound on JSON `text` payloads echoed back in the fallback contract. */
const MAX_JSON_TEXT_CHARS = 8000;

/**
 * Handles transcription requests.
 *
 * @param req - NextRequest with either an audio body or JSON `{ text }`.
 * @returns JSON `{ text, security }` (plus `bytesReceived` for binary uploads).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    // --- JSON mode: client supplies an already-transcribed string (HUD fallback path). ---
    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ text: "", error: "Invalid JSON request body" }, { status: 400 });
      }

      const rawText = body && typeof body === "object" ? (body as Record<string, unknown>).text : undefined;
      if (rawText !== undefined && typeof rawText !== "string") {
        return NextResponse.json({ text: "", error: "text must be a string" }, { status: 400 });
      }
      const text = typeof rawText === "string" ? rawText : "";
      if (text.length > MAX_JSON_TEXT_CHARS) {
        return NextResponse.json({ text: "", error: "text exceeds maximum length" }, { status: 413 });
      }

      return NextResponse.json({ text, security: getCryptoStatus() });
    }

    // --- Binary mode: MediaRecorder audio blob. ---
    const declaredLength = Number(req.headers.get("content-length") || "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { text: "", error: "Audio payload exceeds maximum size" },
        { status: 413 }
      );
    }

    const buffer = await req.arrayBuffer();
    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { text: "", error: "Audio payload exceeds maximum size" },
        { status: 413 }
      );
    }

    return NextResponse.json({ text: "", bytesReceived: buffer.byteLength, security: getCryptoStatus() });
  } catch (err) {
    console.error("[TRANSCRIBE ROUTE EXCEPTION]", err);
    return NextResponse.json({ text: "", error: "Transcription request failed" }, { status: 500 });
  }
}
