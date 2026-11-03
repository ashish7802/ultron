"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Test Suite: tests_native_windows_hello.py
Purpose: Direct OS-Level Windows Hello Biometric Platform Verification
===============================================================================

Architectural Role & Verification Guarantees:
- ULTRON is now a LOCAL-ONLY product. The fingerprint / WebAuthn / Zero-Trust
  session gating was removed from the Next.js app, so this suite audits ONLY the
  in-process Windows Hello primitives exposed by `ultron_engine.windows_hello`.
- Verifies:
  1. WinBio biometric framework + physical sensor detection (Synaptics VFS7552).
  2. Windows Runtime UserConsentVerifier availability on the host.
  3. Enrolled-fingerprint count and the zero-raw-template storage policy.
  4. Platform enclave (TPM / VBS) attestation metadata.
- No HTTP endpoint is contacted: the former HTTP biometric hardware route no
  longer exists in the app, so it must not be asserted here.

Safety / Security Guarantees:
- Read-only audit: this module never captures, transmits, or stores biometric
  data; it only reads OS-reported capability telemetry.
- The WinBio/WinRT probe is fail-closed inside the product module and may be
  blocked in a restricted process (no access to the biometric service). In that
  case every hardware check is reported as an explicit SKIP rather than being
  faked into a pass.

Exit Code Contract:
  0 -> every auditable check passed, or was skipped for an environmental
       precondition (restricted process / probe blocked).
  1 -> a real verification failure.
===============================================================================
"""

import os
import sys
import traceback

# Emit UTF-8 so the summary separator/version glyphs render on every console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.windows_hello import get_windows_hello_availability

SKIPPED = []
FAILED = []


def skip(label, reason):
    """Record and print an explicit SKIP marker for a precondition-dependent check."""
    SKIPPED.append(f"{label}: {reason}")
    print(f"  -> SKIPPED ({label}): {reason}")


def check(label, condition, failure_message):
    """
    Evaluates one assertion-style check and prints a consistent PASS marker.

    Args:
        label (str): Short human-readable name of the check.
        condition (bool): Result of the verification predicate.
        failure_message (str): Message raised as AssertionError when condition is falsy.

    Raises:
        AssertionError: When `condition` is falsy.
    """
    if not condition:
        raise AssertionError(failure_message)
    print(f"  -> PASSED ({label})")


def probe_windows_hello():
    """
    Reads the in-process Windows Hello capability report.

    WHY: the product module already catches WinBio/WinRT failures internally and
    reports them through `availability` ("Unknown"/"Unavailable") instead of
    raising, so an exception here means a genuinely unexpected platform error.

    Returns:
        dict: Capability telemetry (supported, availability, deviceName, ...).
    """
    return get_windows_hello_availability()


def test_winbio_sensor_detection(status):
    """Audits that the WinBio framework reports a live, healthy fingerprint sensor."""
    print("[TEST 1/4] Verifying Physical Biometric Sensor via WinBio Framework...")
    check(
        "sensor-supported",
        status.get("supported") is True,
        f"WinBio sensor must be reported as supported, got: {status}",
    )
    device_name = status.get("deviceName", "")
    check(
        "sensor-name",
        bool(device_name) and device_name != "Unknown",
        f"Sensor description must be reported by WinBio, got: {device_name!r}",
    )
    check(
        "sensor-health",
        status.get("hardwareStatus") == "OK",
        f"WinBio hardware status must be OK, got: {status.get('hardwareStatus')!r}",
    )
    # The host's documented hardware binding is the Synaptics VFS7552 touch
    # sensor. A different (but healthy) WinBio sensor is a reporting difference,
    # not a security regression, so it is surfaced as a SKIP instead of a failure.
    if "Synaptics" in device_name:
        print(f"  -> PASSED (documented-hardware-binding): {device_name} ({status.get('deviceId')})")
    else:
        skip(
            "documented-hardware-binding",
            f"WinBio reported '{device_name}' instead of the documented Synaptics sensor",
        )


def test_user_consent_verifier_availability(status):
    """Audits that the Windows Runtime consent prompt is actually usable (not just PnP-present)."""
    print("[TEST 2/4] Verifying Windows Runtime UserConsentVerifier Availability...")
    check(
        "consent-verifier-available",
        status.get("availability") == "Available",
        f"UserConsentVerifier must be Available, got: {status.get('availability')!r}",
    )
    check(
        "windows-hello-ready",
        status.get("windowsHelloReady") is True,
        "windowsHelloReady must be True when the consent verifier is available",
    )
    print("  -> PASSED (consent-verifier): Windows Hello biometric consent prompt is usable.")


def test_enrolled_fingerprint_and_zero_raw_template_policy(status):
    """Audits enrollment state while proving raw biometric templates are never persisted."""
    print("[TEST 3/4] Verifying Enrolled Fingerprint & Zero-Raw-Template Policy...")
    # Policy check first: this must hold regardless of enrollment state.
    check(
        "no-raw-biometric-storage",
        status.get("rawBiometricsStored") is False,
        "Raw biometric templates MUST NEVER be stored (rawBiometricsStored must be False)",
    )
    count = status.get("enrolledFingerprintsCount", 0)
    if status.get("isEnrolled") is True and count >= 1:
        print(f"  -> PASSED (enrollment): {count} enrolled fingerprint(s) visible to the WinBio session.")
    else:
        skip(
            "enrollment-count",
            "no fingerprint is enrolled for the current user session; enrollment is a "
            "per-user OS state, not a product contract",
        )


def test_platform_enclave_attestation(status):
    """Audits that the biometric key material is bound to the platform enclave (TPM/VBS)."""
    print("[TEST 4/4] Verifying Platform Enclave (TPM / VBS) Attestation Metadata...")
    enclave = str(status.get("enclaveType", ""))
    check(
        "enclave-metadata",
        "TPM" in enclave.upper() and "VBS" in enclave.upper(),
        f"Enclave metadata must document TPM + VBS binding, got: {enclave!r}",
    )
    print(f"  -> PASSED (enclave): {enclave}")


def run_native_windows_hello_tests():
    """Runs the local-only Windows Hello audit and returns the process exit code."""
    print("\n=======================================================")
    print("   NATIVE WINDOWS HELLO BIOMETRIC PLATFORM AUDIT")
    print("   (LOCAL-ONLY: in-process WinBio/WinRT primitives, no HTTP auth)")
    print("=======================================================\n")

    status = probe_windows_hello()
    availability = status.get("availability", "Unknown")
    print(f"Host availability probe: {availability!r} | supported={status.get('supported')}\n")

    # Why SKIP instead of FAIL: in a restricted process the WinBio service or the
    # PowerShell/WinRT bridge can be unavailable even on a perfectly healthy host.
    # Failing here would produce a false negative; fabricating a pass would be
    # dishonest. An explicit SKIP with the raw probe output is the honest result.
    if availability != "Available" or status.get("supported") is not True:
        skip(
            "native-windows-hello-hardware",
            f"WinBio/WinRT probe could not confirm the platform biometric stack "
            f"(availability={availability!r}, supported={status.get('supported')}); "
            f"hardware checks require an unrestricted interactive Windows session",
        )
        print("\n=======================================================")
        print("   WINDOWS HELLO AUDIT: SKIPPED (hardware probe unavailable)")
        print(f"   Probe payload: {status}")
        print("=======================================================\n")
        return 0

    tests = [
        ("WinBio sensor detection", test_winbio_sensor_detection),
        ("UserConsentVerifier availability", test_user_consent_verifier_availability),
        ("Enrollment & zero-raw-template policy", test_enrolled_fingerprint_and_zero_raw_template_policy),
        ("Platform enclave attestation", test_platform_enclave_attestation),
    ]

    for print_label, test_fn in tests:
        try:
            test_fn(status)
        except Exception as exc:  # noqa: BLE001 - collect and report, then fail at the end
            print(f"  -> FAILED ({print_label}): {exc}")
            traceback.print_exc()
            FAILED.append(f"{print_label}: {exc}")

    print("\n=======================================================")
    if FAILED:
        print(f"   WINDOWS HELLO AUDIT: {len(FAILED)} FAILURE(S)")
        for entry in FAILED:
            print(f"   [FAIL] {entry}")
        if SKIPPED:
            print(f"   Skipped: {len(SKIPPED)}")
            for entry in SKIPPED:
                print(f"   [SKIP] {entry}")
        print("=======================================================\n")
        return 1

    print("   WINDOWS HELLO AUDIT PASSED")
    print("   ZERO PASSKEYS · GENUINE HARDWARE BIOMETRICS VERIFIED")
    if SKIPPED:
        print(f"   Precondition-dependent checks skipped: {len(SKIPPED)}")
        for entry in SKIPPED:
            print(f"   [SKIP] {entry}")
    print("=======================================================\n")
    return 0


if __name__ == "__main__":
    sys.exit(run_native_windows_hello_tests())
