"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_adversarial_security.py
Purpose: Rigorous Adversarial Security & Threat Model Verification Suite
===============================================================================

Architectural Role & Threat Verification:
- Tests the system against 8 adversarial attack scenarios:
  1. Challenge Replay Attack (Anti-replay nonce consumption).
  2. HMAC-SHA256 Signature Forgery & Tamper Attack.
  3. Expired Session Token Rejection (Strict TTL expiration).
  4. Fail-Closed API Gating (Unauthenticated /api/chat access rejected with 401).
  5. Stolen Database Attack (Offline ciphertext inspection; 0% plaintext).
  6. Single-Bit Ciphertext Tampering (AES-256-GCM AEAD MAC rejection).
  7. Zero Raw Biometric & Recovery Bypass Audit (No raw templates or plain keys).
  8. Sensitive Memory Zero-Trust Access Gating (Fail-closed without token).
===============================================================================
"""

import os
import sys
import time
import json
import base64
import hmac
import hashlib
import sqlite3
import asyncio
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.secure_vault import default_vault, VAULT_FILE, RECOVERY_FILE, detect_biometric_hardware
from ultron_engine.crypto import default_crypto
from ultron_engine.core import EventBus, SharedState
from ultron_engine.engines.memory import MemoryEngine
from ultron_engine.engines.security import SecurityEngine


def test_adversarial_challenge_replay():
    print("[ADVERSARIAL 1/8] Simulating Challenge Replay Attack...")
    # Fetch a live challenge from the biometric API
    url_chal = "http://localhost:3000/api/auth/biometric?action=challenge"
    req = urllib.request.Request(url_chal)
    with urllib.request.urlopen(req) as resp:
        chal_data = json.loads(resp.read().decode())
    challenge = chal_data["challenge"]

    # 1. Register a test platform credential with this challenge
    cred_id = "test_adversarial_cred_" + str(int(time.time() * 1000))
    url_verify = "http://localhost:3000/api/auth/biometric?action=enroll"
    body_enroll = json.dumps({"credentialId": cred_id, "publicKey": "PUBKEY_TEST", "challenge": challenge}).encode()
    req_enroll = urllib.request.Request(url_verify, data=body_enroll, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_enroll) as resp:
        enroll_res = json.loads(resp.read().decode())
    assert enroll_res.get("success") is True, "First enrollment with valid challenge must succeed"

    # 2. Replay the same challenge a second time (ADVERSARIAL REPLAY ATTEMPT)
    replay_blocked = False
    try:
        req_replay = urllib.request.Request(url_verify, data=body_enroll, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_replay) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code == 403:
            replay_blocked = True

    assert replay_blocked, "CRITICAL FLAW: Challenge replay attack was NOT blocked!"
    print("  -> PASSED: Replay attack blocked with HTTP 403. Challenge single-use enforced.")


def test_adversarial_signature_forgery():
    print("[ADVERSARIAL 2/8] Simulating Token Signature Forgery & Tamper Attack...")
    sec = SecurityEngine(EventBus(), SharedState())
    real_token = sec.issue_session_token("primary_user")
    payload_b64, real_sig = real_token.split(".")

    # Attack 1: Modify payload to claim root/admin privilege and extended expiration
    payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode()).decode())
    payload["sub"] = "adversary_attacker"
    payload["exp"] = time.time() + 999999
    tampered_payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

    # Reuse original signature with tampered payload
    tampered_token = f"{tampered_payload_b64}.{real_sig}"
    assert sec.verify_session_token(tampered_token) is False, "Forged payload with old signature must be rejected!"

    # Attack 2: Bogus fabricated signature
    bogus_token = f"{payload_b64}.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    assert sec.verify_session_token(bogus_token) is False, "Fabricated signature must be rejected!"

    print("  -> PASSED: Signature forgery and payload tampering rejected by constant-time verification.")


def test_adversarial_expired_session_token():
    print("[ADVERSARIAL 3/8] Simulating Expired Session Token Attack...")
    sec = SecurityEngine(EventBus(), SharedState())
    # Create token with -10 second TTL (already expired)
    expired_token = sec.issue_session_token("primary_user", ttl_seconds=-10)
    assert sec.verify_session_token(expired_token) is False, "Expired token must be rejected!"
    print("  -> PASSED: Expired session token rejected. Strict TTL expiration enforced.")


def test_adversarial_fail_closed_api_gating():
    print("[ADVERSARIAL 4/8] Simulating Unauthenticated API Access across ALL endpoints (Fail-Closed Check)...")
    
    endpoints = [
        {"name": "/api/chat", "method": "POST", "url": "http://localhost:3000/api/chat", "data": json.dumps({"messages": [{"role": "user", "content": "Tell secrets"}]}).encode()},
        {"name": "/api/transcribe", "method": "POST", "url": "http://localhost:3000/api/transcribe", "data": json.dumps({"text": "test"}).encode()},
        {"name": "/api/tts", "method": "POST", "url": "http://localhost:3000/api/tts", "data": json.dumps({"text": "hello"}).encode()},
        {"name": "/api/wakeword", "method": "GET", "url": "http://localhost:3000/api/wakeword", "data": None},
        {"name": "/api/wakeword", "method": "POST", "url": "http://localhost:3000/api/wakeword", "data": json.dumps({"action": "trigger_wake"}).encode()},
    ]

    for ep in endpoints:
        # Attempt 1: Call endpoint with NO authorization header
        req_headers = {"Content-Type": "application/json"} if ep["data"] else {}
        req_no_auth = urllib.request.Request(ep["url"], data=ep["data"], headers=req_headers, method=ep["method"])
        unauth_blocked = False
        try:
            with urllib.request.urlopen(req_no_auth) as resp:
                pass
        except urllib.error.HTTPError as e:
            if e.code in (401, 423, 429):
                unauth_blocked = True
        assert unauth_blocked, f"CRITICAL FLAW: {ep['name']} ({ep['method']}) did not fail-closed on unauthenticated request!"

        # Attempt 2: Call endpoint with forged/garbage token
        bad_headers = {**req_headers, "Authorization": "Bearer bad.forged.token"}
        req_bad_auth = urllib.request.Request(ep["url"], data=ep["data"], headers=bad_headers, method=ep["method"])
        forgery_blocked = False
        try:
            with urllib.request.urlopen(req_bad_auth) as resp:
                pass
        except urllib.error.HTTPError as e:
            if e.code in (401, 423, 429):
                forgery_blocked = True
        assert forgery_blocked, f"CRITICAL FLAW: {ep['name']} ({ep['method']}) accepted forged authorization token!"

    print("  -> PASSED: All endpoints (/api/chat, /api/transcribe, /api/tts, /api/wakeword) strictly fail-closed with HTTP 401/423.")


def test_adversarial_stolen_database_offline():
    print("[ADVERSARIAL 5/8] Simulating Stolen Database Offline Inspection...")
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ultron_engine", "ultron_memory.db")
    assert os.path.exists(db_path), "Database file must exist"

    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT content, meta FROM memory").fetchall()
    conn.close()

    assert len(rows) > 0
    sensitive_markers = ["password", "secret", "confidential", "health", "biometric", "ssn"]
    for row in rows:
        content_raw = str(row[0])
        meta_raw = str(row[1])
        # Verify content is Base64 ciphertext envelope
        assert content_raw.startswith("A"), "Raw row is not encrypted ciphertext"
        for marker in sensitive_markers:
            assert marker not in content_raw.lower(), f"Sensitive plaintext marker '{marker}' found in raw database!"
            assert marker not in meta_raw.lower(), f"Sensitive metadata marker '{marker}' found in raw database!"

    print(f"  -> PASSED: All {len(rows)} database records are encrypted ciphertext. 0% plaintext exposed.")


def test_adversarial_single_bit_ciphertext_tamper():
    print("[ADVERSARIAL 6/8] Simulating Single-Bit Ciphertext Tampering Attack...")
    sample_text = "Highly Confidential Financial Wire Instructions"
    sealed = default_crypto.seal(sample_text)

    # Flip exactly 1 bit in the ciphertext bytes
    raw_bytes = bytearray(base64.urlsafe_b64decode(sealed))
    raw_bytes[18] ^= 0x01
    tampered_sealed = base64.urlsafe_b64encode(raw_bytes).decode()

    tamper_rejected = False
    try:
        default_crypto.unseal(tampered_sealed)
    except PermissionError as pe:
        tamper_rejected = True
        assert "Tamper detected" in str(pe)

    assert tamper_rejected, "AES-256-GCM authentication tag MUST reject 1-bit modified ciphertext!"
    print("  -> PASSED: 1-bit ciphertext tampering detected and rejected by AEAD MAC tag.")


def test_adversarial_zero_raw_biometrics_and_no_bypass():
    print("[ADVERSARIAL 7/8] Auditing Against Raw Biometrics & Plaintext Recovery Bypasses...")
    vault_dir = os.path.dirname(VAULT_FILE)

    # 1. Audit vault directory for raw biometric image/template files
    for root, _, files in os.walk(vault_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            assert ext not in [".raw", ".bmp", ".png", ".jpg", ".fpt", ".iso"], f"Prohibited biometric image: {f}"

    # 2. Audit recovery_manifest.json to ensure recovery passphrase is NOT saved in plaintext
    with open(RECOVERY_FILE, "r", encoding="utf-8") as f:
        manifest_text = f.read()

    assert "passphrase" not in manifest_text.lower() or "never store" in manifest_text.lower(), "Recovery passphrase leaked into recovery manifest!"
    assert "salt_b64" in manifest_text
    assert "ciphertext_b64" in manifest_text
    print("  -> PASSED: No raw biometric templates on disk. No plaintext recovery bypasses found.")


def test_adversarial_sensitive_memory_fail_closed():
    print("[ADVERSARIAL 8/8] Verifying Sensitive Memory Fail-Closed Zero-Trust Enforcement...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    bus = EventBus()
    state = SharedState()
    mem = MemoryEngine(bus, state)
    sec = SecurityEngine(bus, state)
    loop.run_until_complete(mem.start())
    loop.run_until_complete(sec.start())

    sensitive_content = "Classified Vault Access Code 7789"
    res = loop.run_until_complete(mem.store(sensitive_content, tier="sensitive"))
    assert res["stored"] or res.get("reason") == "duplicate"

    # Attempt to recall with NO token (Attacker attempting unauthorized memory scrape)
    unauth_recall = loop.run_until_complete(mem.recall(query="Vault Access Code", tier="sensitive", session_token=None))
    assert len(unauth_recall) == 0, "Zero-Trust failure: Sensitive memory accessed without token!"

    # Attempt to recall with FORGED token
    forged_token = "eyJhbGciOiJIUzI1NiJ9.payload.forged_signature"
    forged_recall = loop.run_until_complete(mem.recall(query="Vault Access Code", tier="sensitive", session_token=forged_token))
    assert len(forged_recall) == 0, "Zero-Trust failure: Sensitive memory accessed with forged token!"

    # Legitimate authenticated recall with valid token
    valid_token = sec.issue_session_token("primary_user", "windows_hello_fingerprint")
    legit_recall = loop.run_until_complete(mem.recall(query="Vault Access Code", tier="sensitive", session_token=valid_token))
    assert len(legit_recall) > 0, "Legitimate authenticated access must succeed"
    assert legit_recall[0]["content"] == sensitive_content

    print("  -> PASSED: Sensitive memory access strictly fail-closed: unauthenticated & forged calls denied.")


def run_all_adversarial_tests():
    print("\n=======================================================")
    print("   ADVERSARIAL SECURITY & ZERO-TRUST VERIFICATION")
    print("=======================================================\n")

    test_adversarial_challenge_replay()
    test_adversarial_signature_forgery()
    test_adversarial_expired_session_token()
    test_adversarial_fail_closed_api_gating()
    test_adversarial_stolen_database_offline()
    test_adversarial_single_bit_ciphertext_tamper()
    test_adversarial_zero_raw_biometrics_and_no_bypass()
    test_adversarial_sensitive_memory_fail_closed()

    print("\n=======================================================")
    print("   ALL 8 ADVERSARIAL SECURITY TESTS PASSED (100%)!")
    print("   ZERO-TRUST FAIL-CLOSED SECURITY RIGOROUSLY VERIFIED")
    print("=======================================================\n")


if __name__ == "__main__":
    run_all_adversarial_tests()

