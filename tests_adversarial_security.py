"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_adversarial_security.py
Purpose: Adversarial Security & Threat-Model Verification (LOCAL-ONLY contract)
===============================================================================

Architectural Role & Threat Verification:
- ULTRON now runs LOCAL-ONLY: fingerprint / WebAuthn / Zero-Trust session gating
  was removed from the Next.js app, and every local API route is intentionally
  open on loopback. This suite therefore verifies two independent properties.
- (A) In-process cryptographic primitives still resist adversarial attacks
      (unit-tested directly against the Python engine layer):
      1. Ciphertext envelope isolation + authorized plaintext recovery only.
      2. Single-bit ciphertext tampering (AES-256-GCM AEAD tag rejection).
      3. Truncated / malformed envelope rejection (no partial decrypt).
      4. Stolen-database offline inspection (0% plaintext at rest).
      5. No raw biometric templates on disk & no plaintext recovery bypass.
- (B) The loopback HUD-facing routes are reachable with NO credential
      (there is no token issuance/gating layer to satisfy anymore):
      6. GET /api/wakeword and POST /api/chat answer 200, and an arbitrary
         Authorization header is ignored rather than rejected.

Exit Code Contract:
  0 -> all checks passed (SKIPs allowed only for missing environment preconditions).
  1 -> a genuine security/contract failure.

Safety / Security Guarantees:
- Read-only against the SQLite database and the vault directory; the only state
  changed is sealed ciphertext produced by the crypto engine in memory.
- No credentials, tokens, or dummy keys are fabricated: they are not part of the
  current product contract.
===============================================================================
"""

import os
import sys
import json
import time
import base64
import sqlite3
import traceback
import urllib.request
import urllib.error

# Emit UTF-8 so non-ASCII diagnostics never crash a Windows console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.secure_vault import VAULT_FILE, RECOVERY_FILE
from ultron_engine.crypto import default_crypto

# All HTTP probes use the IPv4 literal 127.0.0.1 (never "localhost"): on this host
# Python's urllib otherwise pays a ~2s IPv6 fallback delay before each request.
BASE_URL = "http://127.0.0.1:3000"
SKIPPED = []
FAILED = []


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


def wait_for_server(timeout_seconds=25.0):
    """
    Blocks until the local production server answers on loopback.

    WHY: the suite is executed shortly after a build; the dev/prod server can take
    a few seconds to bind port 3000. Connection-refused is transient, so retry
    briefly instead of reporting a false failure on the very first probe.

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
    raise AssertionError(f"Local server {BASE_URL} did not become reachable within {timeout_seconds}s ({last_error})")


def skip(label, reason):
    """Record and print an explicit SKIP marker for a precondition-dependent check."""
    SKIPPED.append(f"{label}: {reason}")
    print(f"  -> SKIPPED ({label}): {reason}")


def test_ciphertext_envelope_and_authorized_recovery():
    """
    Verifies that sealed envelopes hide plaintext and that only the vault key recovers it.

    This is the "plaintext recovery" guarantee: authorized in-process recovery must
    work byte-for-byte, while the on-the-wire/at-rest envelope must expose nothing.
    """
    print("[ADVERSARIAL 1/6] Verifying Ciphertext Envelope Isolation & Authorized Recovery...")
    secret = "Highly Confidential Financial Wire Instructions"
    sealed = default_crypto.seal(secret)

    assert isinstance(sealed, str) and len(sealed) > 40, f"Seal must return a ciphertext envelope, got {sealed!r}"
    assert sealed.startswith("A"), "Sealed envelope must be the versioned Base64 ciphertext format"
    assert secret not in sealed, "Plaintext MUST NOT appear inside the sealed envelope"
    assert default_crypto.unseal(sealed) == secret, "Authorized recovery must return the exact plaintext"

    # Structured payloads (dicts) round-trip through the same AEAD envelope.
    payload = {"account": "GB82WEST12345698765432", "amount": 95000}
    sealed_payload = default_crypto.seal(payload)
    assert "GB82WEST12345698765432" not in sealed_payload, "Structured plaintext leaked into the envelope"
    assert default_crypto.unseal(sealed_payload) == payload, "Structured plaintext recovery failed"

    # A fresh 96-bit nonce per seal means identical plaintext never reuses ciphertext.
    assert default_crypto.seal(secret) != sealed, "Sealing is deterministic: nonce reuse detected"
    print("  -> PASSED: envelope hides plaintext; authorized recovery is exact; nonces are unique.")


def test_single_bit_ciphertext_tamper():
    """Flips exactly one ciphertext bit and requires the AEAD MAC to reject it."""
    print("[ADVERSARIAL 2/6] Simulating Single-Bit Ciphertext Tampering Attack...")
    sealed = default_crypto.seal("Highly Confidential Financial Wire Instructions")

    raw_bytes = bytearray(base64.urlsafe_b64decode(sealed))
    raw_bytes[18] ^= 0x01  # Flip a single bit inside the encrypted body
    tampered_sealed = base64.urlsafe_b64encode(bytes(raw_bytes)).decode()

    rejected = False
    try:
        default_crypto.unseal(tampered_sealed)
    except PermissionError as exc:
        rejected = "Tamper" in str(exc)
    except Exception:
        rejected = True  # Any rejection is acceptable; silently returning data is not.

    assert rejected, "AES-256-GCM authentication tag MUST reject 1-bit modified ciphertext!"
    print("  -> PASSED: 1-bit ciphertext tampering detected and rejected by the AEAD MAC tag.")


def test_truncated_and_malformed_envelope():
    """Requires truncated/garbage envelopes to fail closed instead of partially decrypting."""
    print("[ADVERSARIAL 3/6] Verifying Truncated & Malformed Envelope Rejection...")
    sealed = default_crypto.seal("Tamper resistance probe")
    raw = base64.urlsafe_b64decode(sealed)

    # Cut the envelope roughly in half: the nonce/tag are incomplete, so decryption
    # must raise rather than return a partial or default value.
    truncated = base64.urlsafe_b64encode(raw[: max(4, len(raw) // 2)]).decode()
    malformed_cases = {
        "truncated": truncated,
        "non-base64": "A!!!this-is-not-a-valid-envelope!!!",
        "empty": "",
    }

    for label, candidate in malformed_cases.items():
        rejected = False
        try:
            default_crypto.unseal(candidate)
        except Exception:
            rejected = True
        assert rejected, f"Malformed envelope ({label}) MUST be rejected, but unseal returned data"

    print("  -> PASSED: truncated, non-Base64, and empty envelopes fail closed.")


def test_stolen_database_offline():
    """Simulates an attacker who steals the SQLite file: every row must be ciphertext."""
    print("[ADVERSARIAL 4/6] Simulating Stolen Database Offline Inspection...")
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ultron_engine", "ultron_memory.db")
    assert os.path.exists(db_path), f"Database file must exist at {db_path}"

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT content, meta FROM memory").fetchall()
    finally:
        conn.close()

    assert len(rows) > 0, "Database must contain at least one memory record for this audit"

    sensitive_markers = ["password", "secret", "confidential", "health", "biometric", "ssn"]
    for row in rows:
        content_raw = str(row[0])
        meta_raw = str(row[1])
        # Every stored row must be a sealed Base64 envelope, never a JSON/plaintext blob.
        assert content_raw.startswith("A"), "Raw row is not an encrypted ciphertext envelope"
        for marker in sensitive_markers:
            assert marker not in content_raw.lower(), f"Sensitive plaintext marker '{marker}' found in raw database!"
            assert marker not in meta_raw.lower(), f"Sensitive metadata marker '{marker}' found in raw database!"

    print(f"  -> PASSED: All {len(rows)} database records are encrypted ciphertext. 0% plaintext exposed.")


def test_zero_raw_biometrics_and_no_bypass():
    """Audits the vault directory and recovery manifest for raw biometrics / plaintext keys."""
    print("[ADVERSARIAL 5/6] Auditing Against Raw Biometrics & Plaintext Recovery Bypasses...")
    vault_dir = os.path.dirname(VAULT_FILE)
    assert os.path.isdir(vault_dir), f"Vault directory must exist at {vault_dir}"

    # 1. No raw biometric image/template file may ever be written into the vault.
    prohibited_extensions = {".raw", ".bmp", ".png", ".jpg", ".jpeg", ".fpt", ".iso"}
    for root, _, files in os.walk(vault_dir):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            assert ext not in prohibited_extensions, f"Prohibited raw biometric artifact found: {filename}"

    # 2. The recovery manifest may describe the KDF/ciphertext, but must never hold
    #    the recovery passphrase itself (a documented "never store" guarantee).
    assert os.path.exists(RECOVERY_FILE), f"Recovery manifest must exist at {RECOVERY_FILE}"
    with open(RECOVERY_FILE, "r", encoding="utf-8") as handle:
        manifest_text = handle.read()

    lowered = manifest_text.lower()
    assert "salt_b64" in manifest_text, "Recovery manifest must persist the KDF salt"
    assert "ciphertext_b64" in manifest_text, "Recovery manifest must persist wrapped key ciphertext"
    assert "passphrase" not in lowered or "never store" in lowered, (
        "Recovery passphrase leaked into the recovery manifest!"
    )
    assert "never store raw recovery passphrase" in lowered, (
        "Recovery manifest must document the no-plaintext-passphrase policy"
    )
    print("  -> PASSED: no raw biometric templates on disk; no plaintext recovery bypass found.")


def test_loopback_hud_routes_open_without_auth():
    """
    Validates the local-only HTTP contract the HUD depends on.

    The app intentionally has no token/401/423 gating on loopback, so the HUD
    routes must answer unauthenticated. An arbitrary Authorization header must be
    ignored (not rejected): if a 401/403 appeared here, a removed auth layer would
    have leaked back into the product.
    """
    print("[ADVERSARIAL 6/6] Verifying HUD-Facing Routes Are Open on Loopback (No Auth Layer)...")
    wait_for_server()

    # 1. Wake-word state read, exactly what the HUD polls.
    status, _, wake_data, _ = http_json(f"{BASE_URL}/api/wakeword", timeout=10)
    assert status == 200, f"GET /api/wakeword must be open on loopback, got {status}: {wake_data}"
    assert "status" in wake_data or "mode" in wake_data, f"Unexpected wake-word payload: {wake_data}"
    print(f"  -> PASSED: GET /api/wakeword -> 200 ({wake_data.get('status')}/{wake_data.get('mode')}).")

    # 2. Chat, unauthenticated: the local rule engine must answer without a token.
    chat_payload = {
        "messages": [{"role": "user", "content": "status"}],
        "activationMode": "CONTINUOUS_CONVERSATION",
    }
    status, _, chat_data, _ = http_json(f"{BASE_URL}/api/chat", chat_payload, timeout=60)
    assert status == 200, f"POST /api/chat must be open on loopback, got {status}: {chat_data}"
    reply = chat_data.get("reply") or ""
    assert isinstance(reply, str) and reply.strip(), f"Chat must return a non-empty reply, got: {chat_data}"
    print(f"  -> PASSED: POST /api/chat -> 200 with reply: '{reply[:60]}'")

    # 3. A supplied-but-meaningless Authorization header is simply ignored: there is
    #    no authorization layer left to reject it, which is the documented contract.
    status, _, chat_data, _ = http_json(
        f"{BASE_URL}/api/chat",
        chat_payload,
        headers={"Authorization": "Bearer irrelevant.local.header"},
        timeout=60,
    )
    assert status == 200, (
        f"Local route must not enforce Authorization (no auth layer remains), got {status}: {chat_data}"
    )
    print("  -> PASSED: arbitrary Authorization header is ignored (no auth gating remains).")


def main():
    """Runs every adversarial check, prints a summary, and returns the exit code."""
    print("\n=======================================================")
    print("   ADVERSARIAL SECURITY VERIFICATION (LOCAL-ONLY CONTRACT)")
    print("=======================================================\n")

    tests = [
        ("ciphertext envelope & authorized recovery", test_ciphertext_envelope_and_authorized_recovery),
        ("single-bit ciphertext tampering", test_single_bit_ciphertext_tamper),
        ("truncated/malformed envelope rejection", test_truncated_and_malformed_envelope),
        ("stolen database offline inspection", test_stolen_database_offline),
        ("no raw biometrics / no plaintext bypass", test_zero_raw_biometrics_and_no_bypass),
        ("loopback HUD routes open (no auth)", test_loopback_hud_routes_open_without_auth),
    ]

    for label, test_fn in tests:
        try:
            test_fn()
        except Exception as exc:  # noqa: BLE001 - report all failures, then exit nonzero
            print(f"  -> FAILED ({label}): {exc}")
            traceback.print_exc()
            FAILED.append(f"{label}: {exc}")

    print("\n=======================================================")
    if FAILED:
        print(f"   ADVERSARIAL SECURITY: {len(FAILED)} FAILURE(S)")
        for entry in FAILED:
            print(f"   [FAIL] {entry}")
        if SKIPPED:
            for entry in SKIPPED:
                print(f"   [SKIP] {entry}")
        print("=======================================================\n")
        return 1

    print("   ALL ADVERSARIAL SECURITY CHECKS PASSED")
    if SKIPPED:
        print(f"   Precondition-dependent checks skipped: {len(SKIPPED)}")
        for entry in SKIPPED:
            print(f"   [SKIP] {entry}")
    print("   ENCRYPTION · TAMPER-RESISTANCE · NO-PLAINTEXT · LOOPBACK-OPEN VERIFIED")
    print("=======================================================\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
