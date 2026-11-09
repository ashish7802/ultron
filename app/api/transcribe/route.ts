/**
 * @file app/api/transcribe/route.ts
 * @description Bounded audio ingestion and local Faster-Whisper transcription endpoint.
 *
 * Subsystem:
 * Local audio ingestion / speech-to-text.
 *
 * Key Responsibilities:
 * - Enforces request size limits while consuming the stream, even without Content-Length.
 * - Writes accepted audio only to a short-lived temporary directory.
 * - Invokes the local Python Faster-Whisper worker and returns only a real transcript.
 *
 * Safety / Security Guarantees:
 * - Audio never leaves the machine for transcription; model inference is local.
 * - Empty, malformed, oversized, cancelled, and failed requests receive explicit errors.
 * - Temporary recordings are removed after the child process completes.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { getCryptoStatus } from "@/lib/crypto";
import { AudioPayloadTooLargeError, MAX_AUDIO_BYTES, readBoundedAudio } from "@/lib/audioUpload";
import { resolvePythonExecutable } from "@/lib/pythonRuntime";

const execFileAsync = promisify(execFile);
const MAX_JSON_TEXT_CHARS = 8000;
const MAX_JSON_BODY_BYTES = MAX_JSON_TEXT_CHARS * 6 + 64;
const TRANSCRIPTION_TIMEOUT_MS = 120_000;
const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".mp4",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/flac": ".flac",
};

interface WorkerFailure extends NodeJS.ErrnoException {
  killed?: boolean;
  stdout?: string | Buffer;
}

interface WorkerResult {
  text?: unknown;
  error?: unknown;
}

/**
 * Converts a worker failure into a stable API contract without exposing stderr,
 * filesystem paths, command arguments, or user speech.
 *
 * @param error - Error returned by child_process.execFile.
 * @returns A client-safe code, message, and HTTP status.
 */
function describeWorkerFailure(error: unknown): { code: string; message: string; status: number } {
  const failure = error as WorkerFailure;
  let workerResult: WorkerResult = {};
  if (typeof failure?.stdout === "string") {
    try {
      workerResult = JSON.parse(failure.stdout) as WorkerResult;
    } catch {
      workerResult = {};
    }
  }

  if (failure?.killed || failure?.code === "ETIMEDOUT") {
    return {
      code: "TRANSCRIPTION_TIMEOUT",
      message: "Local transcription timed out. Try a shorter recording.",
      status: 504,
    };
  }
  if (failure?.code === "ENOENT") {
    return {
      code: "PYTHON_RUNTIME_UNAVAILABLE",
      message: "Local transcription could not start. Configure the Python runtime.",
      status: 503,
    };
  }
  switch (workerResult.error) {
    case "EMPTY_AUDIO":
      return { code: "EMPTY_AUDIO", message: "The audio recording is empty.", status: 400 };
    case "INVALID_AUDIO":
      return { code: "INVALID_AUDIO", message: "The audio recording could not be decoded.", status: 422 };
    case "NO_SPEECH":
      return { code: "NO_SPEECH", message: "No speech was detected in the recording.", status: 422 };
    case "STT_ENGINE_UNAVAILABLE":
      return {
        code: "STT_ENGINE_UNAVAILABLE",
        message: "Faster-Whisper is not installed in the local Python environment.",
        status: 503,
      };
    case "STT_MODEL_UNAVAILABLE":
      return {
        code: "STT_MODEL_UNAVAILABLE",
        message: "The local speech model is unavailable. Check its local installation or download.",
        status: 503,
      };
    default:
      return {
        code: "TRANSCRIPTION_FAILED",
        message: "Local speech transcription failed.",
        status: 502,
      };
  }
}

/**
 * Handles a request containing an existing transcript or a local audio recording.
 *
 * @param req - NextRequest with JSON `{ text }` or an allowed audio media type.
 * @returns A non-empty transcript on success, otherwise a specific error response.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  const rawLength = req.headers.get("content-length");
  if (rawLength !== null && !/^\d+$/.test(rawLength)) {
    return NextResponse.json({ error: "INVALID_CONTENT_LENGTH" }, { status: 400 });
  }

  if (contentType.split(";")[0].trim() === "application/json") {
    if (rawLength !== null && Number(rawLength) > MAX_JSON_BODY_BYTES) {
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    }

    let jsonBytes: Buffer;
    try {
      jsonBytes = await readBoundedAudio(req.body, MAX_JSON_BODY_BYTES);
    } catch (error) {
      if (error instanceof AudioPayloadTooLargeError) {
        return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
      }
      if (req.signal.aborted) {
        return NextResponse.json({ error: "REQUEST_ABORTED" }, { status: 499 });
      }
      return NextResponse.json({ error: "REQUEST_BODY_FAILED" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes));
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const rawText = body && typeof body === "object"
      ? (body as Record<string, unknown>).text
      : undefined;
    if (typeof rawText !== "string" || !rawText.trim()) {
      return NextResponse.json({ error: "EMPTY_TRANSCRIPT" }, { status: 400 });
    }
    if (rawText.length > MAX_JSON_TEXT_CHARS) {
      return NextResponse.json({ error: "TRANSCRIPT_TOO_LARGE" }, { status: 413 });
    }
    return NextResponse.json({ text: rawText.trim(), security: getCryptoStatus() });
  }

  const mediaType = contentType.split(";")[0].trim();
  const extension = ALLOWED_AUDIO_TYPES[mediaType];
  if (!extension) {
    return NextResponse.json(
      { error: "UNSUPPORTED_AUDIO_TYPE", message: "Send a supported audio recording." },
      { status: 415 },
    );
  }

  if (rawLength !== null && Number(rawLength) > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  let audio: Buffer;
  try {
    audio = await readBoundedAudio(req.body);
  } catch (error) {
    if (error instanceof AudioPayloadTooLargeError) {
      return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
    }
    if (req.signal.aborted) {
      return NextResponse.json({ error: "UPLOAD_ABORTED" }, { status: 400 });
    }
    console.warn("[ULTRON STT] Audio upload could not be read.", {
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "AUDIO_UPLOAD_FAILED" }, { status: 400 });
  }

  if (audio.length === 0) {
    return NextResponse.json({ error: "EMPTY_AUDIO" }, { status: 400 });
  }

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ultron-stt-"));
    const audioPath = path.join(temporaryDirectory, `recording${extension}`);
    await writeFile(audioPath, audio, { flag: "wx" });

    const scriptPath = process.env.ULTRON_TRANSCRIPTION_SCRIPT
      || path.join(process.cwd(), "ultron_engine", "voice_transcription.py");
    const pythonExecutable = resolvePythonExecutable();
    const { stdout } = await execFileAsync(
      pythonExecutable,
      [scriptPath, audioPath],
      {
        timeout: TRANSCRIPTION_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        signal: req.signal,
        encoding: "utf8",
      },
    );
    const result = JSON.parse(stdout.trim()) as WorkerResult;
    if (typeof result.text !== "string" || !result.text.trim()) {
      console.error("[ULTRON STT] Worker returned no transcript.", { requestId });
      return NextResponse.json(
        { error: "TRANSCRIPTION_FAILED", message: "Local speech transcription returned no transcript." },
        { status: 502 },
      );
    }

    console.info("[ULTRON STT] Transcription completed.", {
      requestId,
      audioBytes: audio.length,
      transcriptCharacters: result.text.length,
    });
    return NextResponse.json({ text: result.text.trim(), security: getCryptoStatus() });
  } catch (error) {
    if (req.signal.aborted) {
      return NextResponse.json({ error: "REQUEST_ABORTED" }, { status: 499 });
    }
    const failure = describeWorkerFailure(error);
    console.error("[ULTRON STT] Local transcription failed.", {
      requestId,
      code: failure.code,
    });
    return NextResponse.json(
      { error: failure.code, message: failure.message },
      { status: failure.status },
    );
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
