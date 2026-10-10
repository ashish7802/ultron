import html
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional

import webview
import psutil

APP_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent
)
LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", Path.home()))
LOG_DIR = LOCAL_APP_DATA / "ULTRON" / "logs"
JSONL_LOG_PATH = LOG_DIR / "supervisor.jsonl"

STT_HEALTH_URL = "http://127.0.0.1:5001/health"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen2.5:1.5b"
OLLAMA_MODELS_TO_WARM = ["qwen2.5:1.5b", "qwen2.5:0.5b"]
STARTUP_TIMEOUT_SECONDS = 60

owned_processes: list[subprocess.Popen[bytes]] = []
logger = logging.getLogger("ultron")
_supervisor_running = True
_named_mutex_handle = None

def log_event(service: str, event: str, level: str = "INFO", details: Optional[Dict[str, Any]] = None) -> None:
    """Emits structured JSONL logs for production observability."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service": service,
        "event": event,
        "details": details or {},
    }
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with JSONL_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass
    if level == "ERROR":
        logger.error("[%s] %s: %s", service, event, details)
    elif level == "WARNING":
        logger.warning("[%s] %s: %s", service, event, details)
    else:
        logger.info("[%s] %s", service, event)

def acquire_single_instance_lock() -> bool:
    """Guarantees single-instance execution via Windows Named Mutex & PID lock."""
    global _named_mutex_handle
    try:
        import ctypes
        ERROR_ALREADY_EXISTS = 183
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\ULTRON_SUPERVISOR_MUTEX")
        last_error = ctypes.windll.kernel32.GetLastError()
        if last_error == ERROR_ALREADY_EXISTS:
            log_event("supervisor", "duplicate_instance_blocked", "WARNING", {"action": "exit_clean"})
            return False
        _named_mutex_handle = mutex
        return True
    except Exception as e:
        # Fallback to local PID lock
        lock_file = LOG_DIR / "ultron.lock"
        if lock_file.exists():
            try:
                old_pid = int(lock_file.read_text().strip())
                if psutil.pid_exists(old_pid):
                    log_event("supervisor", "duplicate_pid_detected", "WARNING", {"pid": old_pid})
                    return False
            except Exception:
                pass
        try:
            lock_file.parent.mkdir(parents=True, exist_ok=True)
            lock_file.write_text(str(os.getpid()))
        except Exception:
            pass
        return True

def configure_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=LOG_DIR / "desktop.log",
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    log_event("supervisor", "session_initialized", "INFO", {"app_dir": str(APP_DIR)})

def check_server(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False

def start_process(
    name: str,
    command: list[str],
    working_directory: Path,
    log_path: Path,
    environment: dict[str, str] | None = None,
) -> subprocess.Popen[bytes]:
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    with log_path.open("ab") as log_file:
        process = subprocess.Popen(
            command,
            cwd=working_directory,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )
    owned_processes.append(process)
    log_event(name, "process_spawned", "INFO", {"pid": process.pid, "command": command[0]})
    return process

def wait_for_server(url: str, process: subprocess.Popen[bytes], name: str) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if check_server(url):
            log_event(name, "server_healthy", "INFO", {"url": url})
            return
        if process.poll() is not None:
            raise RuntimeError(f"{name} stopped unexpectedly during startup. Check {LOG_DIR}.")
        time.sleep(0.5)
    raise RuntimeError(f"{name} did not become ready within {STARTUP_TIMEOUT_SECONDS}s.")

def choose_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])

def start_ollama() -> None:
    if check_server(OLLAMA_TAGS_URL):
        log_event("ollama", "service_already_running", "INFO")
        return

    ollama = shutil.which("ollama.exe") or shutil.which("ollama")
    if not ollama:
        log_event("ollama", "binary_not_found", "WARNING", {"tip": "Ensure Ollama is installed"})
        return

    start_process("Ollama", [ollama, "serve"], APP_DIR, LOG_DIR / "ollama.log")

def warm_ollama() -> None:
    deadline = time.monotonic() + 30
    available_models = set()
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
            available_models = {
                model.get("name")
                for model in data.get("models", [])
                if isinstance(model, dict)
            }
            if OLLAMA_MODEL in available_models or "qwen2.5:0.5b" in available_models:
                break
        except Exception:
            time.sleep(1)

    for model_name in OLLAMA_MODELS_TO_WARM:
        if model_name not in available_models:
            continue
        try:
            req = urllib.request.Request(
                OLLAMA_CHAT_URL,
                data=json.dumps({
                    "model": model_name,
                    "messages": [{"role": "user", "content": "hi"}],
                    "keep_alive": "24h",
                    "options": {"num_predict": 1, "temperature": 0},
                    "stream": False,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                log_event("ollama", "model_warmed", "INFO", {"model": model_name})
        except Exception as e:
            log_event("ollama", "warmup_skipped", "WARNING", {"model": model_name, "error": str(e)})

def find_python() -> str:
    venv_python = APP_DIR / ".venv" / "Scripts" / "python.exe"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable

def ensure_stt() -> subprocess.Popen[bytes]:
    if check_server(STT_HEALTH_URL):
        log_event("stt_core", "stt_already_online", "INFO")
        return owned_processes[0] if owned_processes else None

    python_executable = find_python()
    stt_script = APP_DIR / "stt_server.py"
    process = start_process(
        "ULTRON Core Service",
        [python_executable, str(stt_script)],
        APP_DIR,
        LOG_DIR / "stt.log",
    )
    wait_for_server(STT_HEALTH_URL, process, "ULTRON Core Service")
    return process

def ensure_next_app() -> str:
    port = choose_port()
    url = f"http://127.0.0.1:{port}"
    server_js = APP_DIR / ".next" / "standalone" / "server.js"
    if server_js.exists():
        node = shutil.which("node.exe") or shutil.which("node")
        if not node:
            raise RuntimeError("Node.js runtime not found.")
        command = [node, str(server_js)]
        working_directory = server_js.parent
    else:
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            raise RuntimeError("npm is required to run the Next.js frontend in development mode.")
        command = [npm, "run", "dev", "--", "--port", str(port)]
        working_directory = APP_DIR

    environment = os.environ.copy()
    environment["HOSTNAME"] = "127.0.0.1"
    environment["PORT"] = str(port)
    process = start_process(
        "ULTRON desktop UI",
        command,
        working_directory,
        LOG_DIR / "server.log",
        environment,
    )
    wait_for_server(url, process, "ULTRON desktop UI")
    return url

def supervisor_health_loop() -> None:
    """Supervises backend services with auto-restart & exponential backoff."""
    backoff = 1.0
    while _supervisor_running:
        time.sleep(5.0)
        # Check STT / Core service
        if not check_server(STT_HEALTH_URL, timeout=3.0):
            log_event("supervisor", "stt_unhealthy", "WARNING", {"backoff": backoff})
            try:
                time.sleep(backoff)
                ensure_stt()
                backoff = 1.0
                log_event("supervisor", "stt_recovered", "INFO")
            except Exception as e:
                backoff = min(16.0, backoff * 2.0)
                log_event("supervisor", "stt_restart_failed", "ERROR", {"error": str(e), "next_backoff": backoff})

def stop_owned_processes() -> None:
    global _supervisor_running
    _supervisor_running = False
    log_event("supervisor", "clean_shutdown_started", "INFO")

    # Clean removal of PID lock
    try:
        lock_file = LOG_DIR / "ultron.lock"
        if lock_file.exists():
            lock_file.unlink()
    except Exception:
        pass

    for process in reversed(owned_processes):
        if process.poll() is not None:
            continue
        try:
            # Terminate full process tree on Windows
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True)
            log_event("supervisor", "process_tree_terminated", "INFO", {"pid": process.pid})
        except Exception:
            try:
                process.terminate()
                process.wait(timeout=3)
            except Exception:
                process.kill()
    log_event("supervisor", "shutdown_complete", "INFO")

def show_startup_error(error: Exception) -> None:
    log_event("supervisor", "startup_fatal_error", "ERROR", {"error": str(error)})
    message = html.escape(str(error))
    log_path = html.escape(str(LOG_DIR / "desktop.log"))
    webview.create_window(
        "ULTRON Startup Error",
        html=(
            "<html><body style='font:16px Segoe UI;padding:24px;background:#111;color:#eee'>"
            "<h2 style='color:#ef4444'>ULTRON could not start</h2>"
            f"<p>{message}</p><p style='color:#888'>Log: {log_path}</p>"
            "</body></html>"
        ),
        width=620,
        height=260,
        resizable=False,
    )
    webview.start(gui="edgechromium")

def main() -> None:
    configure_logging()
    
    # 1. Single-instance check
    if not acquire_single_instance_lock():
        print("ULTRON is already running. Exiting duplicate instance.", flush=True)
        return

    # 2. Start local services
    start_ollama()
    threading.Thread(target=warm_ollama, name="ollama-warmup", daemon=True).start()
    
    try:
        ensure_stt()
        url = ensure_next_app()
        
        # Start background health supervisor
        threading.Thread(target=supervisor_health_loop, name="supervisor-health", daemon=True).start()
        
        webview.create_window(
            title="U.L.T.R.O.N.",
            url=url,
            width=1280,
            height=800,
            resizable=True,
            frameless=False,
        )
        webview.start(gui="edgechromium")
    except Exception as error:
        show_startup_error(error)
    finally:
        stop_owned_processes()

if __name__ == "__main__":
    main()
