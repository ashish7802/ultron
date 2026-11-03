/**
 * @file app/api/tts/route.ts
 * @description Enhanced Text-to-Speech orchestration layer with Windows PowerShell SAPI5 & Audio Synthesis.
 *
 * Subsystem:
 * Audio Output & Speech Synthesis Engine.
 *
 * Key Responsibilities:
 * - Renders text to speech as a native WAV file using the Windows SAPI5 system voices.
 * - Supports speech rate and volume modulation.
 * - Handles interruption cancellation via HTTP DELETE, which terminates in-flight synthesis.
 * - Provides a graceful silent-WAV fallback when local audio services are unavailable, so the
 *   browser speech-synthesis fallback in the HUD can take over seamlessly.
 *
 * Safety / Security Guarantees:
 * - No shell interpolation of user text: the speech text and output path are passed through
 *   dedicated environment variables and the PowerShell script through `-EncodedCommand`, and
 *   the process is spawned with `execFile` (no `cmd.exe`). This closes the previous command
 *   injection hole where a single quote in the text could terminate the `Speak('...')` string.
 * - Local single-user design: authentication is not required (fingerprint/Zero-Trust gating
 *   removed per user request).
 * - Temp WAV files are always cleaned up, even on timeout/cancellation.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/** Hard cap on synthesized characters: SAPI streams to disk, so longer text is truncated. */
const MAX_SPEECH_CHARS = 500;
/** Minimum/maximum SAPI render timeout; long sentences genuinely take longer than 3.5s. */
const MIN_SYNTHESIS_TIMEOUT_MS = 3500;
const MAX_SYNTHESIS_TIMEOUT_MS = 20000;
/** PowerShell SAPI renderer invocations currently running, used by DELETE to cancel speech. */
const activeSynthesisProcesses = new Set<ChildProcess>();

/**
 * Builds a valid mono 16-bit PCM WAV buffer containing silence.
 *
 * @param durationMs - Silence duration in milliseconds (default 200ms).
 * @returns Complete WAV file bytes.
 */
function generateSilentWav(durationMs: number = 200): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * Normalizes speech text before synthesis.
 *
 * WHY: control characters (NUL etc.) are illegal in Windows environment variables and can
 * truncate the command payload; collapsing them to spaces keeps the text speakable.
 *
 * @param raw - Untrusted speech text.
 * @returns Sanitized text capped at MAX_SPEECH_CHARS.
 */
function sanitizeSpeechText(raw: string): string {
  return raw
    .replace(/[\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

/**
 * Renders text to a temporary WAV file using Windows SAPI5 via PowerShell.
 *
 * Security: the script itself contains no user data. `ULTRON_TTS_TEXT` and `ULTRON_TTS_OUT`
 * are read via `$env:` inside PowerShell, whose values are treated as plain data (never
 * re-parsed as code). `execFile` avoids the cmd.exe layer entirely, so quotes, `$`, backticks
 * and `&` in the speech text cannot break out of the command.
 *
 * @param text - Sanitized speech text.
 * @param rate - Playback rate multiplier (1 = normal).
 * @param volume - Volume percentage (0-100).
 * @returns WAV bytes, or null when synthesis produced no file.
 * @throws Error when PowerShell exits with a failure/timeout.
 */
async function synthesizeSpeechToWav(text: string, rate: number, volume: number): Promise<Buffer | null> {
  const tempWav = path.join(
    os.tmpdir(),
    `ultron_tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`
  );

  // SAPI rate is an integer in [-10, 10]; volume is an integer percentage in [0, 100].
  const sapiRate = Math.max(-10, Math.min(10, Math.round((rate - 1) * 5)));
  const sapiVolume = Math.max(0, Math.min(100, Math.round(volume)));

  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$speak.Rate = ${sapiRate}`,
    `$speak.Volume = ${sapiVolume}`,
    "$speak.SetOutputToWaveFile($env:ULTRON_TTS_OUT)",
    "$speak.Speak($env:ULTRON_TTS_TEXT)",
    "$speak.Dispose()",
  ].join("; ");

  // PowerShell -EncodedCommand takes UTF-16LE Base64, which is immune to shell quoting.
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
  const timeoutMs = Math.min(
    MAX_SYNTHESIS_TIMEOUT_MS,
    Math.max(MIN_SYNTHESIS_TIMEOUT_MS, text.length * 120)
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
        {
          timeout: timeoutMs,
          windowsHide: true,
          env: {
            ...process.env,
            ULTRON_TTS_TEXT: text,
            ULTRON_TTS_OUT: tempWav,
          },
        },
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
      activeSynthesisProcesses.add(child);
      child.once("close", () => activeSynthesisProcesses.delete(child));
    });

    if (!fs.existsSync(tempWav)) return null;
    return fs.readFileSync(tempWav);
  } finally {
    // Always remove the temp artefact, including timeout/cancel and partial-file cases.
    try {
      if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
    } catch (cleanupErr) {
      console.warn("[ULTRON TTS] Failed to remove temp WAV:", cleanupErr);
    }
  }
}

/**
 * Handles TTS synthesis requests.
 *
 * @param req - NextRequest containing `{ text, rate?, volume? }` JSON.
 * @returns WAV audio response, or a silent WAV fallback when local synthesis is unavailable.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { text?: unknown; rate?: unknown; volume?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { text, rate = 1, volume = 100 } = body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const numericRate = typeof rate === "number" && Number.isFinite(rate) ? rate : 1;
    const numericVolume = typeof volume === "number" && Number.isFinite(volume) ? volume : 100;
    const cleanText = sanitizeSpeechText(text);

    if (!cleanText) {
      const silent = generateSilentWav(100);
      return new NextResponse(new Uint8Array(silent), {
        headers: { "Content-Type": "audio/wav" },
      });
    }

    // Windows SAPI5 Speech Synthesis via PowerShell to render real native WAV.
    if (process.platform === "win32") {
      try {
        const audioBuffer = await synthesizeSpeechToWav(cleanText, numericRate, numericVolume);
        if (audioBuffer) {
          return new NextResponse(new Uint8Array(audioBuffer), {
            headers: {
              "Content-Type": "audio/wav",
              "Content-Length": audioBuffer.length.toString(),
            },
          });
        }
      } catch (sapiErr) {
        console.warn("[ULTRON TTS] Windows SAPI5 synthesis notice, falling back to browser synthesis:", sapiErr);
      }
    }

    // Fallback: minimal valid WAV; browser speech synthesis handles speech output in the client.
    const fallbackWav = generateSilentWav(150);
    return new NextResponse(new Uint8Array(fallbackWav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": fallbackWav.length.toString(),
      },
    });
  } catch (err) {
    console.error("[ULTRON TTS] Unexpected synthesis failure:", err);
    const silent = generateSilentWav(100);
    return new NextResponse(new Uint8Array(silent), {
      headers: { "Content-Type": "audio/wav" },
    });
  }
}

/**
 * Cancels any in-flight speech synthesis.
 *
 * WHY: the route previously acknowledged cancellation without doing anything, so a long
 * SAPI render kept running after the user pressed stop. The renderer is spawned via
 * `execFile`, so the ChildProcess handle is the PowerShell process itself and `kill()`
 * terminates it directly.
 *
 * @returns Acknowledgement JSON with the number of terminated renderers.
 */
export async function DELETE(): Promise<NextResponse> {
  let cancelledProcesses = 0;
  for (const child of activeSynthesisProcesses) {
    try {
      child.kill();
      cancelledProcesses++;
    } catch (killErr) {
      console.warn("[ULTRON TTS] Failed to cancel synthesis process:", killErr);
    }
  }
  activeSynthesisProcesses.clear();
  return NextResponse.json({
    ok: true,
    message: "TTS output cancelled",
    cancelledProcesses,
  });
}
