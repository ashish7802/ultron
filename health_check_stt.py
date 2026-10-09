import json
import urllib.error
import urllib.request

HEALTH_URL = "http://127.0.0.1:5001/healthz"

try:
    with urllib.request.urlopen(HEALTH_URL, timeout=5) as response:
        status = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or status.get("status") != "ok":
            raise RuntimeError(f"Unexpected STT health response: {status}")
        print("STT server is ready:", status)
except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
    raise SystemExit(f"STT server is unavailable: {exc}") from exc
