import json
import webview
import time
import threading
import urllib.error
import urllib.request
import subprocess
import sys


def check_server(url):
    try:
        res = urllib.request.urlopen(url, timeout=2)
        return res.status == 200
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"Service check failed for {url}: {exc}")
        return False


def warm_ollama():
    health_url = "http://127.0.0.1:11434/api/tags"
    for _ in range(30):
        try:
            with urllib.request.urlopen(health_url, timeout=2):
                break
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(1)
    else:
        print("Ollama did not become ready; the first chat request may fail.")
        return

    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat",
        data=json.dumps(
            {
                "model": "qwen2.5:0.5b",
                "messages": [{"role": "user", "content": "hi"}],
                "keep_alive": "24h",
                "options": {"num_predict": 1, "temperature": 0},
                "stream": False,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=180):
            print("Ollama model is warm and ready.")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"Ollama model warm-up failed: {exc}")


def ensure_servers():
    # 1. Ollama LLM Service
    if not check_server("http://127.0.0.1:11434"):
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    threading.Thread(target=warm_ollama, name="ollama-warmup", daemon=True).start()

    # 2. STT Server
    if not check_server("http://127.0.0.1:5001/health"):
        subprocess.Popen([sys.executable, "stt_server.py"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 3. Next.js App
    if not check_server("http://localhost:3000"):
        subprocess.Popen(["npx.cmd", "next", "dev", "-p", "3000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Poll until Next.js is responsive
    for _ in range(30):
        if check_server("http://localhost:3000"):
            break
        time.sleep(0.5)

if __name__ == '__main__':
    ensure_servers()

    window = webview.create_window(
        title='U.L.T.R.O.N.',
        url='http://localhost:3000',
        width=1280,
        height=800,
        resizable=True,
        frameless=False,
        easy_drag=True
    )
    webview.start()
