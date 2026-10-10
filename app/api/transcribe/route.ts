import { NextResponse } from "next/server";

const STT_URL = "http://127.0.0.1:5001/transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const requestStarted = performance.now();
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio recording is too large. Keep each recording under 25 MB." },
      { status: 413 },
    );
  }

  try {
    const audioBuffer = await req.arrayBuffer();
    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Audio recording is empty." }, { status: 400 });
    }
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio recording is too large. Keep each recording under 25 MB." },
        { status: 413 },
      );
    }

    const contentType = req.headers.get("content-type") || "application/octet-stream";
    const sttRes = await fetch(STT_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: audioBuffer,
      signal: AbortSignal.timeout(45_000),
    });

    const data: { text?: unknown; error?: unknown } = await sttRes.json();
    if (!sttRes.ok) {
      const message =
        typeof data.error === "string" ? data.error : "The local transcription server rejected the audio.";
      return NextResponse.json({ error: message }, { status: sttRes.status });
    }
    if (typeof data.text !== "string") {
      console.error("STT server returned an invalid response:", data);
      return NextResponse.json(
        { error: "The local transcription server returned an invalid response." },
        { status: 502 },
      );
    }

    console.info(
      `[ULTRON TIMING] transcription API ${Math.round(performance.now() - requestStarted)}ms`,
    );
    return NextResponse.json({ text: data.text });
  } catch (error) {
    console.error("Transcribe API error:", error);
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Transcription timed out. Try speaking in a shorter sentence."
        : "Local transcription server is unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
