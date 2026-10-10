from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import json
import os
import tempfile
import sys
import threading
import time
import numpy as np
import soundfile as sf
import io
from faster_whisper import WhisperModel

for output_stream in (sys.stdout, sys.stderr):
    if hasattr(output_stream, "reconfigure"):
        output_stream.reconfigure(errors="backslashreplace")

print("[STT SERVER] Initializing local offline STT Engine (Whisper Tiny)...", flush=True)
try:
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    print("[STT SERVER] STT Engine Ready on http://127.0.0.1:5001", flush=True)
except Exception as e:
    print(f"[STT SERVER ERROR] Error loading Whisper model: {e}", flush=True)
    sys.exit(1)

model_lock = threading.Lock()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class STTHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/transcribe':
            request_started = time.perf_counter()
            content_length = int(self.headers.get('Content-Length', 0))
            audio_bytes = self.rfile.read(content_length)

            if not audio_bytes or len(audio_bytes) < 1000:
                print(
                    f"[STT TIMING] bytes={len(audio_bytes)} result=empty "
                    f"elapsed={time.perf_counter() - request_started:.2f}s",
                    flush=True,
                )
                self.respond_json({'text': ''})
                return

            tmp_path = None
            text = ""
            try:
                try:
                    data, samplerate = sf.read(io.BytesIO(audio_bytes))
                    max_vol = np.max(np.abs(data)) if len(data) > 0 else 0
                    if max_vol < 0.01:
                        print(
                            f"[STT TIMING] bytes={len(audio_bytes)} result=quiet "
                            f"elapsed={time.perf_counter() - request_started:.2f}s",
                            flush=True,
                        )
                        self.respond_json({'text': ''})
                        return
                except Exception:
                    pass

                with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name

                with model_lock:
                    segments, info = model.transcribe(tmp_path, beam_size=1, vad_filter=True)
                    text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])

                print(
                    f"[STT TIMING] bytes={len(audio_bytes)} "
                    f"audio={info.duration:.2f}s elapsed={time.perf_counter() - request_started:.2f}s",
                    flush=True,
                )
                if text:
                    print(
                        f"[STT RECOGNIZED] characters={len(text)}",
                        flush=True,
                    )

            except Exception as e:
                elapsed = time.perf_counter() - request_started
                print(
                    f"[STT ERROR] {type(e).__name__}: {e} "
                    f"elapsed={elapsed:.2f}s",
                    flush=True,
                )
                self.respond_json(
                    {'error': 'Local speech transcription failed.'},
                    status=500,
                )
                return
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except:
                        pass

            self.respond_json({'text': text})
        else:
            self.send_response(404)
            self.end_headers()

    def respond_json(self, data, status=200):
        try:
            self.send_response(status)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as exc:
            print(
                f"[STT CLIENT] Disconnected before response: {type(exc).__name__}",
                flush=True,
            )

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    server = ThreadedHTTPServer(('127.0.0.1', 5001), STTHandler)
    server.serve_forever()
