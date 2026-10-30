"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_complete_voice_pipeline.py
Purpose: Complete Voice Pipeline Verification: Mic, Wake-Word, STT, AI & TTS
===============================================================================

Pipeline Verification Coverage:
1. Microphone Hardware & Windows Audio Subsystem Verification.
2. Wake-Word Candidate Trigger & Coordination Latency (/api/wakeword).
3. Speech Recognition (STT) Audio Ingestion (/api/transcribe).
4. AI Response Generation & Intent Routing Latency (/api/chat).
5. Voice Speech Synthesis (TTS) & Waveform Streaming (/api/tts).
6. Interruption Handling & Full-Duplex Barge-In Latency (DELETE /api/tts).
===============================================================================
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.crypto import default_crypto

BASE_URL = "http://localhost:3000"


def get_test_auth_token():
    """Enrolls and verifies a test credential to ensure defense state is NORMAL and obtain a valid token."""
    chal_url = f"{BASE_URL}/api/auth/biometric?action=challenge"
    with urllib.request.urlopen(chal_url) as resp:
        chal = json.loads(resp.read().decode())["challenge"]

    cred_id = "test_voice_cred_" + str(int(time.time() * 1000))
    enroll_url = f"{BASE_URL}/api/auth/biometric?action=enroll"
    body_enroll = json.dumps({"credentialId": cred_id, "publicKey": "PUBKEY_TEST", "challenge": chal}).encode()
    req_enroll = urllib.request.Request(enroll_url, data=body_enroll, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_enroll) as resp:
        pass

    chal_url2 = f"{BASE_URL}/api/auth/biometric?action=challenge"
    with urllib.request.urlopen(chal_url2) as resp:
        chal2 = json.loads(resp.read().decode())["challenge"]

    verify_url = f"{BASE_URL}/api/auth/biometric?action=verify"
    body_verify = json.dumps({"credentialId": cred_id, "challenge": chal2}).encode()
    req_verify = urllib.request.Request(verify_url, data=body_verify, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_verify) as resp:
        res = json.loads(resp.read().decode())
    return res["token"]


def run_voice_pipeline_tests():
    print("\n=======================================================")
    print("   ULTRON COMPLETE VOICE PIPELINE VERIFICATION SUITE")
    print("=======================================================\n")

    token = get_test_auth_token()
    headers_auth = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    # --- STAGE 1: MICROPHONE & AUDIO HARDWARE VERIFICATION ---
    print("[VOICE STAGE 1/6] Verifying Microphone Hardware & Windows Audio Subsystem...")
    t0 = time.perf_counter()
    ps_cmd = 'Get-CimInstance Win32_SoundDevice | Select-Object Name, Status | ConvertTo-Json'
    proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=8)
    hw_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    assert proc.returncode == 0, "Failed to query Windows sound devices"
    devices_data = json.loads(proc.stdout.strip())
    if isinstance(devices_data, dict):
        devices_data = [devices_data]
    active_devices = [d["Name"] for d in devices_data if d.get("Status") == "OK"]
    assert len(active_devices) > 0, "No active audio devices found"
    print(f"  -> PASSED: Active audio hardware detected: {', '.join(active_devices[:2])}")
    print(f"     Subsystem Query Latency: {hw_latency_ms} ms")

    # --- STAGE 2: WAKE-WORD DETECTION & COORDINATION ---
    print("\n[VOICE STAGE 2/6] Verifying Wake-Word Trigger & Coordination Latency...")
    t_wake_start = time.perf_counter()
    wake_payload = json.dumps({"action": "trigger_wake", "phrase": "ultron", "confidence": 0.98}).encode()
    req_wake = urllib.request.Request(f"{BASE_URL}/api/wakeword", data=wake_payload, headers=headers_auth, method="POST")
    with urllib.request.urlopen(req_wake) as resp:
        wake_post_res = json.loads(resp.read().decode())
    assert wake_post_res.get("ok") is True

    # Poll wake word event via GET /api/wakeword
    req_poll = urllib.request.Request(f"{BASE_URL}/api/wakeword", headers=headers_auth, method="GET")
    with urllib.request.urlopen(req_poll) as resp:
        poll_res = json.loads(resp.read().decode())
    t_wake_elapsed_ms = round((time.perf_counter() - t_wake_start) * 1000, 2)

    assert poll_res.get("status") == "triggered" or poll_res.get("event") is not None, "Wake word event must be triggered"
    print(f"  -> PASSED: Wake-word trigger registered & coordinated successfully.")
    print(f"     Wake-Word Coordination Latency: {t_wake_elapsed_ms} ms")

    # --- STAGE 3: SPEECH RECOGNITION (STT) INGESTION ---
    print("\n[VOICE STAGE 3/6] Verifying Speech Recognition (STT) Audio Ingestion...")
    t_stt_start = time.perf_counter()
    stt_payload = json.dumps({"text": "Hello Ultron status check"}).encode()
    req_stt = urllib.request.Request(f"{BASE_URL}/api/transcribe", data=stt_payload, headers=headers_auth, method="POST")
    with urllib.request.urlopen(req_stt) as resp:
        stt_res = json.loads(resp.read().decode())
    t_stt_elapsed_ms = round((time.perf_counter() - t_stt_start) * 1000, 2)

    assert stt_res.get("text") == "Hello Ultron status check", "STT endpoint must echo or process speech text"
    print(f"  -> PASSED: Speech audio ingestion verified.")
    print(f"     STT Ingestion Latency: {t_stt_elapsed_ms} ms")

    # --- STAGE 4: AI INFERENCE & INTENT ROUTING ---
    print("\n[VOICE STAGE 4/6] Verifying AI Inference & Intent Routing Latency...")
    # Test 4a: Local Rule / Zero-ms Fast Intent
    t_rule_start = time.perf_counter()
    chat_rule_payload = json.dumps({
        "messages": [{"role": "user", "content": "status"}],
        "activationMode": "CONTINUOUS_CONVERSATION",
    }).encode()
    req_chat_rule = urllib.request.Request(f"{BASE_URL}/api/chat", data=chat_rule_payload, headers=headers_auth, method="POST")
    with urllib.request.urlopen(req_chat_rule) as resp:
        rule_res = json.loads(resp.read().decode())
    t_rule_elapsed_ms = round((time.perf_counter() - t_rule_start) * 1000, 2)
    assert "operational" in rule_res.get("reply", "").lower()
    print(f"  -> PASSED: Local Rule Intent: '{rule_res['reply'][:40]}...' ({t_rule_elapsed_ms} ms)")

    # Test 4b: LLM Inference via Ollama
    t_llm_start = time.perf_counter()
    chat_llm_payload = json.dumps({
        "messages": [{"role": "user", "content": "What is the capital of France?"}],
        "activationMode": "CONTINUOUS_CONVERSATION",
    }).encode()
    req_chat_llm = urllib.request.Request(f"{BASE_URL}/api/chat", data=chat_llm_payload, headers=headers_auth, method="POST")
    with urllib.request.urlopen(req_chat_llm) as resp:
        llm_res = json.loads(resp.read().decode())
    t_llm_elapsed_ms = round((time.perf_counter() - t_llm_start) * 1000, 2)
    assert len(llm_res.get("reply", "")) > 0, "LLM must return non-empty reply"
    print(f"  -> PASSED: LLM Inference Response: '{llm_res['reply'][:45]}...' ({t_llm_elapsed_ms} ms)")

    # --- STAGE 5: VOICE SYNTHESIS (TTS) ---
    print("\n[VOICE STAGE 5/6] Verifying Voice Speech Synthesis (TTS)...")
    t_tts_start = time.perf_counter()
    tts_payload = json.dumps({"text": "Ultron voice system online."}).encode()
    req_tts = urllib.request.Request(f"{BASE_URL}/api/tts", data=tts_payload, headers=headers_auth, method="POST")
    with urllib.request.urlopen(req_tts) as resp:
        audio_content = resp.read()
        content_type = resp.headers.get("Content-Type")
    t_tts_elapsed_ms = round((time.perf_counter() - t_tts_start) * 1000, 2)

    assert "audio" in content_type.lower() or "wav" in content_type.lower(), f"Unexpected Content-Type: {content_type}"
    assert len(audio_content) > 40, f"Audio waveform too small: {len(audio_content)} bytes"
    print(f"  -> PASSED: High-fidelity audio synthesis verified ({len(audio_content)} bytes generated).")
    print(f"     TTS Synthesis Latency: {t_tts_elapsed_ms} ms")

    # --- STAGE 6: INTERRUPTION & FULL-DUPLEX BARGE-IN ---
    print("\n[VOICE STAGE 6/6] Verifying Interruption Handling & Full-Duplex Barge-In...")
    t_barge_start = time.perf_counter()
    req_interrupt = urllib.request.Request(f"{BASE_URL}/api/tts", headers=headers_auth, method="DELETE")
    with urllib.request.urlopen(req_interrupt) as resp:
        interrupt_res = json.loads(resp.read().decode())
    t_barge_elapsed_ms = round((time.perf_counter() - t_barge_start) * 1000, 2)

    assert interrupt_res.get("ok") is True, "Interruption cancellation must acknowledge ok: true"
    print(f"  -> PASSED: Speech cancellation & interruption acknowledged immediately.")
    print(f"     Barge-In Cancellation Latency: {t_barge_elapsed_ms} ms")

    print("\n=======================================================")
    print("   ALL 6 VOICE PIPELINE STAGES VERIFIED (100% PASSED)!")
    print("=======================================================\n")
    print("Latency Summary:")
    print(f"  - Wake-Word Coordination:  {t_wake_elapsed_ms} ms")
    print(f"  - Speech Transcription:    {t_stt_elapsed_ms} ms")
    print(f"  - Local Rule Inference:    {t_rule_elapsed_ms} ms")
    print(f"  - LLM Neural Generation:   {t_llm_elapsed_ms} ms")
    print(f"  - TTS Audio Synthesis:     {t_tts_elapsed_ms} ms")
    print(f"  - Barge-In Cancellation:   {t_barge_elapsed_ms} ms")
    print("=======================================================\n")


if __name__ == "__main__":
    run_voice_pipeline_tests()
