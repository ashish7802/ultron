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
from pathlib import Path

import webview


APP_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent
)
LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", Path.home()))
LOG_DIR = LOCAL_APP_DATA / "ULTRON" / "logs"
STT_HEALTH_URL = "http://127.0.0.1:5001/health"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen2.5:1.5b"
OLLAMA_MODELS_TO_WARM = ["qwen2.5:1.5b", "qwen2.5:0.5b"]
STARTUP_TIMEOUT_SECONDS = 60
owned_processes: list[subprocess.Popen[bytes]] = []
logger = logging.getLogger("ultron")


def configure_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=LOG_DIR / "desktop.log",
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )


def check_server(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
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
    logger.info("Started %s with PID %s", name, process.pid)
    return process


def wait_for_server(url: str, process: subprocess.Popen[bytes], name: str) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if check_server(url):
            logger.info("%s is ready at %s", name, url)
            return
        if process.poll() is not None:
            raise RuntimeError(
                f"{name} stopped during startup. See {LOG_DIR / 'server.log'}."
            )
        time.sleep(0.5)
    raise RuntimeError(f"{name} did not start within {STARTUP_TIMEOUT_SECONDS} seconds.")


def choose_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def start_ollama() -> None:
    if check_server(OLLAMA_TAGS_URL):
        return

    ollama = shutil.which("ollama.exe") or shutil.which("ollama")
    if not ollama:
        logger.warning("Ollama is not installed or is not available on PATH.")
        return

    start_process(
        "Ollama",
        [ollama, "serve"],
        APP_DIR,
        LOG_DIR / "ollama.log",
    )


def warm_ollama() -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
            available_models = {
                model.get("name")
                for model in data.get("models", [])
                if isinstance(model, dict)
            }
            if OLLAMA_MODEL not in available_models:
                logger.warning("Ollama model %s is not installed.", OLLAMA_MODEL)
                return
            break
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            time.sleep(1)
    else:
        logger.warning("Ollama did not become ready; voice chat may be unavailable.")
        return

    for model_name in OLLAMA_MODELS_TO_WARM:
        if model_name not in available_models:
            continue
        req = urllib.request.Request(
            OLLAMA_CHAT_URL,
            data=json.dumps(
                {
                    "model": model_name,
                    "messages": [{"role": "user", "content": "hi"}],
                    "keep_alive": "24h",
                    "options": {"num_predict": 1, "temperature": 0},
                    "stream": False,
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180):
                logger.info("Ollama model %s is warm and ready.", model_name)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("Ollama model %s warm-up failed: %s", model_name, exc)


def ensure_stt() -> None:
    if check_server(STT_HEALTH_URL):
        return

    stt_executable = APP_DIR / "stt_server" / "stt_server.exe"
    stt_script = APP_DIR / "stt_server.py"
    if not stt_script.is_file():
        stt_script = Path(r"C:\Users\Ashish\Documents\spiderman\stt_server.py")

    launched = False
    if getattr(sys, "frozen", False) and stt_executable.is_file():
        try:
            command = [str(stt_executable)]
            working_directory = stt_executable.parent
            process = start_process(
                "local transcription service",
                command,
                working_directory,
                LOG_DIR / "stt.log",
            )
            wait_for_server(STT_HEALTH_URL, process, "Local transcription service")
            launched = True
        except Exception as exc:
            logger.warning("Bundled stt_server.exe could not start (%s), falling back to python script", exc)

    if not launched:
        if not stt_script.is_file():
            raise RuntimeError(f"The transcription service is missing: {stt_script}")
        command = [sys.executable, str(stt_script)]
        working_directory = stt_script.parent
        process = start_process(
            "local transcription service",
            command,
            working_directory,
            LOG_DIR / "stt.log",
        )
        wait_for_server(STT_HEALTH_URL, process, "Local transcription service")



def ensure_next_app() -> str:
    port = choose_port()
    url = f"http://127.0.0.1:{port}"
    bundled_server = APP_DIR / "server" / "server.js"
    source_server = APP_DIR / ".next" / "standalone" / "server.js"

    if bundled_server.is_file():
        server_script = bundled_server
        working_directory = bundled_server.parent
        node_executable = APP_DIR / "node" / "node.exe"
        if not node_executable.is_file():
            node_on_path = shutil.which("node.exe") or shutil.which("node")
            if not node_on_path:
                raise RuntimeError("The bundled Node.js runtime is missing.")
            node_executable = Path(node_on_path)
        command = [str(node_executable), str(server_script)]
    elif source_server.is_file():
        standalone_dir = source_server.parent
        static_source = standalone_dir.parent / "static"
        if not static_source.is_dir():
            raise RuntimeError(f"The production UI assets are missing: {static_source}")
        shutil.copytree(
            static_source,
            standalone_dir / ".next" / "static",
            dirs_exist_ok=True,
        )
        public_source = APP_DIR / "public"
        if public_source.is_dir():
            shutil.copytree(
                public_source,
                standalone_dir / "public",
                dirs_exist_ok=True,
            )

        node_on_path = shutil.which("node.exe") or shutil.which("node")
        if not node_on_path:
            raise RuntimeError("Node.js is required to run the desktop app.")
        server_script = source_server
        working_directory = source_server.parent
        command = [node_on_path, str(server_script)]
    else:
        next_cli = APP_DIR / "node_modules" / "next" / "dist" / "bin" / "next"
        node_on_path = shutil.which("node.exe") or shutil.which("node")
        if not node_on_path or not next_cli.is_file():
            raise RuntimeError("Build the app first by running npm run build.")
        working_directory = APP_DIR
        command = [
            node_on_path,
            str(next_cli),
            "dev",
            "--hostname",
            "127.0.0.1",
            "--port",
            str(port),
        ]

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


def stop_owned_processes() -> None:
    for process in reversed(owned_processes):
        if process.poll() is not None:
            continue
        try:
            process.terminate()
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        except OSError:
            logger.exception("Failed to stop process %s", process.pid)


def show_startup_error(error: Exception) -> None:
    logger.exception("ULTRON could not start", exc_info=error)
    message = html.escape(str(error))
    log_path = html.escape(str(LOG_DIR / "desktop.log"))
    webview.create_window(
        "ULTRON startup error",
        html=(
            "<html><body style='font:16px Segoe UI;padding:24px'>"
            "<h2>ULTRON could not start</h2>"
            f"<p>{message}</p><p>Startup log: {log_path}</p>"
            "</body></html>"
        ),
        width=620,
        height=260,
        resizable=False,
    )
    webview.start(gui="edgechromium")


def main() -> None:
    configure_logging()
    start_ollama()
    threading.Thread(target=warm_ollama, name="ollama-warmup", daemon=True).start()
    try:
        ensure_stt()
        url = ensure_next_app()
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
