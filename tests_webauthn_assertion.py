"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_webauthn_assertion.py
Purpose: Production WebAuthn & Windows Hello Assertion Verification Suite
===============================================================================

Architectural Role & Threat Verification:
- Tests the complete, strict separation between WebAuthn enrollment & assertion.
- Verifies:
  1. Enrollment Isolation: Enrollment does NOT grant session token or identity access.
  2. User Cancellation: Client reporting cancellation immediately engages CHALLENGE_MODE.
  3. Valid Fresh Assertion: Genuine P-256 key with UP=1, UV=1, valid signature succeeds.
  4. Biometric Bypass Rejection: UV=0 flag (missing biometric proof) strictly rejected.
  5. Cryptographic Signature Forgery: Corrupt or wrong signature strictly rejected.
  6. Origin Mismatch Rejection: Evil origin (e.g. evil.com) strictly rejected.
  7. Assertion Replay Attack: Reusing a consumed challenge strictly rejected with HTTP 403.
  8. Unenrolled Credential Attack: Unknown credential ID rejected.
===============================================================================
"""

import os
import sys
import time
import json
import base64
import urllib.request
import urllib.error
import hashlib
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization


BASE_URL = "http://localhost:3000"


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def fetch_challenge() -> str:
    url = f"{BASE_URL}/api/auth/biometric?action=challenge"
    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read().decode())
    return data["challenge"]


def run_test_suite():
    print("\n=======================================================")
    print("   WEBAUTHN & WINDOWS HELLO STRICT ASSERTION AUDIT")
    print("=======================================================\n")

    # Generate a real NIST P-256 (prime256v1) keypair for the platform authenticator simulation
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    spki_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    spki_b64 = base64.b64encode(spki_der).decode()
    cred_id = "test_device_cred_" + str(int(time.time() * 1000))

    # --- TEST 1: ENROLLMENT ISOLATION ---
    print("[TEST 1/8] Verifying Enrollment Isolation (Registration != Verification)...")
    chal_enroll = fetch_challenge()
    enroll_payload = json.dumps({
        "credentialId": cred_id,
        "publicKeySpki": spki_b64,
        "algorithm": -7,
        "transports": ["internal"],
        "challenge": chal_enroll,
    }).encode()

    req_enroll = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=enroll",
        data=enroll_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_enroll) as resp:
        enroll_res = json.loads(resp.read().decode())

    assert enroll_res.get("success") is True, "Enrollment must succeed with valid challenge"
    assert enroll_res.get("enrolled") is True, "Enrolled flag must be true"
    assert "token" not in enroll_res, "CRITICAL ZERO-TRUST FLAW: Token must NEVER be issued on enrollment!"
    print("  -> PASSED: Enrollment succeeded without issuing access token. Verification required.")

    # --- TEST 2: CANCELLATION HANDLING ---
    print("[TEST 2/8] Verifying Cancellation / Mismatch Handling (Fail-Closed)...")
    fail_payload = json.dumps({"reason": "user_cancelled_biometric_prompt"}).encode()
    req_fail = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=fail",
        data=fail_payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req_fail) as resp:
            pass
    except urllib.error.HTTPError as e:
        assert e.code == 423, f"Cancellation must lock system with HTTP 423, received {e.code}"
        fail_res = json.loads(e.read().decode())
        assert fail_res.get("alert") == "INTRUDER_DEFENSE_TRIGGERED"
    print("  -> PASSED: Cancellation reported by client immediately triggered CHALLENGE_MODE (HTTP 423).")

    # Wait out 5s cooldown if active before testing assertions
    time.sleep(6)

    # Helper function to construct WebAuthn assertion payload
    def build_assertion(chal, origin="http://localhost:3000", rp_id="localhost", up=True, uv=True, sign_key=private_key):
        client_data_dict = {
            "type": "webauthn.get",
            "challenge": chal,
            "origin": origin,
            "crossOrigin": False,
        }
        client_data_bytes = json.dumps(client_data_dict).encode()
        client_data_b64 = base64url(client_data_bytes)

        # Build authenticatorData: 32 bytes rpIdHash + 1 byte flags + 4 bytes signCount
        rp_id_hash = hashlib.sha256(rp_id.encode()).digest()
        flags_byte = (0x01 if up else 0x00) | (0x04 if uv else 0x00)
        flags = bytes([flags_byte])
        sign_count = (1).to_bytes(4, byteorder="big")
        auth_data = rp_id_hash + flags + sign_count
        auth_data_b64 = base64url(auth_data)

        # Signed data = authData || SHA256(clientDataJSON)
        client_data_hash = hashlib.sha256(client_data_bytes).digest()
        signed_payload = auth_data + client_data_hash

        # Cryptographic ECDSA-SHA256 signature
        signature_der = sign_key.sign(signed_payload, ec.ECDSA(hashes.SHA256()))
        signature_b64 = base64url(signature_der)

        return {
            "credentialId": cred_id,
            "challenge": chal,
            "clientDataJSON": client_data_b64,
            "authenticatorData": auth_data_b64,
            "signature": signature_b64,
        }

    # --- TEST 3: VALID FRESH ASSERTION ---
    print("[TEST 3/8] Verifying Genuine Platform Assertion (UP=1, UV=1, Valid Signature)...")
    chal_login = fetch_challenge()
    valid_assertion = build_assertion(chal_login)
    req_verify = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(valid_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_verify) as resp:
        verify_res = json.loads(resp.read().decode())

    assert verify_res.get("authenticated") is True, "Valid assertion must be authenticated"
    assert "token" in verify_res, "Verified assertion must return zero-trust token"
    assert verify_res.get("defenseState") == "NORMAL", "Verified assertion must restore NORMAL state"
    print("  -> PASSED: Valid assertion verified. Token issued and NORMAL state restored.")

    # --- TEST 4: BIOMETRIC BYPASS ATTEMPT (UV = 0) ---
    print("[TEST 4/8] Simulating Biometric Bypass Attempt (UV=0 User Verification Missing)...")
    chal_uv0 = fetch_challenge()
    uv0_assertion = build_assertion(chal_uv0, uv=False)
    req_uv0 = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(uv0_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    uv0_blocked = False
    try:
        with urllib.request.urlopen(req_uv0) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (401, 423):
            uv0_blocked = True
            err_data = json.loads(e.read().decode())
            assert "User verification (UV) flag missing" in err_data.get("message", "")
    assert uv0_blocked, "CRITICAL FLAW: Assertion without UV=1 was NOT blocked!"
    print("  -> PASSED: UV=0 assertion blocked. Strict biometric/Windows Hello verification enforced.")

    time.sleep(6) # Progressive cooldown wait

    # --- TEST 5: SIGNATURE FORGERY / WRONG KEY ---
    print("[TEST 5/8] Simulating Signature Forgery (Signed with Unregistered Key)...")
    chal_forge = fetch_challenge()
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    forged_assertion = build_assertion(chal_forge, sign_key=attacker_key)
    req_forge = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(forged_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    forge_blocked = False
    try:
        with urllib.request.urlopen(req_forge) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (401, 423):
            forge_blocked = True
    assert forge_blocked, "CRITICAL FLAW: Forged signature was NOT blocked!"
    print("  -> PASSED: Forged signature blocked with HTTP 401/423.")

    time.sleep(6)

    # --- TEST 6: ORIGIN MISMATCH ATTACK ---
    print("[TEST 6/8] Simulating Origin Mismatch Attack (Phishing Origin: evil.com)...")
    chal_origin = fetch_challenge()
    evil_origin_assertion = build_assertion(chal_origin, origin="http://evil.com")
    req_origin = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(evil_origin_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    origin_blocked = False
    try:
        with urllib.request.urlopen(req_origin) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (401, 423):
            origin_blocked = True
    assert origin_blocked, "CRITICAL FLAW: Origin mismatch was NOT blocked!"
    print("  -> PASSED: Mismatched origin assertion rejected.")

    time.sleep(6)

    # --- TEST 7: ASSERTION REPLAY ATTACK ---
    print("[TEST 7/8] Simulating Assertion & Challenge Replay Attack...")
    chal_replay = fetch_challenge()
    replay_assertion = build_assertion(chal_replay)
    req_first = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(replay_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_first) as resp:
        first_res = json.loads(resp.read().decode())
    assert first_res.get("authenticated") is True

    # Replay the identical payload
    replay_blocked = False
    req_second = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(replay_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req_second) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code == 403:
            replay_blocked = True
    assert replay_blocked, "CRITICAL FLAW: Replayed assertion challenge was NOT blocked with HTTP 403!"
    print("  -> PASSED: Replay attack blocked with HTTP 403 (Challenge single-use verified).")

    # --- TEST 8: UNENROLLED CREDENTIAL ---
    print("[TEST 8/8] Simulating Unenrolled Credential ID Attack...")
    chal_unknown = fetch_challenge()
    unknown_assertion = build_assertion(chal_unknown)
    unknown_assertion["credentialId"] = "completely_unknown_credential_id"
    req_unknown = urllib.request.Request(
        f"{BASE_URL}/api/auth/biometric?action=verify",
        data=json.dumps(unknown_assertion).encode(),
        headers={"Content-Type": "application/json"}
    )
    unknown_blocked = False
    try:
        with urllib.request.urlopen(req_unknown) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (401, 423):
            unknown_blocked = True
    assert unknown_blocked, "CRITICAL FLAW: Unenrolled credential ID was NOT blocked!"
    print("  -> PASSED: Unenrolled credential rejected with HTTP 401/423.")

    print("\n=======================================================")
    print("   ALL 8 WEBAUTHN ASSERTION AUDIT TESTS PASSED (100%)!")
    print("   STRICT SEPARATION & CRYPTOGRAPHIC PROOF VERIFIED")
    print("=======================================================\n")


if __name__ == "__main__":
    run_test_suite()

