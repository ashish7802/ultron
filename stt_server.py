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
from urllib.parse import urlparse, parse_qs
from faster_whisper import WhisperModel

from ultron_memory import UltronMemory
from ultron_tools import ToolRegistry
from ultron_planner import UltronPlanner

for output_stream in (sys.stdout, sys.stderr):
    if hasattr(output_stream, "reconfigure"):
        output_stream.reconfigure(errors="backslashreplace")

print("[ULTRON BACKEND] Initializing offline Whisper STT & System Core...", flush=True)
try:
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    print("[ULTRON BACKEND] Whisper STT & System Core ready on http://127.0.0.1:5001", flush=True)
except Exception as e:
    print(f"[ULTRON BACKEND ERROR] Error loading Whisper model: {e}", flush=True)
    sys.exit(1)

model_lock = threading.Lock()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class STTHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ['/', '/health']:
            self.respond_json({
                'status': 'ok',
                'service': 'ultron-backend',
                'model': 'whisper-tiny',
                'tools_active': True,
                'memory_active': True,
            })
            return

        elif path == '/system/diagnostics':
            diag = ToolRegistry.get_system_diagnostics()
            self.respond_json(diag)
            return

        elif path == '/memory/facts':
            params = parse_qs(parsed.query)
            cat = params.get('category', [None])[0]
            facts = UltronMemory.list_facts(cat)
            self.respond_json({'status': 'success', 'facts': facts})
            return

        else:
            self.respond_json({'error': 'Not Found'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 1. Transcribe Endpoint (Whisper STT with Hindi/Hinglish tuning)
        if path == '/transcribe':
            request_started = time.perf_counter()
            content_length = int(self.headers.get('Content-Length', 0))
            audio_bytes = self.rfile.read(content_length)

            if not audio_bytes or len(audio_bytes) < 1000:
                self.respond_json({'text': ''})
                return

            tmp_path = None
            text = ""
            try:
                try:
                    data, samplerate = sf.read(io.BytesIO(audio_bytes))
                    max_vol = np.max(np.abs(data)) if len(data) > 0 else 0
                    if max_vol < 0.01:
                        self.respond_json({'text': ''})
                        return
                except Exception:
                    pass

                with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name

                with model_lock:
                    # initial_prompt guides Whisper for Hinglish/Hindi spoken queries
                    segments, info = model.transcribe(
                        tmp_path,
                        beam_size=1,
                        vad_filter=True,
                        initial_prompt="Hindi, English, Hinglish: Ultron jarvis voice command"
                    )
                    text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])

                print(f"[STT RECOGNIZED] text='{text}' audio={info.duration:.2f}s elapsed={time.perf_counter() - request_started:.2f}s", flush=True)

            except Exception as e:
                print(f"[STT ERROR] {e}", flush=True)
                self.respond_json({'error': 'Transcription failed'}, status=500)
                return
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass

            self.respond_json({'text': text})
            return

        # Read JSON body for API endpoints
        content_length = int(self.headers.get('Content-Length', 0))
        body = {}
        if content_length > 0:
            try:
                body = json.loads(self.rfile.read(content_length).decode('utf-8'))
            except Exception:
                self.respond_json({'error': 'Invalid JSON body'}, status=400)
                return

        # 2. Memory endpoints
        if path == '/memory/save':
            key = body.get('key')
            val = body.get('value')
            cat = body.get('category', 'general')
            tags = body.get('tags', '')
            if not key or not val:
                self.respond_json({'error': 'key and value are required'}, status=400)
                return
            res = UltronMemory.save_fact(key, val, cat, tags)
            self.respond_json(res)
            return

        elif path == '/memory/search':
            query = body.get('query', '')
            limit = int(body.get('limit', 5))
            res = UltronMemory.search_memories(query, limit)
            self.respond_json(res)
            return

        elif path == '/memory/delete':
            key = body.get('key')
            if not key:
                self.respond_json({'error': 'key is required'}, status=400)
                return
            deleted = UltronMemory.delete_fact(key)
            self.respond_json({'status': 'success' if deleted else 'not_found', 'key': key})
            return

        elif path == '/memory/reset':
            confirm = body.get('confirm', False)
            if not confirm:
                self.respond_json({'error': 'Explicit confirm: true required to reset memory'}, status=400)
                return
            res = UltronMemory.reset_all_memories()
            self.respond_json(res)
            return

        elif path == '/memory/record_turn':
            sess = body.get('session_id', 'default')
            role = body.get('role', 'user')
            content = body.get('content', '')
            summary = body.get('summary', '')
            UltronMemory.record_conversation(sess, role, content, summary)
            # Also run selective fact extraction
            if role == 'user':
                fact = UltronMemory.selective_fact_extraction(content)
                if fact:
                    UltronMemory.save_fact(fact['key'], fact['value'], fact['category'])
            self.respond_json({'status': 'recorded'})
            return

        # 3. Dedicated Tool Execution endpoint
        elif path == '/tools/execute':
            tool_name = body.get('tool')
            params = body.get('params', {})
            confirm_token = body.get('confirm_token')

            if tool_name == 'system_diagnostics':
                self.respond_json(ToolRegistry.get_system_diagnostics())
            elif tool_name == 'launch_app':
                app = params.get('app_name', '')
                self.respond_json(ToolRegistry.launch_application(app))
            elif tool_name == 'close_app':
                app = params.get('app_name', '')
                self.respond_json(ToolRegistry.close_application(app, confirm_token))
            elif tool_name == 'search_files':
                pattern = params.get('query_pattern', '')
                base_dir = params.get('base_dir')
                self.respond_json(ToolRegistry.search_files(pattern, base_dir))
            elif tool_name == 'read_file':
                path = params.get('file_path', '')
                self.respond_json(ToolRegistry.read_file(path))
            elif tool_name == 'write_file':
                path = params.get('file_path', '')
                content = params.get('content', '')
                mode = params.get('mode', 'write')
                self.respond_json(ToolRegistry.write_file(path, content, mode, confirm_token))
            elif tool_name == 'delete_file':
                path = params.get('file_path', '')
                self.respond_json(ToolRegistry.delete_file(path, confirm_token))
            elif tool_name == 'run_command':
                cmd = params.get('command', '')
                cwd = params.get('cwd')
                self.respond_json(ToolRegistry.run_developer_command(cmd, cwd))
            else:
                self.respond_json({'error': f'Unknown tool: {tool_name}'}, status=400)
            return

        # 4. Agent Planner endpoint
        elif path == '/agent/plan':
            goal = body.get('goal', '')
            workspace = body.get('workspace')
            if not goal:
                self.respond_json({'error': 'goal is required'}, status=400)
                return
            planner = UltronPlanner(goal, workspace)
            report = planner.execute_plan()
            self.respond_json(report)
            return

        self.respond_json({'error': 'Not Found'}, status=404)

    def respond_json(self, data, status=200):
        try:
            self.send_response(status)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as exc:
            pass

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    server = ThreadedHTTPServer(('127.0.0.1', 5001), STTHandler)
    server.serve_forever()
