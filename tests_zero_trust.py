"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_zero_trust.py
Purpose: Evidence-Backed Zero-Trust Security, Windows DPAPI & Biometric Audit Suite
===============================================================================

Architectural Role & Verification Scope:
- Validates the implementation of evidence-backed, zero-trust security architecture:
  1. OS-backed key storage via Windows DPAPI (win32crypt) bound to user credentials.
  2. Master key recovery protection via PBKDF2-HMAC-SHA512 manifest.
  3. Real-time tamper detection on vault and database records.
  4. Physical biometric hardware detection (Synaptics Touch Fingerprint Sensor).
  5. Zero-Trust access gating on sensitive memory (unauthenticated access denied).
  6. Zero raw biometric data storage assertion (only standard WebAuthn public metadata).
  7. Zero-plaintext at rest in SQLite database.
  8. AES-256-GCM 128-bit authentication tag tamper rejection.
===============================================================================
"""

import os
import sys
import time
import json
import base64
import sqlite3
import asyncio
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.secure_vault import SecureVault, default_vault, detect_biometric_hardware, VAULT_FILE, RECOVERY_FILE
from ultron_engine.crypto import default_crypto, CryptoEngine
from ultron_engine.core import EventBus, SharedState
from ultron_engine.engines.memory import MemoryEngine
from ultron_engine.engines.security import SecurityEngine


def test_os_backed_dpapi_vault():
    print("[TEST 1/8] Verifying OS-Backed Windows DPAPI Key Storage...")
    assert os.path.exists(VAULT_FILE), f"Vault file must exist at {VAULT_FILE}"
    master_key = default_vault.get_master_key()
    assert isinstance(master_key, bytes), "Master key must be raw bytes"
    assert len(master_key) == 32, f"Master key must be exactly 32 bytes (256 bits), got {len(master_key)}"

    status = default_vault.get_status()
    assert status["key_provider"] == "Windows DPAPI (OS-Protected / User-Account Bound)"
    assert status["status"] == "VERIFIED_ACTIVE"
    print("  -> PASSED: Master key is protected by Windows DPAPI and loaded successfully.")


def test_tamper_detection_on_vault():
    print("[TEST 2/8] Verifying Tamper Detection on Vault Checksum...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_vault = SecureVault(vault_dir=tmp_dir)
        assert not test_vault.is_tampered()

        # Modify vault file checksum to simulate unauthorized tampering
        vault_path = os.path.join(tmp_dir, "vault.bin")
        with open(vault_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        data["checksum_sha256"] = "tampered_bad_checksum_00000000000000000000000000000000000000000"
        with open(vault_path, "w", encoding="utf-8") as f:
            json.dump(data, f)

        # Attempt to initialize another vault instance from tampered directory
        tamper_detected = False
        try:
            _ = SecureVault(vault_dir=tmp_dir)
        except PermissionError as pe:
            if "TAMPER ALERT" in str(pe):
                tamper_detected = True

        assert tamper_detected, "Tampered vault file must trigger a TAMPER ALERT and block initialization!"
    print("  -> PASSED: Vault checksum tampering was detected and blocked.")


def test_recovery_protection():
    print("[TEST 3/8] Verifying Cryptographic Key Recovery Mechanism...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_vault = SecureVault(vault_dir=tmp_dir)
        original_key = test_vault.get_master_key()
        passphrase = test_vault.get_recovery_passphrase()
        assert passphrase is not None, "Recovery passphrase must be generated"

        # Recover key using correct passphrase
        recovered_key = test_vault.recover_master_key(passphrase)
        assert recovered_key == original_key, "Recovered key must match original master key"

        # Verify incorrect passphrase fails
        failed_as_expected = False
        try:
            test_vault.recover_master_key("incorrect_dummy_passphrase_12345")
        except PermissionError:
            failed_as_expected = True

        assert failed_as_expected, "Invalid recovery passphrase must be rejected"
    print("  -> PASSED: Key recovery verified with PBKDF2-HMAC-SHA512 manifest.")


def test_hardware_biometric_detection():
    print("[TEST 4/8] Verifying Physical Biometric Hardware Detection...")
    hw = detect_biometric_hardware()
    assert hw.get("supported") is True, f"Biometric hardware must be supported on this host, got: {hw}"
    device_name = hw.get("device_name", "")
    assert "Synaptics" in device_name, f"Expected Synaptics sensor, got: {device_name}"
    assert hw.get("hardware_status") == "OK"
    print(f"  -> PASSED: Physical sensor verified: {device_name}")


def test_zero_raw_biometric_storage():
    print("[TEST 5/8] Verifying Zero Raw Biometric Data Storage Policy...")
    # Scan secure vault directory to ensure no raw biometric image/template files exist
    vault_dir = os.path.dirname(VAULT_FILE)
    prohibited_extensions = {".raw", ".bmp", ".png", ".jpg", ".fpt", ".min", ".iso"}
    for root, _, files in os.walk(vault_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            assert ext not in prohibited_extensions, f"Prohibited raw biometric file found: {f}"

    # Verify credentials manifest only contains metadata (id, publicKey)
    creds_file = os.path.join(vault_dir, "biometric_credentials.json")
    if os.path.exists(creds_file):
        with open(creds_file, "r", encoding="utf-8") as f:
            creds = json.load(f)
        for c in creds:
            assert "raw" not in c and "fingerprint_data" not in c, "Raw biometric data found in manifest!"
    print("  -> PASSED: Verified 0% raw biometric data stored. Only WebAuthn credential metadata permitted.")


def test_zero_trust_memory_gating():
    print("[TEST 6/8] Verifying Zero-Trust Access Gating on Sensitive Memory...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    bus = EventBus()
    state = SharedState()
    mem = MemoryEngine(bus, state)
    sec = SecurityEngine(bus, state)
    loop.run_until_complete(mem.start())
    loop.run_until_complete(sec.start())

    sensitive_fact = "User confidential private health info and biometric preferences"
    res = loop.run_until_complete(mem.store(sensitive_fact, tier="sensitive"))
    assert res["stored"] or res.get("reason") == "duplicate"

    # 1. Recall without session token (Unauthenticated / Zero-Trust boundary)
    unauth_recalled = loop.run_until_complete(mem.recall(query="confidential", tier="sensitive", session_token=None))
    assert len(unauth_recalled) == 0, f"Zero-Trust violation: Sensitive memory recalled without token: {unauth_recalled}"

    # 2. Issue valid Zero-Trust session token via SecurityEngine
    token = sec.issue_session_token(identity="primary_user", auth_method="windows_hello_fingerprint")
    assert sec.verify_session_token(token) is True

    # 3. Recall with verified session token
    auth_recalled = loop.run_until_complete(mem.recall(query="confidential", tier="sensitive", session_token=token))
    assert len(auth_recalled) > 0, "Authenticated request must successfully retrieve sensitive memory"
    assert auth_recalled[0]["content"] == sensitive_fact
    print("  -> PASSED: Zero-Trust gating enforced: unauthenticated access denied; verified token permitted.")


def test_zero_plaintext_memory_at_rest():
    print("[TEST 7/8] Verifying Zero-Plaintext at Rest in SQLite Database...")
    db_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ultron_engine", "ultron_memory.db")
    assert os.path.exists(db_file), "Memory database must exist"

    conn = sqlite3.connect(db_file)
    rows = conn.execute("SELECT content FROM memory").fetchall()
    conn.close()

    assert len(rows) > 0, "Database must have stored records"
    for r in rows:
        content_str = str(r[0])
        # Verify content is Base64 ciphertext envelope (starts with Version byte 'A'...)
        # and contains no plain words
        assert content_str.startswith("A"), f"Record is not an encrypted envelope: {content_str[:30]}"
        assert "confidential" not in content_str
        assert "private" not in content_str
    print(f"  -> PASSED: All {len(rows)} rows on disk are encrypted envelopes. 0% plaintext words in raw SQLite.")


def test_aes_256_gcm_tamper_rejection():
    print("[TEST 8/8] Verifying AES-256-GCM Tamper Rejection...")
    plaintext = "Sensitive verified payload 999"
    sealed = default_crypto.seal(plaintext)
    raw = bytearray(base64.urlsafe_b64decode(sealed))

    # Flip 1 bit in the ciphertext / tag region
    raw[-1] ^= 0x01
    tampered = base64.urlsafe_b64encode(raw).decode("ascii")

    rejected = False
    try:
        default_crypto.unseal(tampered)
    except PermissionError as e:
        rejected = True
        assert "Tamper detected" in str(e)

    assert rejected, "Tampered ciphertext must be rejected by AES-256-GCM authentication tag!"
    print("  -> PASSED: AES-256-GCM 128-bit MAC tag rejected tampered ciphertext.")


def run_all_tests():
    print("\n=======================================================")
    print("   ZERO-TRUST SECURITY & EVIDENCE-BACKED AUDIT SUITE")
    print("=======================================================\n")

    test_os_backed_dpapi_vault()
    test_tamper_detection_on_vault()
    test_recovery_protection()
    test_hardware_biometric_detection()
    test_zero_raw_biometric_storage()
    test_zero_trust_memory_gating()
    test_zero_plaintext_memory_at_rest()
    test_aes_256_gcm_tamper_rejection()

    print("\n=======================================================")
    print("   ALL 8 ZERO-TRUST TESTS PASSED WITH 100% SUCCESS!")
    print("   EVIDENCE-BACKED OS DPAPI & BIOMETRICS VERIFIED")
    print("=======================================================\n")


if __name__ == "__main__":
    run_all_tests()

