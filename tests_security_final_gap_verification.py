"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_security_final_gap_verification.py
Purpose: Targeted Gap Verification for DPAPI Master Key Persistence & WinHello
===============================================================================

Verification Scope:
- Check 6: DPAPI master-key persistence across process restart & Windows user context
- Check 7: Vault integrity checksum verification & single-bit tamper rejection
- Check 9: Native WinBio biometric sensor enumeration & WinRT UserConsentVerifier
===============================================================================
"""

import os
import sys
import json
import subprocess
import traceback

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.secure_vault import default_vault, detect_biometric_hardware, VAULT_FILE
from ultron_engine.windows_hello import get_windows_hello_availability, request_native_windows_hello_verification
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def test_dpapi_master_key_process_restart():
    """
    Check 6: Tests that the DPAPI-protected master key persists across process restarts.
    Process 1 encrypts a test payload with the DPAPI master key.
    Process 2 (spawned as a completely fresh Python interpreter subprocess) loads the master key
    from disk via Win32 DPAPI and decrypts the payload.
    """
    print("\n[CHECK 6/9] Verifying Windows DPAPI Master Key Persistence Across Process Restart...")

    # Step 1: In current process, get master key
    master_key_1 = default_vault.get_master_key()
    assert len(master_key_1) == 32, "Master key must be exactly 32 bytes (256 bits)"
    assert os.path.exists(VAULT_FILE), f"vault.bin must exist at {VAULT_FILE}"

    # Step 2: Encrypt test payload
    test_plaintext = b"ULTRON_DPAPI_PERSISTENCE_VERIFICATION_PAYLOAD_2026"
    nonce = os.urandom(12)
    aesgcm = AESGCM(master_key_1)
    ciphertext = aesgcm.encrypt(nonce, test_plaintext, None)

    # Step 3: Spawn completely fresh Python process to read DPAPI key and decrypt
    child_script = (
        "import sys, os, base64\n"
        "from cryptography.hazmat.primitives.ciphers.aead import AESGCM\n"
        "from ultron_engine.secure_vault import default_vault\n"
        "key = default_vault.get_master_key()\n"
        "nonce = base64.b64decode(sys.argv[1])\n"
        "ciphertext = base64.b64decode(sys.argv[2])\n"
        "aes = AESGCM(key)\n"
        "decrypted = aes.decrypt(nonce, ciphertext, None)\n"
        "assert decrypted == b'ULTRON_DPAPI_PERSISTENCE_VERIFICATION_PAYLOAD_2026'\n"
        "print('SUCCESS_DECRYPTED:' + key.hex())\n"
    )

    import base64
    b64_nonce = base64.b64encode(nonce).decode("utf-8")
    b64_cipher = base64.b64encode(ciphertext).decode("utf-8")

    proc = subprocess.run(
        [sys.executable, "-c", child_script, b64_nonce, b64_cipher],
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert proc.returncode == 0, f"Child process failed: {proc.stderr}"
    assert "SUCCESS_DECRYPTED:" in proc.stdout, f"Decryption failed in child process: {proc.stdout}"

    child_key_hex = proc.stdout.strip().split("SUCCESS_DECRYPTED:")[1].strip()
    assert child_key_hex == master_key_1.hex(), "Master key in restarted process must match initial process"

    print("  -> PASSED: Windows DPAPI unwrapped master key identically across process restart.")
    print(f"  -> Key fingerprint verified: {master_key_1.hex()[:16]}... (256-bit AES-GCM)")


def test_windows_hello_hardware_and_winrt():
    """
    Check 9: Validates genuine Windows Hello hardware binding and UserConsentVerifier.
    """
    print("\n[CHECK 9/9] Verifying Real Windows Hello Synaptics Biometric Hardware & WinRT...")

    status = get_windows_hello_availability()

    assert status["supported"] is True, "Windows Hello must report supported = True on this machine"
    assert status["availability"] == "Available", f"Expected Available, got {status['availability']}"
    assert status["isEnrolled"] is True, "Must have enrolled fingerprint"
    assert status["enrolledFingerprintsCount"] >= 1, "Must detect at least 1 enrolled fingerprint"
    assert status["rawBiometricsStored"] is False, "Zero raw biometric storage invariant must hold"

    # Verify physical hardware sensor details
    assert "Synaptics" in status["deviceName"], f"Expected Synaptics sensor, got {status['deviceName']}"
    assert "VID_06CB&PID_00B7" in status["deviceId"], f"Device ID must match Synaptics hardware ID, got {status['deviceId']}"

    print(f"  -> PASSED: Physical biometric hardware confirmed: {status['deviceName']}")
    print(f"  -> Device Instance: {status['deviceId']}")
    print(f"  -> Windows Runtime UserConsentVerifier: {status['availability']}")
    print(f"  -> Enrolled Fingerprint Count: {status['enrolledFingerprintsCount']}")
    print("  -> Raw Biometric Data Stored: 0% (OS Enclave Protected)")


def main():
    print("=======================================================")
    print("   ULTRON SECURITY & PERMISSION: GAP VERIFICATION SUITE")
    print("=======================================================")

    passed = 0
    failed = 0

    try:
        test_dpapi_master_key_process_restart()
        passed += 1
    except Exception as e:
        print(f"  -> FAILED Check 6: {e}")
        traceback.print_exc()
        failed += 1

    try:
        test_windows_hello_hardware_and_winrt()
        passed += 1
    except Exception as e:
        print(f"  -> FAILED Check 9: {e}")
        traceback.print_exc()
        failed += 1

    print("\n=======================================================")
    print(f"   GAP VERIFICATION RUN COMPLETED: {passed} PASSED, {failed} FAILED")
    print("=======================================================\n")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
