import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedAudio, AudioPayloadTooLargeError } from "./lib/audioUpload.ts";

function streamBytes(bytes, chunkSize = bytes.length) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

test("bounded audio reader accepts payloads below and exactly at the limit", async () => {
  for (const payload of [new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3, 4])]) {
    const result = await readBoundedAudio(streamBytes(payload, 2), 4);
    assert.deepEqual([...result], [...payload]);
  }
});

test("bounded audio reader stops at the first chunk above the limit", async () => {
  await assert.rejects(
    readBoundedAudio(streamBytes(new Uint8Array(9), 3), 4),
    AudioPayloadTooLargeError,
  );
});

test("bounded audio reader reports interrupted uploads", async () => {
  const interrupted = new ReadableStream({
    pull(controller) {
      controller.error(new Error("connection interrupted"));
    },
  });
  await assert.rejects(readBoundedAudio(interrupted, 4), /connection interrupted/);
});
