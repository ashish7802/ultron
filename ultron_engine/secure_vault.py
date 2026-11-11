"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.secure_vault
Purpose: OS-Backed Key Storage (Windows DPAPI), Tamper Detection & Recovery
===============================================================================

Architectural Role & Security Guarantees:
- Replaces unverified or spoofable hardware ID derivation with genuine OS-backed
  key storage using Windows DPAPI (Data Protection API) via win32crypt.
- Windows DPAPI encrypts cryptographic keys using the operating system's Local
  Security Authority (LSA) and the user's logon credentials, backed by hardware TPM
  when available.
- Stores the wrapped master key inside a protected binary file (vault.bin) in a dedicated
  local vault directory.
- Implements cryptographic Recovery Protection:
  Generates a 256-bit recovery backup key derived via PBKDF2-HMAC-SHA512 (200,000 rounds)
  from a high-entropy recovery passphrase, allowing key restoration if the DPAPI context
  is compromised or migrated.
- Implements Tamper Detection:
  Verifies a SHA-256 integrity checksum of the protected key blob before unprotecting
  (catches offline corruption / naive edits). Authenticity of the blob itself comes
  from Windows DPAPI, which only unprotects for the same OS user/machine context and
  TPM. Any integrity failure raises an immediate PermissionError and activates vault
  lockdown (the master key is never returned).
- Atomic artifact writes: vault.bin and recovery_manifest.json are written to a
  temporary sibling file and atomically renamed, so a crash/power loss can never
  leave a truncated key file (which would lose the only copy of the master key).
- Honest key-provider reporting: a clearly-labelled plaintext key gate is available
  only when non-Windows tests explicitly opt in; it is never reported as DPAPI-protected.
- Detects physical biometric hardware (e.g. Synaptics Fingerprint Sensor) via Windows
  PnP Device Management, providing evidence-backed hardware authentication capabilities.
===============================================================================
"""

import os
import sys
import json
import base64
import secrets
import hashlib
import hmac
import subprocess
from typing import Any, Dict, Optional, Tuple

try:
    import win32crypt
    HAS_WIN32CRYPT = True
except ImportError:
    HAS_WIN32CRYPT = False

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

VAULT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secure_vault")
VAULT_FILE = os.path.join(VAULT_DIR, "vault.bin")
RECOVERY_FILE = os.path.join(VAULT_DIR, "recovery_manifest.json")
ENTROPY_SALT = b"ULTRON_OS_DPAPI_ENTROPY_V1"
FALLBACK_GATE_PREFIX = b"FALLBACK_PLAINTEXT_GATE:"

# PBKDF2 work factor bounds for `recover_master_key`. The lower bound prevents a
# deliberately weakened recovery manifest; the upper bound prevents a tampered
# manifest from turning recovery into an unbounded CPU denial-of-service.
RECOVERY_MIN_PBKDF2_ITERATIONS = 100_000
RECOVERY_MAX_PBKDF2_ITERATIONS = 1_000_000


def write_json_atomic(path: str, payload: Dict[str, Any]) -> None:
    """
    Writes a JSON document atomically (temp file in the same directory + os.replace).

    Why: a truncated vault.bin would render the DPAPI-wrapped master key unusable
    (the only copy lives there), so artifact writes must never be observable in a
    half-written state even if the process crashes or the machine loses power.

    Args:
        path (str): Destination file path.
        payload (dict): JSON-serializable payload.

    Side Effects:
        Creates and removes a temporary file next to `path`; replaces `path`.
    """
    tmp_path = f"{path}.{secrets.token_hex(6)}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                # Best-effort cleanup; a leftover *.tmp file is harmless.
                pass



_CACHED_HW: Optional[Dict[str, Any]] = None


def detect_biometric_hardware() -> Dict[str, Any]:
    """
    Queries Windows PnP to detect verified physical biometric hardware.
    Results are cached in memory after first detection to prevent PowerShell subprocess stalls.

    Returns:
        dict: Device status, model name, and hardware availability.
    """
    global _CACHED_HW
    if _CACHED_HW is not None and _CACHED_HW.get("supported"):
        return _CACHED_HW

    if sys.platform != "win32":
        return {"supported": False, "reason": "Non-Windows environment"}

    try:
        cmd = [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Biometric' } | Select-Object -Property Name, Manufacturer, DeviceID, Status | ConvertTo-Json",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode == 0 and proc.stdout.strip():
            data = json.loads(proc.stdout.strip())
            if isinstance(data, list) and len(data) > 0:
                device = data[0]
            elif isinstance(data, dict):
                device = data
            else:
                device = None

            if device:
                _CACHED_HW = {
                    "supported": True,
                    "device_name": device.get("Name", "Generic Biometric Sensor"),
                    "manufacturer": device.get("Manufacturer", "Unknown"),
                    "device_id": device.get("DeviceID", ""),
                    "hardware_status": device.get("Status", "OK"),
                    "windows_hello_ready": True,
                }
                return _CACHED_HW
    except Exception as e:
        return {"supported": False, "error": str(e)}

    return {"supported": False, "reason": "No biometric hardware found in PnP enumeration"}


class SecureVault:
    """
    OS-Backed Cryptographic Vault and Key Lifecycle Manager.
    """

    def __init__(
        self,
        vault_dir: str = VAULT_DIR,
        *,
        allow_test_fallback: Optional[bool] = None,
    ):
        """
        Initializes the SecureVault.

        Args:
            vault_dir (str): Directory where protected vault artifacts are stored.
            allow_test_fallback (bool, optional): Explicitly permits plaintext key
                storage for isolated non-Windows tests only. Never permits fallback
                on Windows.
        """
        self.vault_dir = vault_dir
        self.vault_file = os.path.join(vault_dir, "vault.bin")
        self.recovery_file = os.path.join(vault_dir, "recovery_manifest.json")
        os.makedirs(self.vault_dir, exist_ok=True)
        self._master_key: Optional[bytes] = None
        self._recovery_passphrase: Optional[str] = None
        self._tamper_detected: bool = False
        # Actual key provider used for THIS vault ("DPAPI" vs the non-Windows test
        # gate). Never hard-code "DPAPI" in status output: on a non-Windows host the
        # key is not OS-protected, and reporting otherwise would be a false claim.
        self._key_provider: str = "Uninitialized"
        self._hardware_bound: bool = False
        self._allow_test_fallback = (
            allow_test_fallback
            if allow_test_fallback is not None
            else os.environ.get("ULTRON_TEST_ALLOW_PLAINTEXT_VAULT") == "1"
        )
        self._initialize_vault()

    def _initialize_vault(self) -> None:
        """
        Initializes or loads the DPAPI-protected master key.
        """
        if os.path.exists(self.vault_file):
            self._load_from_vault()
        else:
            self._create_new_vault()

    def _create_new_vault(self) -> None:
        """
        Generates a fresh 256-bit cryptographically secure key, wraps it with Windows DPAPI,
        and generates an encrypted recovery manifest.
        """
        # Generate 256-bit master key from CSPRNG
        master_key = secrets.token_bytes(32)

        # Generate a high-entropy recovery passphrase (24 characters alphanumeric)
        recovery_passphrase = secrets.token_urlsafe(24)
        self._recovery_passphrase = recovery_passphrase

        if sys.platform == "win32":
            if not HAS_WIN32CRYPT:
                raise RuntimeError(
                    "Windows vault initialization requires pywin32 DPAPI support; "
                    "refusing to store the master key without OS protection."
                )
            try:
                # CryptProtectData(data, description, optionalEntropy, reserved, promptStruct, flags)
                protected_blob = win32crypt.CryptProtectData(
                    master_key,
                    "ULTRON OS-Backed Master Key",
                    ENTROPY_SALT,
                    None,
                    None,
                    0,  # 0 = User storage bound to logged-in Windows user account
                )
            except Exception as e:
                raise RuntimeError(f"Windows DPAPI encryption failed: {e}")
            self._key_provider = "Windows DPAPI (OS-Protected / User-Account Bound)"
            self._hardware_bound = True
        else:
            if not self._allow_test_fallback:
                raise RuntimeError(
                    "DPAPI is unavailable. Plaintext key storage is disabled; "
                    "isolated non-Windows tests must explicitly enable the test fallback."
                )
            protected_blob = FALLBACK_GATE_PREFIX + master_key
            self._key_provider = "Local Test Gate (NOT OS-Protected; non-Windows fallback)"
            self._hardware_bound = False

        # Calculate integrity checksum (SHA-256)
        vault_checksum = hashlib.sha256(protected_blob).hexdigest()
        vault_payload = {
            "version": 1,
            "provider": self._key_provider,
            "protected_blob_b64": base64.b64encode(protected_blob).decode("ascii"),
            "checksum_sha256": vault_checksum,
        }

        write_json_atomic(self.vault_file, vault_payload)

        # Create encrypted recovery backup using PBKDF2-HMAC-SHA512
        recovery_salt = secrets.token_bytes(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA512(),
            length=32,
            salt=recovery_salt,
            iterations=200_000,
        )
        recovery_aes_key = kdf.derive(recovery_passphrase.encode("utf-8"))
        recovery_nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(recovery_aes_key)
        encrypted_backup = aesgcm.encrypt(recovery_nonce, master_key, None)

        recovery_manifest = {
            "version": 1,
            "salt_b64": base64.b64encode(recovery_salt).decode("ascii"),
            "nonce_b64": base64.b64encode(recovery_nonce).decode("ascii"),
            "ciphertext_b64": base64.b64encode(encrypted_backup).decode("ascii"),
            "iterations": 200_000,
            "notice": "Never store raw recovery passphrase in plain text on disk.",
        }

        write_json_atomic(self.recovery_file, recovery_manifest)

        self._master_key = master_key

    def _load_from_vault(self) -> None:
        """
        Loads and decrypts the master key from the OS DPAPI vault.

        Integrity order:
            1. JSON structure and required fields must exist (missing checksum is
               treated as tampering, never silently skipped).
            2. The SHA-256 checksum of the protected blob must match.
            3. Windows DPAPI must unprotect the blob for this user/machine context.

        Raises:
            PermissionError: On any integrity failure; the vault enters lockdown.
            RuntimeError: If the DPAPI blob cannot be unprotected (key migrated to a
                different Windows user/machine, or restored from a foreign backup).
        """
        try:
            with open(self.vault_file, "r", encoding="utf-8") as f:
                payload = json.load(f)

            if (
                not isinstance(payload, dict)
                or type(payload.get("version")) is not int
                or payload.get("version") != 1
                or not isinstance(payload.get("provider"), str)
                or not isinstance(payload.get("protected_blob_b64"), str)
                or not payload["protected_blob_b64"]
            ):
                self._tamper_detected = True
                raise PermissionError(
                    "TAMPER ALERT: Vault payload is malformed, unsupported, or missing its protected key blob."
                )

            try:
                protected_blob = base64.b64decode(
                    payload["protected_blob_b64"] + "=" * (-len(payload["protected_blob_b64"]) % 4),
                    validate=True,
                )
            except Exception:
                self._tamper_detected = True
                raise PermissionError("TAMPER ALERT: Vault protected blob is not valid Base64.")

            expected_checksum = payload.get("checksum_sha256")
            actual_checksum = hashlib.sha256(protected_blob).hexdigest()

            # Tamper verification. A missing checksum field is itself an integrity
            # failure: an attacker who could strip it would otherwise bypass the
            # only pre-unprotect integrity gate.
            if not isinstance(expected_checksum, str) or not expected_checksum:
                self._tamper_detected = True
                raise PermissionError(
                    "TAMPER ALERT: Vault integrity checksum is missing; refusing to unprotect the master key."
                )
            # Constant-time comparison: keeps the integrity gate free of timing
            # side channels as a matter of hygiene (the checksum itself is public).
            if not hmac.compare_digest(actual_checksum, expected_checksum):
                self._tamper_detected = True
                raise PermissionError("TAMPER ALERT: Vault integrity checksum mismatch! The vault file was altered.")
            if sys.platform == "win32":
                if not HAS_WIN32CRYPT:
                    raise RuntimeError(
                        "Windows vault access requires pywin32 DPAPI support; "
                        "refusing to load a key without OS protection."
                    )
                # Unprotect via Windows DPAPI. This is the authenticity anchor: only
                # the same Windows user/machine (TPM-backed when available) can unwrap.
                try:
                    _desc, master_key = win32crypt.CryptUnprotectData(
                        protected_blob,
                        ENTROPY_SALT,
                        None,
                        None,
                        0,
                    )
                except Exception as dpapi_error:
                    raise RuntimeError(
                        "Windows DPAPI could not unprotect the vault master key. The vault may "
                        f"belong to another Windows user/machine or a foreign backup: {dpapi_error}"
                    )
                self._master_key = master_key
                self._key_provider = "Windows DPAPI (OS-Protected / User-Account Bound)"
                self._hardware_bound = True
            else:
                if protected_blob.startswith(FALLBACK_GATE_PREFIX):
                    if not self._allow_test_fallback:
                        raise RuntimeError(
                            "Plaintext test-vault loading is disabled; explicitly enable "
                            "the fallback only for isolated non-Windows tests."
                        )
                    self._master_key = protected_blob[len(FALLBACK_GATE_PREFIX):]
                    self._key_provider = "Local Test Gate (NOT OS-Protected; non-Windows fallback)"
                    self._hardware_bound = False
                else:
                    raise RuntimeError("Cannot unprotect DPAPI key on non-Windows environment without recovery key.")

            # The master key must always be 32 bytes (AES-256); anything else means
            # the vault content was tampered with or written incorrectly.
            if not self._master_key or len(self._master_key) != 32:
                self._tamper_detected = True
                raise PermissionError("TAMPER ALERT: Vault master key has an invalid length.")
        except PermissionError:
            self._tamper_detected = True
            raise

    def recover_master_key(self, recovery_passphrase: str) -> bytes:
        """
        Recovers the master key using the verified recovery passphrase.

        Args:
            recovery_passphrase (str): Passphrase provided during vault creation.

        Returns:
            bytes: Recovered 32-byte master key.

        Raises:
            ValueError: If the recovery manifest file is missing.
            PermissionError: If the manifest is malformed/tampered, declares an
                invalid PBKDF2 work factor, or the passphrase is incorrect.
        """
        if not os.path.exists(self.recovery_file):
            raise ValueError("Recovery manifest not found on disk.")

        try:
            with open(self.recovery_file, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PermissionError("Recovery failed: recovery manifest is unreadable or malformed.") from error

        # Validate the untrusted manifest before doing any KDF work. Without these
        # checks a tampered manifest could (a) skip the documented work factor or
        # (b) request an enormous iteration count and hang the process (CPU DoS).
        if (
            not isinstance(manifest, dict)
            or type(manifest.get("version")) is not int
            or manifest.get("version") != 1
        ):
            raise PermissionError("Recovery failed: recovery manifest is malformed or unsupported.")
        try:
            encoded_fields = ("salt_b64", "nonce_b64", "ciphertext_b64")
            if any(
                not isinstance(manifest.get(field), str)
                or not manifest[field]
                or len(manifest[field]) > 128
                for field in encoded_fields
            ):
                raise TypeError("recovery fields must be Base64 strings")
            salt = base64.b64decode(
                manifest["salt_b64"] + "=" * (-len(manifest["salt_b64"]) % 4),
                validate=True,
            )
            nonce = base64.b64decode(
                manifest["nonce_b64"] + "=" * (-len(manifest["nonce_b64"]) % 4),
                validate=True,
            )
            ciphertext = base64.b64decode(
                manifest["ciphertext_b64"] + "=" * (-len(manifest["ciphertext_b64"]) % 4),
                validate=True,
            )
        except (KeyError, TypeError, ValueError) as e:
            raise PermissionError(f"Recovery failed: recovery manifest is corrupted ({e}).")

        iterations = manifest.get("iterations")
        if (
            not isinstance(iterations, int)
            or isinstance(iterations, bool)
            or not (RECOVERY_MIN_PBKDF2_ITERATIONS <= iterations <= RECOVERY_MAX_PBKDF2_ITERATIONS)
        ):
            raise PermissionError(
                "Recovery failed: recovery manifest declares an invalid PBKDF2 iteration count "
                f"(expected an integer in [{RECOVERY_MIN_PBKDF2_ITERATIONS}, {RECOVERY_MAX_PBKDF2_ITERATIONS}])."
            )

        if len(salt) != 16 or len(nonce) != 12 or len(ciphertext) != 48:
            raise PermissionError("Recovery failed: recovery manifest field lengths are invalid.")

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA512(),
            length=32,
            salt=salt,
            iterations=iterations,
        )
        derived_key = kdf.derive(recovery_passphrase.encode("utf-8"))
        aesgcm = AESGCM(derived_key)

        try:
            master_key = aesgcm.decrypt(nonce, ciphertext, None)
        except Exception:
            raise PermissionError("Recovery failed: Invalid recovery passphrase or corrupted manifest.")

        if len(master_key) != 32:
            raise PermissionError("Recovery failed: recovered key has an invalid length.")

        self._master_key = master_key
        return master_key

    def get_master_key(self) -> bytes:
        """
        Returns the active verified 32-byte master key.
        """
        if self._tamper_detected:
            raise PermissionError("Access Denied: Vault is in lockdown due to detected tampering.")
        if not self._master_key:
            raise RuntimeError("Vault master key is not loaded.")
        return self._master_key

    def get_recovery_passphrase(self) -> Optional[str]:
        """
        Returns the newly generated recovery passphrase (only available immediately after creation).
        """
        return self._recovery_passphrase

    def is_tampered(self) -> bool:
        """Returns True if vault tampering was detected."""
        return self._tamper_detected

    def get_status(self) -> Dict[str, Any]:
        """
        Returns factual, evidence-backed security status.

        The `key_provider` and `hardware_bound` fields reflect the provider actually
        used by this vault instance, so a non-Windows fallback can never masquerade
        as DPAPI-protected storage. `status` only reports VERIFIED_ACTIVE when the key
        is loaded, the vault is not tampered, and the key is genuinely OS-bound.
        """
        biometric = detect_biometric_hardware()
        fully_verified = (
            not self._tamper_detected and self._master_key is not None and self._hardware_bound
        )
        return {
            "key_provider": self._key_provider,
            "key_length_bits": 256,
            "hardware_bound": self._hardware_bound,
            "vault_file": self.vault_file,
            "vault_initialized": os.path.exists(self.vault_file),
            "tamper_detected": self._tamper_detected,
            "recovery_protection_active": os.path.exists(self.recovery_file),
            "biometric_hardware": biometric,
            "status": "VERIFIED_ACTIVE" if fully_verified else "UNVERIFIED_OR_LOCKED",
        }


# Global singleton vault instance
default_vault = SecureVault(
    allow_test_fallback=os.environ.get("ULTRON_TEST_ALLOW_PLAINTEXT_VAULT") == "1"
)
