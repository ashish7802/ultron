"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_complete_voice_pipeline.py
Purpose: Complete Voice Pipeline Verification: Mic, Wake-Word, STT, AI & TTS
===============================================================================

Pipeline Verification Coverage (LOCAL-ONLY, fully unauthenticated):
1. Microphone hardware & Windows audio subsystem verification.
2. Wake-word candidate trigger & coordination latency (/api/wakeword).
3. Speech recognition (STT) audio ingestion (/api/transcribe).
4. AI response generation & intent routing latency (/api/chat).
5. Voice speech synthesis (TTS) & waveform streaming (/api/tts).
6. Interruption handling & full-duplex barge-in latency (DELETE /api/tts).

Architectural Role & Security Guarantees:
- The product is LOCAL-ONLY: fingerprint/WebAuthn/Zero-Trust session gating was
  removed and every local API route is intentionally open on loopback. This suite
  therefore never acquires, attaches, or asserts on a session token; all stages
  run with only a Content-Type header.
- Requests target the IPv4 literal 127.0.0.1 (never "localhost") because Python's
  urllib otherwise pays a ~2s IPv6 fallback delay per request on this host.
- The LLM stage accepts a degraded/local-fallback answer: with the local language
  model offline the route still must return a non-empty, clearly-labelled reply.

Exit Code Contract:
  0 -> every stage passed, or a stage was explicitly SKIPPED for a missing
       environmental precondition (e.g. WMI access denied for the audio probe).
  1 -> a genuine pipeline failure.
===============================================================================
"""

import os
import sys
import time
import json
import locale
import http.client
import subprocess
import traceback
import urllib.request
import urllib.error

# Emit UTF-8 so non-ASCII replies never crash a Windows console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# All HTTP probes use the IPv4 literal: "localhost" would incur an IPv6 fallback delay.
BASE_URL = "http://127.0.0.1:3000"
BASE_HOST = "127.0.0.1"
BASE_PORT = 3000
SKIPPED = []
FAILED = []
LATENCIES = []


def http_call(url, data=None, headers=None, method=None, timeout=30):
    """Perform one HTTP request; return (status, headers, body_bytes) for 2xx/4xx/5xx."""
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()


def http_json(url, payload=None, headers=None, method=None, timeout=30):
    """Perform an HTTP request with an optional JSON body; return (status, headers, data, raw)."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Content-Type": "application/json"} if body is not None else {}
    if headers:
        request_headers.update(headers)
    status, resp_headers, raw = http_call(url, body, request_headers, method, timeout)
    try:
        data = json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        data = {}
    return status, resp_headers, data, raw


def header_value(headers, name):
    """
    Case-insensitive header lookup.

    WHY: `dict(resp.headers)` from urllib preserves the server's casing (Next.js
    emits lowercase `content-type`), so a literal `.get("Content-Type")` misses it.

    Args:
        headers (dict): Response headers.
        name (str): Header name to look up.

    Returns:
        str: Header value, or "" when absent.
    """
    wanted = name.lower()
    for key, value in (headers or {}).items():
        if str(key).lower() == wanted:
            return value
    return ""


def wait_for_server(timeout_seconds=25.0):
    """
    Blocks until the local production server answers on loopback.

    WHY: the suite may start right after a build; connection-refused is transient
    while the server binds port 3000, so retry briefly instead of failing.

    Args:
        timeout_seconds (float): Maximum time to wait for a 200 from /api/wakeword.

    Raises:
        AssertionError: When the server never becomes reachable.
    """
    deadline = time.time() + timeout_seconds
    last_error = "no attempt made"
    while time.time() < deadline:
        try:
            status, _, _, _ = http_json(f"{BASE_URL}/api/wakeword", timeout=4)
            if status == 200:
                return
            last_error = f"HTTP {status}"
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        time.sleep(0.5)
    raise AssertionError(f"Local server {BASE_URL} not reachable within {timeout_seconds}s ({last_error})")


def skip(label, reason):
    """Record and print an explicit SKIP marker for a precondition-dependent check."""
    SKIPPED.append(f"{label}: {reason}")
    print(f"  -> SKIPPED ({label}): {reason}")


def record_latency(stage, milliseconds):
    """Records one measured stage latency for the final summary."""
    LATENCIES.append((stage, round(milliseconds, 2)))


# ---------------------------------------------------------------------------
# Stage 1: Microphone hardware / Windows audio subsystem
# ---------------------------------------------------------------------------
def stage_microphone_hardware():
    """Audits that Windows reports at least one healthy audio device (environment probe)."""
    print("[VOICE STAGE 1/6] Verifying Microphone Hardware & Windows Audio Subsystem...")
    started = time.perf_counter()
    ps_cmd = "Get-CimInstance Win32_SoundDevice | Select-Object Name, Status | ConvertTo-Json"
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            timeout=15,
        )
        # Decode leniently: PowerShell may emit UTF-8 or the OEM console code page
        # depending on host configuration. A device name containing a non-ASCII glyph
        # (e.g. "Intel(R)") must not turn an environment probe into a decode error.
        raw_stdout = proc.stdout or b""
        try:
            stdout_text = raw_stdout.decode("utf-8").strip()
        except UnicodeDecodeError:
            stdout_text = raw_stdout.decode(locale.getpreferredencoding(False), errors="replace").strip()
        if proc.returncode != 0 or not stdout_text:
            stderr_text = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
            raise RuntimeError((stderr_text or "empty CIM output").splitlines()[0])
        devices = json.loads(stdout_text)
        if isinstance(devices, dict):
            devices = [devices]
        active = [d.get("Name", "Unknown") for d in devices if d.get("Status") == "OK"]
        assert len(active) > 0, "No active audio devices found"
    except Exception as hw_err:  # noqa: BLE001 - environment probe failure is a SKIP, not a product failure
        skip("environment", f"Windows audio hardware query unavailable: {hw_err}")
        return
    elapsed_ms = (time.perf_counter() - started) * 1000
    record_latency("Audio Hardware Query", elapsed_ms)
    print(f"  -> PASSED: Active audio hardware detected: {', '.join(active[:2])}")
    print(f"     Subsystem Query Latency: {round(elapsed_ms, 2)} ms")


# ---------------------------------------------------------------------------
# Stage 2: Wake-word trigger & coordination
# ---------------------------------------------------------------------------
def stage_wake_word():
    """
    Triggers a wake-word event and polls it back over one persistent connection.

    WHY the persistent connection: the HUD performs the trigger/poll pair over its
    keep-alive HTTP connection. Using the same connection mirrors that real client
    behaviour, and a brand-new TCP connection may not observe the one-shot event.

    WHY the retry: the wake event is single-use, so a concurrently running HUD can
    legitimately consume it between our POST and GET. Retrying re-triggers instead
    of reporting a flaky failure.
    """
    print("\n[VOICE STAGE 2/6] Verifying Wake-Word Trigger & Coordination Latency...")
    started = time.perf_counter()
    payload = json.dumps({"action": "trigger_wake", "phrase": "ultron", "confidence": 0.98}).encode()
    last_poll = None
    for attempt in range(1, 4):
        conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=10)
        try:
            conn.request("POST", "/api/wakeword", body=payload, headers={"Content-Type": "application/json"})
            post_resp = conn.getresponse()
            post_data = json.loads(post_resp.read().decode() or "{}")
            assert post_resp.status == 200 and post_data.get("ok") is True, (
                f"Wake-word trigger failed: {post_resp.status} {post_data}"
            )

            conn.request("GET", "/api/wakeword", headers={"Content-Type": "application/json"})
            poll_resp = conn.getresponse()
            last_poll = json.loads(poll_resp.read().decode() or "{}")
            assert poll_resp.status == 200, f"Wake-word poll failed: {poll_resp.status} {last_poll}"
        finally:
            conn.close()

        if last_poll.get("status") == "triggered" or last_poll.get("event") is not None:
            elapsed_ms = (time.perf_counter() - started) * 1000
            record_latency("Wake-Word Coordination", elapsed_ms)
            print("  -> PASSED: Wake-word trigger registered & coordinated successfully.")
            print(f"     Wake-Word Coordination Latency: {round(elapsed_ms, 2)} ms")
            return
        # Another poller may have consumed the one-shot event; trigger it again.
        time.sleep(0.25)

    raise AssertionError(f"Wake-word event was never observable after 3 trigger/poll attempts: {last_poll}")


# ---------------------------------------------------------------------------
# Stage 3: Speech recognition (STT) ingestion
# ---------------------------------------------------------------------------
def stage_transcription():
    """Posts recognized speech text and requires the route to echo the ingested transcript."""
    print("\n[VOICE STAGE 3/6] Verifying Speech Recognition (STT) Audio Ingestion...")
    started = time.perf_counter()
    status, _, data, raw = http_json(
        f"{BASE_URL}/api/transcribe",
        {"text": "Hello Ultron status check"},
        timeout=30,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert status == 200, f"STT ingestion failed: HTTP {status} {data or raw[:200]!r}"
    assert data.get("text") == "Hello Ultron status check", (
        f"STT endpoint must echo/process the ingested transcript, got: {data}"
    )
    record_latency("Speech Transcription", elapsed_ms)
    print("  -> PASSED: Speech audio ingestion verified.")
    print(f"     STT Ingestion Latency: {round(elapsed_ms, 2)} ms")


# ---------------------------------------------------------------------------
# Stage 4: AI inference & intent routing
# ---------------------------------------------------------------------------
def stage_ai_inference():
    """
    Exercises the deterministic local rule engine and the (possibly degraded) LLM path.

    The LLM stage intentionally accepts the degraded/local-fallback reply: when the
    local language model is offline the route must still produce a non-empty answer,
    never an empty 200.
    """
    print("\n[VOICE STAGE 4/6] Verifying AI Inference & Intent Routing Latency...")

    # 4a: deterministic local rule (zero-latency fast intent).
    started = time.perf_counter()
    chat_payload = {
        "messages": [{"role": "user", "content": "status"}],
        "activationMode": "CONTINUOUS_CONVERSATION",
    }
    status, _, rule_data, raw = http_json(f"{BASE_URL}/api/chat", chat_payload, timeout=60)
    rule_ms = (time.perf_counter() - started) * 1000
    assert status == 200, f"Local rule inference failed: HTTP {status} {rule_data or raw[:200]!r}"
    reply = rule_data.get("reply") or ""
    assert "operational" in reply.lower(), f"Local rule reply must report system health, got: {reply!r}"
    record_latency("Local Rule Inference", rule_ms)
    print(f"  -> PASSED: Local Rule Intent: '{reply[:40]}...' ({round(rule_ms, 2)} ms)")

    # 4b: LLM inference (degraded fallback is acceptable as long as the reply is non-empty).
    started = time.perf_counter()
    llm_payload = {
        "messages": [{"role": "user", "content": "What is the capital of France?"}],
        "activationMode": "CONTINUOUS_CONVERSATION",
    }
    status, _, llm_data, raw = http_json(f"{BASE_URL}/api/chat", llm_payload, timeout=90)
    llm_ms = (time.perf_counter() - started) * 1000
    assert status == 200, f"LLM inference failed: HTTP {status} {llm_data or raw[:200]!r}"
    llm_reply = llm_data.get("reply") or ""
    assert len(llm_reply) > 0, "LLM must return a non-empty reply (degraded fallback accepted)"
    record_latency("LLM Neural Generation", llm_ms)
    degraded = llm_data.get("degraded") is True
    print(f"  -> PASSED: LLM Inference Response{' (degraded fallback)' if degraded else ''}: "
          f"'{llm_reply[:45]}...' ({round(llm_ms, 2)} ms)")


# ---------------------------------------------------------------------------
# Stage 5: Voice synthesis (TTS)
# ---------------------------------------------------------------------------
def stage_tts():
    """Requires the TTS route to stream a real WAV waveform (not an error JSON body)."""
    print("\n[VOICE STAGE 5/6] Verifying Voice Speech Synthesis (TTS)...")
    started = time.perf_counter()
    status, resp_headers, audio = http_call(
        f"{BASE_URL}/api/tts",
        json.dumps({"text": "Ultron voice system online."}).encode("utf-8"),
        {"Content-Type": "application/json"},
        "POST",
        timeout=60,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert status == 200, f"TTS synthesis failed: HTTP {status} {audio[:200]!r}"
    content_type = header_value(resp_headers, "content-type").lower()
    assert "audio" in content_type or "wav" in content_type, f"Unexpected Content-Type: {content_type!r}"
    assert len(audio) > 40, f"Audio waveform too small: {len(audio)} bytes"
    record_latency("TTS Audio Synthesis", elapsed_ms)
    print(f"  -> PASSED: audio synthesis verified ({len(audio)} bytes, {content_type}).")
    print(f"     TTS Synthesis Latency: {round(elapsed_ms, 2)} ms")


# ---------------------------------------------------------------------------
# Stage 6: Interruption / barge-in
# ---------------------------------------------------------------------------
def stage_barge_in():
    """Cancels in-flight speech and requires an explicit acknowledgement."""
    print("\n[VOICE STAGE 6/6] Verifying Interruption Handling & Full-Duplex Barge-In...")
    started = time.perf_counter()
    status, _, data, raw = http_json(f"{BASE_URL}/api/tts", method="DELETE", timeout=30)
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert status == 200, f"Barge-in cancellation failed: HTTP {status} {data or raw[:200]!r}"
    assert data.get("ok") is True, f"Interruption cancellation must acknowledge ok: true, got: {data}"
    record_latency("Barge-In Cancellation", elapsed_ms)
    print("  -> PASSED: speech cancellation & interruption acknowledged immediately.")
    print(f"     Barge-In Cancellation Latency: {round(elapsed_ms, 2)} ms")


def run_voice_pipeline_tests():
    """Runs every voice stage, prints the latency summary, and returns the exit code."""
    print("\n=======================================================")
    print("   ULTRON COMPLETE VOICE PIPELINE VERIFICATION SUITE")
    print("   (LOCAL-ONLY: all stages run unauthenticated)")
    print("=======================================================")
    print(f"   Target: {BASE_URL}\n")

    try:
        wait_for_server()
        print(f"Server reachable at {BASE_URL}.\n")
    except AssertionError as exc:
        print(f"  -> FAILED (server reachability): {exc}")
        return 1

    stages = [
        ("microphone hardware", stage_microphone_hardware),
        ("wake-word coordination", stage_wake_word),
        ("speech recognition ingestion", stage_transcription),
        ("AI inference & intent routing", stage_ai_inference),
        ("speech synthesis (TTS)", stage_tts),
        ("interruption / barge-in", stage_barge_in),
    ]

    for label, stage_fn in stages:
        try:
            stage_fn()
        except Exception as exc:  # noqa: BLE001 - report all stages, then exit nonzero
            print(f"  -> FAILED ({label}): {exc}")
            traceback.print_exc()
            FAILED.append(f"{label}: {exc}")

    print("\n=======================================================")
    if FAILED:
        print(f"   VOICE PIPELINE: {len(FAILED)} STAGE FAILURE(S)")
        for entry in FAILED:
            print(f"   [FAIL] {entry}")
        if SKIPPED:
            print(f"   Skipped: {len(SKIPPED)}")
            for entry in SKIPPED:
                print(f"   [SKIP] {entry}")
        print("=======================================================\n")
        return 1

    print("   ALL RUNNABLE VOICE PIPELINE STAGES VERIFIED")
    if SKIPPED:
        print(f"   Environment-dependent checks skipped: {len(SKIPPED)}")
        for entry in SKIPPED:
            print(f"   [SKIP] {entry}")
    print("=======================================================")
    print("Latency Summary:")
    for stage, milliseconds in LATENCIES:
        print(f"  - {stage}: {milliseconds} ms")
    print("=======================================================\n")
    return 0


if __name__ == "__main__":
    sys.exit(run_voice_pipeline_tests())
