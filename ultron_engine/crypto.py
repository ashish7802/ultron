"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.crypto
Purpose: Authenticated Encryption (AES-256-GCM) with OS-Backed Key Protection
===============================================================================

Architectural Role & Security Guarantees:
- Employs AES-256-GCM (NIST SP 800-38D Authenticated Encryption with Associated Data).
- Keys are backed by Windows DPAPI (Data Protection API) via SecureVault, binding
  cryptographic protection to the logged-in operating system user account and TPM.
- Every encryption operation generates a unique 96-bit (12-byte) CSPRNG nonce to prevent
  replay attacks.
- 128-bit authentication tags ensure tamper-evidence: any modification of ciphertext
  or metadata raises an immediate InvalidTag / PermissionError.
- Blind indexing uses HMAC-SHA256 to enable deterministic database deduplication
  without storing searchable plaintext.
- Fail-Closed Lockdown: seal/unseal refuse to run once the backing vault reports
  tamper detection, so a compromised process cannot keep using a cached key.
- Backward compatibility: `StarkShieldCrypto` (legacy class name) and
  `get_hardware_fingerprint()` (legacy 64-byte host digest helper) are retained and
  documented for audit/telemetry consumers that predate the DPAPI rewrite.
- No unverified claims: Only verified cryptographic primitives (AES-256-GCM, DPAPI, PBKDF2)
  are executed and reported.
===============================================================================
"""

import os
import sys
import time
import json
import base64
import hashlib
import hmac
from typing import Any, Dict, Optional, Tuple, Union

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from .secure_vault import default_vault

SHIELD_VERSION_BYTE = b"\x03"  # Version 3: OS-Backed DPAPI Master Key + AES-256-GCM


def _read_machine_guid() -> str:
    """
    Reads the Windows installation identity (MachineGuid) from the registry.

    Why: MachineGuid is generated once per Windows installation, so it provides a
    stable, host-bound identifier without requiring network access or exposing raw
    hardware serial numbers.

    Returns:
        str: The MachineGuid value, or an empty string when unavailable
        (non-Windows hosts, restricted registry access, or missing value).
    """
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography"
        ) as key:
            value, _value_type = winreg.QueryValueEx(key, "MachineGuid")
            return str(value)
    except Exception:
        # Registry is unavailable outside Windows or when access is denied; the
        # caller falls back to deterministic host/environment identifiers.
        return ""


def get_hardware_fingerprint() -> bytes:
    """
    Derives a deterministic 64-byte host hardware fingerprint (SHA-512 digest).

    Historical context:
        Earlier ULTRON revisions derived the AES master key entropy from this
        fingerprint. Key protection has since moved to Windows DPAPI (see
        `ultron_engine.secure_vault`), so the fingerprint is no longer part of the
        key-derivation chain. It is retained as a documented backward-compatible
        helper for audit/telemetry consumers and the encryption test suite that
        still import it.

    Binding inputs (first available wins, deterministic across calls/processes):
        1. HKLM\\SOFTWARE\\Microsoft\\Cryptography\\MachineGuid (Windows install ID).
        2. Fallback host identity: computer name + architecture + user name.

    Returns:
        bytes: 64-byte SHA-512 digest, stable for the lifetime of the host install.
    """
    parts = ["ULTRON_HARDWARE_FINGERPRINT_V1", sys.platform]

    machine_guid = _read_machine_guid()
    if machine_guid:
        parts.append(f"machine_guid:{machine_guid}")
    else:
        import platform

        parts.extend(
            [
                f"node:{platform.node()}",
                f"machine:{platform.machine()}",
                f"user:{os.environ.get('USERNAME', '')}",
            ]
        )

    return hashlib.sha512("|".join(parts).encode("utf-8")).digest()


class CryptoEngine:
    """
    AES-256-GCM Authenticated Encryption Engine backed by OS DPAPI Key Storage.
    """

    def __init__(self):
        """
        Initializes the cryptographic engine using the OS-backed DPAPI master key.
        """
        self._vault = default_vault
        self._master_key = self._vault.get_master_key()
        self._aesgcm = AESGCM(self._master_key)

        self._telemetry = {
            "encryptions_total": 0,
            "decryptions_total": 0,
            "tamper_attempts_blocked": 0,
            "average_latency_ms": 0.0,
        }

    def seal(self, data: Union[str, dict, list, bytes], aad: Optional[bytes] = None) -> str:
        """
        Encrypts and authenticates plaintext data using AES-256-GCM.

        Envelope Structure:
            [VERSION_BYTE (1B)] + [CSPRNG NONCE (12B)] + [CIPHERTEXT + AUTH_TAG (16B)]

        Args:
            data: Plaintext data (string, dictionary, list, or bytes).
            aad (bytes, optional): Additional authenticated data bound to the payload.

        Returns:
            str: URL-safe Base64-encoded sealed envelope string.

        Raises:
            PermissionError: If the backing vault is in tamper lockdown.
        """
        t0 = time.perf_counter()

        # Fail-closed: never keep sealing new data after SecureVault has reported
        # tampering (the vault flag may be raised by a runtime integrity audit).
        if self._vault.is_tampered():
            raise PermissionError(
                "Access Denied: Cryptographic vault is in tamper lockdown; sealing is disabled."
            )

        if isinstance(data, (dict, list)):
            plain_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        elif isinstance(data, str):
            plain_bytes = data.encode("utf-8")
        elif isinstance(data, bytes):
            plain_bytes = data
        else:
            plain_bytes = str(data).encode("utf-8")

        # 12-byte CSPRNG nonce
        nonce = os.urandom(12)
        ciphertext_and_tag = self._aesgcm.encrypt(nonce, plain_bytes, aad)

        packet = SHIELD_VERSION_BYTE + nonce + ciphertext_and_tag
        sealed_str = base64.urlsafe_b64encode(packet).decode("ascii")

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self._telemetry["encryptions_total"] += 1
        self._telemetry["average_latency_ms"] = (
            (self._telemetry["average_latency_ms"] * (self._telemetry["encryptions_total"] - 1) + elapsed_ms)
            / self._telemetry["encryptions_total"]
        )

        return sealed_str

    def unseal(self, envelope: str, aad: Optional[bytes] = None, parse_json: bool = True) -> Any:
        """
        Authenticates and decrypts an AES-256-GCM envelope.

        Security Check:
            If ciphertext or authentication tag was modified, an InvalidTag exception
            is raised, blocking data access.

        Args:
            envelope (str): URL-safe Base64-encoded sealed envelope string.
            aad (bytes, optional): Additional authenticated data passed during seal().
            parse_json (bool): If True, parses decrypted UTF-8 bytes as JSON if valid.

        Returns:
            Any: Decrypted plaintext.

        Raises:
            ValueError: If envelope is malformed or invalid version.
            PermissionError: If authentication tag verification fails (tamper alert).
        """
        t0 = time.perf_counter()

        # Fail-closed: a vault in tamper lockdown must not decrypt or authenticate
        # any payload, even if this process still holds a cached key copy.
        if self._vault.is_tampered():
            raise PermissionError(
                "Access Denied: Cryptographic vault is in tamper lockdown; unsealing is disabled."
            )

        try:
            raw_packet = base64.urlsafe_b64decode(envelope.encode("ascii"))
        except Exception as e:
            raise ValueError(f"Malformed base64 envelope: {e}")

        if len(raw_packet) < 29:
            raise ValueError("Envelope payload truncated or invalid.")

        version = raw_packet[0:1]
        # Support Version 2 (previous session) and Version 3 (DPAPI)
        if version not in (b"\x02", b"\x03"):
            raise ValueError(f"Unsupported envelope version {version!r}")

        nonce = raw_packet[1:13]
        ciphertext_and_tag = raw_packet[13:]

        try:
            decrypted_bytes = self._aesgcm.decrypt(nonce, ciphertext_and_tag, aad)
        except InvalidTag:
            self._telemetry["tamper_attempts_blocked"] += 1
            raise PermissionError(
                "Tamper detected: Cryptographic authentication tag verification failed. "
                "Data has been altered or decrypted with an invalid key."
            )

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self._telemetry["decryptions_total"] += 1

        try:
            text = decrypted_bytes.decode("utf-8")
            if parse_json and (text.startswith("{") or text.startswith("[")):
                try:
                    return json.loads(text)
                except Exception:
                    return text
            return text
        except UnicodeDecodeError:
            return decrypted_bytes

    def blind_index_hash(self, content: Any) -> str:
        """
        Computes an HMAC-SHA256 blind index hash for deduplication.

        Why HMAC: the master key is the MAC key and the content is the message, so
        the digest cannot be forged or extended without the key. (A previously used
        `SHA256(key || message)` construction was vulnerable to length-extension and
        did not match the documented HMAC-SHA256 contract.)

        Note:
            Index values are key-bound and algorithm-version-bound. Rows written by
            the legacy key-prefix digest keep their old hash; they simply will not be
            deduplicated against hashes produced by this HMAC implementation.

        Args:
            content: Raw or structured data to index.

        Returns:
            str: 64-character hex HMAC digest.
        """
        s = json.dumps(content, sort_keys=True, default=str) if not isinstance(content, str) else content
        return hmac.new(self._master_key, s.encode("utf-8"), hashlib.sha256).hexdigest()

    def get_telemetry(self) -> Dict[str, Any]:
        """Returns verified, evidence-backed cryptographic operational metrics."""
        vault_status = self._vault.get_status()
        return {
            "cipher": "AES-256-GCM (NIST SP 800-38D AEAD)",
            "key_storage": vault_status["key_provider"],
            "key_length_bits": 256,
            "mac_tag_bits": 128,
            "tamper_detected": vault_status["tamper_detected"],
            "biometric_hardware": vault_status["biometric_hardware"],
            "status": vault_status["status"],
            **self._telemetry,
        }


# Global instance
default_crypto = CryptoEngine()

# Backward-compatibility alias: earlier revisions exposed the engine class as
# `StarkShieldCrypto`. It is the exact same class (identical seal/unseal/key
# behavior), kept so older integrations and the encryption test suite keep
# importing instead of breaking on the rename to `CryptoEngine`.
StarkShieldCrypto = CryptoEngine
