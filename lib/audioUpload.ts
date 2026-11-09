/**
 * @file lib/audioUpload.ts
 * @description Bounded audio-body reader used by the local transcription route.
 *
 * Responsibilities:
 * - Reads request streams incrementally and stops as soon as the configured byte
 *   ceiling is crossed.
 * - Preserves upload errors so the API can return an honest client error.
 *
 * Safety guarantees:
 * - The request body is never collected into memory above the supplied limit.
 * - No audio data is written to persistent storage by this helper.
 */

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export class AudioPayloadTooLargeError extends Error {
  constructor(maxBytes: number, options?: ErrorOptions) {
    super(`Audio payload exceeds the ${maxBytes}-byte limit`, options);
    this.name = "AudioPayloadTooLargeError";
  }
}

/**
 * Reads a request body in chunks and rejects immediately when it exceeds a limit.
 *
 * @param body - Incoming Web ReadableStream; null means that no body was sent.
 * @param maxBytes - Maximum accepted number of bytes.
 * @returns The bounded payload as a Node Buffer.
 * @throws {AudioPayloadTooLargeError} When the streamed size exceeds maxBytes.
 * @throws {Error} When the request stream is interrupted or cannot be read.
 */
export async function readBoundedAudio(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number = MAX_AUDIO_BYTES,
): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        let cancellationError: unknown;
        try {
          await reader.cancel("Audio payload limit exceeded");
        } catch (error) {
          cancellationError = error;
        }
        throw new AudioPayloadTooLargeError(maxBytes, {
          cause: cancellationError,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}
