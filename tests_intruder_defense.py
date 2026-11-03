"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_intruder_defense.py
Purpose: Adaptive Intruder Defense, Anti-Replay, Revocation & Audit Verification
===============================================================================

Architectural Role & Verification Scope:
- ULTRON is LOCAL-ONLY: fingerprint / WebAuthn / Zero-Trust HTTP gating was
  removed from the app, and no API route is auth-gated. This suite therefore
  validates ONLY the in-process defense primitives of
  `ultron_engine.intruder_defense` (they still power the encrypted audit ledger
  and the local privilege-escalation guard, but are not wired to HTTP auth).
- Validates 8 dimensions of the Adaptive Intruder Defense System:
  1. Immediate Lockdown on the first failed biometric attempt (CHALLENGE_MODE).
  2. Session Revocation & the revocation epoch (tokens issued before lockdown die).
  3. Anti-Replay Challenge Nonce Protection (single-use, TTL-bound).
  4. Biometric policy: ordinary RGB webcam images are rejected as biometric proof.
  5. Encrypted security audit log with a cryptographic HMAC chain.
  6. Tamper detection on the audit ledger (1-bit corruption is rejected).
  7. Progressive rate limiting & cooldown escalation (5s -> 30s -> 300s).
  8. Inactivity auto-lockout (2-minute idle timeout).
- No HTTP endpoint is contacted and no auth token is issued by the product: the
  hand-built opaque payload in test 2 only exercises the engine's epoch math.

Exit Code Contract:
  0 -> all checks passed (SKIPs allowed only for environment preconditions).
  1 -> a genuine defense/audit failure.

Safety / Security Guarantees:
- The audit ledger is the real encrypted runtime file; the tamper test saves and
  restores it in a `finally` block so the live ledger is never left corrupted.
- No biometric prompt is triggered: all checks are pure in-process state machine
  and cryptography assertions.
===============================================================================
"""

import os
import sys
import time
import json
import base64
import traceback

# Emit UTF-8 so the summary separator glyphs render on every Windows console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.intruder_defense import IntruderDefenseEngine, AUDIT_LOG_FILE
from ultron_engine.windows_hello import get_windows_hello_availability

SKIPPED = []
FAILED = []


def skip(label, reason):
    """Record and print an explicit SKIP marker for a precondition-dependent check."""
    SKIPPED.append(f"{label}: {reason}")
    print(f"  -> SKIPPED ({label}): {reason}")


def _opaque_session_token(issued_at):
    """
    Builds a `[PAYLOAD_B64].[SIGNATURE]` shaped token for revocation-epoch math only.

    WHY: the product no longer issues or verifies Zero-Trust tokens over HTTP. The
    defense engine's `is_token_revoked` still reads the `iat` claim to enforce its
    "invalidate every session issued before lockdown" policy, so this helper feeds
    a synthetic timestamp into that pure in-process logic. Authenticity is not
    claimed or checked here (there is no auth layer left to check it).

    Args:
        issued_at (float): UNIX timestamp to embed as the token's `iat` claim.

    Returns:
        str: Opaque token-shaped string with the requested issue time.
    """
    payload = {"sub": "primary_user", "iat": float(issued_at), "exp": float(issued_at) + 900.0}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    return f"{encoded}.{'0' * 64}"


def test_immediate_lockout_on_first_failure():
    """One failed biometric attempt must immediately enter CHALLENGE_MODE + cooldown."""
    print("[INTRUDER TEST 1/8] Verifying Immediate Lockdown on First Failed Biometric Attempt...")
    defense = IntruderDefenseEngine()
    assert defense.get_status()["defense_state"] == "NORMAL", "Initial state must be NORMAL"

    res = defense.record_failed_authentication("fingerprint_mismatch_adversarial_test")
    assert res["status"] == "CHALLENGE_MODE", "State must immediately transition to CHALLENGE_MODE on 1st fail"
    assert res["consecutive_failures"] == 1, f"Failure counter must be 1, got {res['consecutive_failures']}"
    assert res["cooldown_remaining"] > 0, "Progressive cooldown must be engaged on the first failure"

    allowed, reason = defense.check_access_permission(None)
    assert not allowed, "Access must be denied while CHALLENGE_MODE / cooldown is active"
    assert "RATE_LIMITED" in reason or "SYSTEM_LOCKED" in reason, f"Unexpected denial reason: {reason}"
    print("  -> PASSED: First failed attempt triggered CHALLENGE_MODE and locked access.")


def test_session_revocation_and_epoch():
    """Explicit revocation plus the revocation epoch must both invalidate sessions."""
    print("[INTRUDER TEST 2/8] Verifying Session Revocation & Revocation Epoch...")
    defense = IntruderDefenseEngine()

    pre_lockdown_token = _opaque_session_token(time.time() - 60)
    post_lockdown_token = _opaque_session_token(time.time() + 60)

    # Before any security event, neither synthetic session is revoked.
    assert defense.is_token_revoked(pre_lockdown_token) is False
    assert defense.is_token_revoked(post_lockdown_token) is False

    # A failed biometric attempt advances the revocation epoch to "now": every
    # session issued before it is invalidated, even though this process never
    # enumerated that token.
    defense.record_failed_authentication("epoch_probe")
    epoch = defense.get_status()["tokens_revoked_at"]
    assert epoch > 0, "Failed authentication must advance the revocation epoch"
    assert defense.is_token_revoked(pre_lockdown_token) is True, (
        "A token issued before the revocation epoch MUST be treated as revoked"
    )
    assert defense.is_token_revoked(post_lockdown_token) is False, (
        "A token issued after the revocation epoch must remain valid (fresh login)"
    )

    # Explicit blacklist revocation is independent of the epoch.
    explicit = _opaque_session_token(time.time() + 120)
    defense.revoke_token(explicit, reason="test_explicit_revocation")
    assert defense.is_token_revoked(explicit) is True, "Blacklisted token must be revoked"

    # The gate rejects the stale session while the cooldown is active.
    allowed, reason = defense.check_access_permission(pre_lockdown_token)
    assert not allowed, "Pre-lockdown session must be denied after a security event"
    assert "REVOKED" in reason or "LOCKED" in reason or "RATE_LIMITED" in reason, (
        f"Unexpected denial reason: {reason}"
    )
    print("  -> PASSED: explicit revocation + epoch invalidation both enforced.")


def test_anti_replay_challenge_mode():
    """A challenge nonce must be consumable exactly once (replay rejected)."""
    print("[INTRUDER TEST 3/8] Verifying Single-Use Anti-Replay Challenge Protection...")
    defense = IntruderDefenseEngine()
    challenge = defense.generate_challenge(ttl_seconds=60)
    assert len(challenge) > 20, "Challenge nonce must carry at least 128 bits of entropy"

    assert defense.verify_and_consume_challenge(challenge) is True, (
        "First presentation of a fresh challenge must succeed"
    )
    assert defense.verify_and_consume_challenge(challenge) is False, (
        "Replay of a consumed challenge MUST be rejected"
    )
    print("  -> PASSED: challenge consumed immediately on first presentation; replay rejected.")


def test_biometric_hardware_policy_rejects_webcam():
    """The policy must reject ordinary RGB webcam faces and require a platform sensor."""
    print("[INTRUDER TEST 4/8] Verifying Biometric Hardware Policy (Rejecting RGB Webcam Proof)...")
    defense = IntruderDefenseEngine()
    policy = defense.get_hardware_biometric_policy()

    face = policy["facial_recognition"]
    assert face["supported"] is False, "Ordinary RGB webcam facial recognition MUST be rejected"
    assert face["trust_level"] == "UNTRUSTED_ORDINARY_RGB"
    assert "RGB" in face["reason"], f"Rejection must explain the RGB spoofing risk: {face['reason']}"
    assert policy.get("policy") == "FAIL_CLOSED_HARDWARE_BOUND"

    fingerprint = policy["fingerprint_sensor"]
    if fingerprint["supported"] is True:
        assert fingerprint["trust_level"] == "PLATFORM_ENCLAVE_VERIFIED"
        print(f"  -> PASSED: webcam rejected; platform sensor '{fingerprint['device_name']}' permitted.")
        return

    # The policy resolves the fingerprint sensor through CIM/PnP enumeration, which
    # can be access-denied in a restricted process even when WinBio sees the sensor.
    # Cross-check with the authoritative WinBio probe before calling it a failure.
    winbio = get_windows_hello_availability()
    if winbio.get("supported") is True:
        skip(
            "environment",
            "CIM/PnP biometric enumeration is unavailable in this restricted process "
            f"(policy reports no sensor) while WinBio reports '{winbio.get('deviceName')}'; "
            "webcam-rejection policy is still fully verified",
        )
        print("  -> PASSED: webcam-rejection policy enforced; fingerprint policy check skipped (restricted WMI).")
    else:
        skip(
            "environment",
            "no biometric fingerprint sensor is detectable in this environment; "
            "webcam-rejection policy is still fully verified",
        )


def test_encrypted_security_audit_log_and_hmac_chain():
    """The audit ledger must be encrypted at rest and HMAC-chained in memory."""
    print("[INTRUDER TEST 5/8] Verifying Encrypted Security Audit Log & HMAC Chaining...")
    defense = IntruderDefenseEngine()
    defense.log_event("POLICY_CHECK", {"status": "ok"})
    defense.log_event("SESSION_CREATED", {"user": "primary_user"})

    assert os.path.exists(AUDIT_LOG_FILE), f"Audit log file must exist on disk at {AUDIT_LOG_FILE}"

    with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as handle:
        ledger = json.load(handle)

    assert "sealed_ledger" in ledger, "Audit ledger must be a sealed ciphertext envelope"
    assert ledger["sealed_ledger"].startswith("A"), "Audit ledger must use the versioned ciphertext format"
    assert "POLICY_CHECK" not in str(ledger), "Plaintext event names must not leak to disk!"
    assert "SESSION_CREATED" not in str(ledger), "Plaintext event names must not leak to disk!"

    trail = defense.get_audit_trail()
    assert len(trail) >= 2, f"Audit trail must contain the logged events, got {len(trail)}"
    assert trail[-1]["prev_hash"] == trail[-2]["hash"], (
        "HMAC chain broken: each event must reference the previous event's hash"
    )
    print(f"  -> PASSED: ledger is AES-256-GCM ciphertext; HMAC chain linked across {len(trail)} events.")


def test_tamper_detection_in_audit_log():
    """A 1-bit corruption of the on-disk ledger must fail closed on next load."""
    print("[INTRUDER TEST 6/8] Verifying Tamper Detection on Audit Ledger...")
    defense = IntruderDefenseEngine()
    defense.log_event("SENSITIVE_AUDIT_ACTION", {"auth": "pass"})

    with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as handle:
        original_content = handle.read()

    try:
        ledger = json.loads(original_content)
        raw_sealed = bytearray(base64.urlsafe_b64decode(ledger["sealed_ledger"]))
        raw_sealed[-1] ^= 0x01  # Flip exactly one bit inside the sealed ledger
        ledger["sealed_ledger"] = base64.urlsafe_b64encode(bytes(raw_sealed)).decode()
        with open(AUDIT_LOG_FILE, "w", encoding="utf-8") as handle:
            json.dump(ledger, handle)

        tamper_caught = False
        try:
            tampered_defense = IntruderDefenseEngine()
            tamper_caught = tampered_defense.get_status()["defense_state"] in ("CHALLENGE_MODE", "LOCKDOWN")
        except Exception as exc:  # The loader fails closed by raising PermissionError.
            tamper_caught = isinstance(exc, PermissionError) or "TAMPER" in str(exc).upper()
        assert tamper_caught, "Tampered audit log MUST trigger a defensive lockdown or rejection!"
    finally:
        # Always restore the valid ledger, even if an assertion above failed.
        with open(AUDIT_LOG_FILE, "w", encoding="utf-8") as handle:
            handle.write(original_content)

    # Prove the restore actually produced a loadable ledger again.
    reloaded = IntruderDefenseEngine()
    assert reloaded.get_status()["defense_state"] == "NORMAL", "Restored ledger must load in a clean state"
    print("  -> PASSED: 1-bit ledger tampering detected/blocked; original ledger restored.")


def test_rate_limiting_progressive_backoff():
    """Cooldown must escalate 5s -> 30s -> 300s across consecutive failures."""
    print("[INTRUDER TEST 7/8] Verifying Progressive Rate Limiting & Cooldown Escalation...")
    defense = IntruderDefenseEngine()
    defense._consecutive_failures = 0  # Defensive reset: start the escalation from zero.

    first = defense.record_failed_authentication("fail_1")
    assert first["consecutive_failures"] == 1
    assert 4.0 <= first["cooldown_remaining"] <= 5.0, f"1st cooldown must be ~5s, got {first['cooldown_remaining']}"

    second = defense.record_failed_authentication("fail_2")
    assert second["consecutive_failures"] == 2
    assert 28.0 <= second["cooldown_remaining"] <= 30.0, f"2nd cooldown must be ~30s, got {second['cooldown_remaining']}"

    third = defense.record_failed_authentication("fail_3")
    assert third["consecutive_failures"] == 3
    assert 295.0 <= third["cooldown_remaining"] <= 300.0, f"3rd cooldown must be ~300s, got {third['cooldown_remaining']}"

    allowed, reason = defense.check_access_permission(None)
    assert not allowed, "Access must be denied while the rate limit is engaged"
    assert "RATE_LIMITED" in reason or "SYSTEM_LOCKED" in reason, f"Unexpected denial reason: {reason}"

    defense.record_successful_authentication("test_recovery")  # Restore NORMAL state.
    print("  -> PASSED: progressive cooldown escalation (5s -> 30s -> 300s) verified.")


def test_inactivity_auto_lockout():
    """More than 120 seconds of idle time must force a CHALLENGE_MODE lockout."""
    print("[INTRUDER TEST 8/8] Verifying Inactivity Auto-Lockout Enforcement...")
    defense = IntruderDefenseEngine()
    defense.record_successful_authentication("test")

    # Simulate 125 seconds of idle time without a user activity heartbeat.
    defense._last_activity_time = time.time() - 125

    allowed, reason = defense.check_access_permission(None)
    assert not allowed, "Access must be denied after 120s of inactivity"
    assert "INACTIVITY_TIMEOUT" in reason, f"Expected INACTIVITY_TIMEOUT, got: {reason}"
    assert defense.get_status()["defense_state"] == "CHALLENGE_MODE", (
        "Idle timeout must place the engine in CHALLENGE_MODE"
    )
    print("  -> PASSED: inactivity auto-lockout triggered after 2 minutes of idle time.")


def main():
    """Runs the in-process intruder-defense audit and returns the exit code."""
    print("\n=======================================================")
    print("   ADAPTIVE INTRUDER DEFENSE & AUDIT VERIFICATION")
    print("   (LOCAL-ONLY: in-process primitives, no HTTP auth gating)")
    print("=======================================================\n")

    tests = [
        ("immediate lockdown on first failure", test_immediate_lockout_on_first_failure),
        ("session revocation & epoch", test_session_revocation_and_epoch),
        ("anti-replay challenge nonce", test_anti_replay_challenge_mode),
        ("biometric hardware policy", test_biometric_hardware_policy_rejects_webcam),
        ("encrypted audit ledger & HMAC chain", test_encrypted_security_audit_log_and_hmac_chain),
        ("audit ledger tamper detection", test_tamper_detection_in_audit_log),
        ("progressive rate limiting", test_rate_limiting_progressive_backoff),
        ("inactivity auto-lockout", test_inactivity_auto_lockout),
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
        print(f"   INTRUDER DEFENSE: {len(FAILED)} FAILURE(S)")
        for entry in FAILED:
            print(f"   [FAIL] {entry}")
        if SKIPPED:
            for entry in SKIPPED:
                print(f"   [SKIP] {entry}")
        print("=======================================================\n")
        return 1

    print("   ALL INTRUDER DEFENSE CHECKS PASSED")
    if SKIPPED:
        print(f"   Precondition-dependent checks skipped: {len(SKIPPED)}")
        for entry in SKIPPED:
            print(f"   [SKIP] {entry}")
    print("   LOCKDOWN · REVOCATION EPOCH · HMAC AUDIT · BACKOFF VERIFIED")
    print("=======================================================\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
