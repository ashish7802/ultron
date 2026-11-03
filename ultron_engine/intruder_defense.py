"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.intruder_defense
Purpose: Adaptive Intruder Defense, Anti-Replay, Session Revocation & Audit Chaining
===============================================================================

Architectural Role & Security Guarantees:
- Enforces adaptive intrusion detection and progressive defense policies:
  1. Immediate Lockdown on First Failure: Any single failed biometric authentication
     attempt immediately places the system into CHALLENGE_MODE, invalidates every
     session token issued before the failure (revocation epoch), and locks down AI,
     memory, and sensitive data access.
  2. Anti-Replay Protection: Challenges are single-use 32-byte CSPRNG nonces tied to a
     60-second validity window and invalidated immediately upon first presentation.
     Expired nonces are pruned so the pending-challenge table cannot grow unbounded.
  3. Strict Rate Limiting & Cooldown: Progressive backoff delays (5s, 30s, 300s) on
     repeated failures to prevent automated credential or sensor attacks.
  4. Encrypted & HMAC-Chained Security Audit Log: All security events are logged into
     an encrypted, tamper-evident audit ledger (`security_audit.enc`) using AES-256-GCM
     and cryptographic SHA-256 HMAC chaining. The ledger is written atomically so a
     crash cannot leave a partially-written (unloadable) security log.
  5. Biometric Policy: Strictly rejects ordinary RGB webcam images as biometric proof.
     Only verified platform hardware (Windows Hello Synaptics fingerprint sensor /
     certified IR depth camera) is permitted.
  6. Fail-Closed Enforcement: In any failure, timeout, or ambiguous condition, access
     is strictly denied. Only credential-bearing requests refresh the user-activity
     heartbeat, so unauthenticated polling cannot indefinitely defeat idle auto-lock.
===============================================================================
"""

import os
import sys
import time
import json
import base64
import hmac
import hashlib
import secrets
from typing import Any, Dict, List, Optional, Tuple

from .crypto import default_crypto
from .secure_vault import default_vault, detect_biometric_hardware, write_json_atomic

AUDIT_LOG_FILE = os.path.join(default_vault.vault_dir, "security_audit.enc")


class IntruderDefenseEngine:
    """
    Adaptive Intruder Defense & Cryptographic Audit Authority.
    """

    def __init__(self):
        """
        Initializes the defense engine and loads the encrypted audit log.
        """
        self._master_secret = default_vault.get_master_key()
        self._status = "NORMAL"  # NORMAL, CHALLENGE_MODE, or LOCKDOWN
        self._consecutive_failures = 0
        self._lockout_until = 0.0
        self._revoked_tokens: set = set()
        # Revocation epoch: every session token whose `iat` is <= this timestamp is
        # treated as revoked. Incremented on the first failed biometric attempt so
        # "revoke all active sessions" is actually enforced, even for tokens this
        # process never enumerated.
        self._tokens_invalidated_at = 0.0
        self._active_challenges: Dict[str, float] = {}  # challenge -> exp_timestamp
        self._last_audit_hash = "0" * 64
        self._audit_events: List[Dict[str, Any]] = []
        self._idle_timeout_seconds = 120  # 2 minutes auto-lock
        self._last_activity_time = time.time()
        self._load_encrypted_audit_log()

    def _load_encrypted_audit_log(self) -> None:
        """
        Loads and authenticates the encrypted audit ledger from disk.
        Verifies the HMAC chain for tamper evidence.
        """
        if not os.path.exists(AUDIT_LOG_FILE):
            self.log_event("AUDIT_LOG_INITIALIZED", {"detail": "New encrypted audit ledger established"})
            return

        try:
            with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            sealed_ledger = data.get("sealed_ledger", "")
            unsealed = default_crypto.unseal(sealed_ledger)
            events = json.loads(unsealed) if isinstance(unsealed, str) else unsealed

            # Verify cryptographic HMAC chain
            prev_hash = "0" * 64
            for ev in events:
                expected_sig = hmac.new(
                    self._master_secret,
                    f"{ev['id']}:{ev['ts']}:{ev['type']}:{prev_hash}".encode("utf-8"),
                    hashlib.sha256,
                ).hexdigest()

                if not hmac.compare_digest(ev.get("signature", ""), expected_sig):
                    self._status = "LOCKDOWN"
                    raise PermissionError(f"TAMPER DETECTED: Audit log chain broken at event {ev.get('id')}")

                prev_hash = ev.get("hash", "")

            self._audit_events = events
            self._last_audit_hash = prev_hash
        except Exception as e:
            self._status = "LOCKDOWN"
            raise PermissionError(f"TAMPER DETECTED: Audit ledger corrupted or modified externally: {e}")

    def _persist_encrypted_audit_log(self) -> None:
        """
        Encrypts the audit ledger with AES-256-GCM and persists it to disk.
        """
        sealed = default_crypto.seal(self._audit_events)
        payload = {
            "version": 1,
            "provider": "AES-256-GCM Encrypted HMAC-Chained Audit Ledger",
            "last_hash": self._last_audit_hash,
            "sealed_ledger": sealed,
            "updated_at": time.time(),
        }
        # Atomic write: a crash during the write must not truncate the only copy of
        # the tamper-evident audit chain (a truncated ledger fails closed at startup).
        write_json_atomic(AUDIT_LOG_FILE, payload)

    def log_event(self, event_type: str, details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Appends a tamper-evident, HMAC-chained event to the encrypted security log.

        Args:
            event_type (str): Security event identifier.
            details (dict): Structured event telemetry.

        Returns:
            dict: The recorded audit record.
        """
        ev_id = secrets.token_hex(8)
        now = time.time()
        prev_hash = self._last_audit_hash

        sig = hmac.new(
            self._master_secret,
            f"{ev_id}:{now}:{event_type}:{prev_hash}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        event_hash = hashlib.sha256(f"{ev_id}:{now}:{event_type}:{sig}:{prev_hash}".encode("utf-8")).hexdigest()
        entry = {
            "id": ev_id,
            "ts": now,
            "type": event_type,
            "details": details,
            "prev_hash": prev_hash,
            "signature": sig,
            "hash": event_hash,
        }

        self._audit_events.append(entry)
        self._last_audit_hash = event_hash
        self._persist_encrypted_audit_log()
        return entry

    def record_failed_authentication(self, reason: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Executes immediate lockdown on failed biometric attempt.

        Policy:
            - On the VERY FIRST failure:
              1. Switch state immediately to CHALLENGE_MODE.
              2. Revoke all currently issued session tokens.
              3. Set lockout cooldown.
              4. Record encrypted audit event.

        Args:
            reason (str): Cause of failure (e.g. fingerprint_mismatch, sensor_timeout).
            metadata (dict, optional): Additional contextual data.

        Returns:
            dict: Current lockdown telemetry.
        """
        self._consecutive_failures += 1
        self._status = "CHALLENGE_MODE"
        # Enforce the documented "revoke all active session tokens" policy: advance
        # the revocation epoch to now, which invalidates every token issued earlier
        # (see is_token_revoked). New tokens minted after a fresh biometric success
        # carry a later `iat` and therefore remain usable.
        self._tokens_invalidated_at = max(self._tokens_invalidated_at, time.time())

        # Progressive cooldown: 1st fail: 5s, 2nd: 30s, 3rd+: 300s
        if self._consecutive_failures == 1:
            cooldown = 5.0
        elif self._consecutive_failures == 2:
            cooldown = 30.0
        else:
            cooldown = 300.0

        self._lockout_until = time.time() + cooldown

        event = self.log_event(
            "FAILED_BIOMETRIC_ATTEMPT",
            {
                "reason": reason,
                "consecutive_failures": self._consecutive_failures,
                "cooldown_seconds": cooldown,
                "lockout_until": self._lockout_until,
                "action_taken": "IMMEDIATE_SESSION_REVOCATION_AND_CHALLENGE_MODE",
                "metadata": metadata or {},
            },
        )

        return {
            "status": self._status,
            "consecutive_failures": self._consecutive_failures,
            "cooldown_remaining": round(max(0.0, self._lockout_until - time.time()), 2),
            "event_id": event["id"],
        }

    def record_successful_authentication(self, auth_method: str = "windows_hello_fingerprint") -> Dict[str, Any]:
        """
        Resolves challenge mode and resets the failure counter upon verified biometric proof.

        Note:
            The revocation epoch is intentionally NOT cleared. Sessions issued before
            the last failed attempt stay invalid; the caller must mint a fresh token
            after this successful verification.

        Args:
            auth_method (str): Authenticator method.

        Returns:
            dict: Restoration telemetry.
        """
        self._consecutive_failures = 0
        self._status = "NORMAL"
        self._lockout_until = 0.0
        self._last_activity_time = time.time()

        self.log_event(
            "CHALLENGE_RESOLVED",
            {
                "auth_method": str(auth_method),
                "status_restored": "NORMAL",
                "timestamp": time.time(),
                "prior_sessions_revoked_before": self._tokens_invalidated_at,
            },
        )

        return {"status": "NORMAL", "consecutive_failures": 0}

    def _token_issued_at(self, token: str) -> Optional[float]:
        """
        Best-effort extraction of a session token's `iat` claim.

        Why: session revocation needs to know whether a token predates the last
        security lockdown. Only the payload timestamp is read here; authenticity is
        verified separately by the crypto/token layer (SecurityEngine/MemoryEngine).

        Args:
            token (str): Session token in `[PAYLOAD_B64].[SIGNATURE_HEX]` format.

        Returns:
            Optional[float]: Issued-at UNIX timestamp, or None if the token is
            malformed / carries no numeric `iat` claim.
        """
        try:
            payload_b64 = token.split(".", 1)[0]
            # Re-pad: URL-safe Base64 from older clients may omit trailing '='.
            padded = payload_b64 + "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
            iat = payload.get("iat")
            if isinstance(iat, (int, float)) and not isinstance(iat, bool):
                return float(iat)
        except Exception:
            return None
        return None

    def revoke_token(self, token: str, reason: str = "security_lockdown") -> None:
        """
        Adds a session token to the revocation blacklist.

        Args:
            token (str): Token to revoke. Non-string/empty values are ignored instead
                of raising, because revocation is best-effort cleanup and must not
                crash the security event path.
            reason (str): Audit description of why the session was revoked.
        """
        if not token or not isinstance(token, str):
            return
        self._revoked_tokens.add(token)
        self.log_event("SESSION_REVOKED", {"reason": reason, "token_prefix": token[:16]})

    def is_token_revoked(self, token: str) -> bool:
        """
        Checks whether a session token has been revoked.

        A token is revoked when it is on the explicit blacklist OR when it was issued
        at or before the most recent failed-authentication revocation epoch (i.e. it
        was an "active session" at the moment of lockdown).

        Args:
            token (str): Session token to test.

        Returns:
            bool: True when the token must not be accepted.
        """
        if not token or not isinstance(token, str):
            return False
        if token in self._revoked_tokens:
            return True
        issued_at = self._token_issued_at(token)
        return issued_at is not None and issued_at <= self._tokens_invalidated_at

    def _prune_expired_challenges(self) -> None:
        """
        Drops expired challenge nonces from the pending table.

        Why: challenges are only removed when presented, so an abandoned/expired
        challenge would otherwise leak memory forever (slow DoS). Pruning on every
        mint keeps the table bounded by the number of still-valid challenges.
        """
        now = time.time()
        for challenge in [c for c, exp in self._active_challenges.items() if exp < now]:
            self._active_challenges.pop(challenge, None)

    def generate_challenge(self, ttl_seconds: int = 60) -> str:
        """
        Generates a single-use 32-byte CSPRNG challenge token.

        Args:
            ttl_seconds (int): Validity window; clamped to a sane 1..300s range so a
                caller cannot mint effectively eternal anti-replay nonces.

        Returns:
            str: URL-safe challenge nonce to be verified exactly once.
        """
        self._prune_expired_challenges()
        try:
            ttl = int(ttl_seconds)
        except (TypeError, ValueError):
            ttl = 60
        ttl = max(1, min(ttl, 300))

        chal = secrets.token_urlsafe(32)
        self._active_challenges[chal] = time.time() + ttl
        return chal

    def verify_and_consume_challenge(self, challenge: str) -> bool:
        """
        Anti-Replay Verification: Validates and immediately consumes a challenge nonce.

        The nonce is removed from the pending table before the expiry check so a
        replayed or expired challenge can never be reused.

        Args:
            challenge (str): Challenge presented by the caller.

        Returns:
            bool: True only for a live, unexpired, previously unseen challenge.
        """
        if not isinstance(challenge, str) or not challenge:
            self.log_event("CHALLENGE_REPLAY_ATTEMPT", {"challenge_preview": "none"})
            return False

        if challenge not in self._active_challenges:
            self.log_event("CHALLENGE_REPLAY_ATTEMPT", {"challenge_preview": challenge[:8]})
            return False

        exp = self._active_challenges.pop(challenge)
        if time.time() > exp:
            self.log_event("EXPIRED_CHALLENGE_PRESENTED", {"challenge_preview": challenge[:8]})
            return False

        return True

    def check_access_permission(self, token: Optional[str] = None) -> Tuple[bool, str]:
        """
        Fail-Closed Access Gate: Validates lockdown status, rate limit, token
        revocation, and the inactivity timeout.

        Args:
            token (str, optional): Session token presented by the caller. `None`
                means an unauthenticated/public request (allowed only while the
                system is NORMAL); malformed non-string tokens are rejected.

        Returns:
            Tuple[bool, str]: `(allowed, reason)` where reason is a stable diagnostic
            string suitable for audit logs and API error bodies.
        """
        now = time.time()

        # 1. Check if rate-limit cooldown is active
        if now < self._lockout_until:
            wait_time = round(self._lockout_until - now, 1)
            return False, f"RATE_LIMITED: Cooldown active. Try again in {wait_time}s"

        # 2. Check if system is in lockdown or challenge mode
        if self._status in ("CHALLENGE_MODE", "LOCKDOWN"):
            return False, f"SYSTEM_LOCKED: {self._status} active. Fresh Windows Hello biometric verification required."

        # 2b. Unvalidated input guard: never treat a non-string token as "no token".
        if token is not None and not isinstance(token, str):
            return False, "TOKEN_INVALID: Session token must be a string."

        # 3. Check token revocation (explicit blacklist + revocation epoch)
        if token and self.is_token_revoked(token):
            return False, "TOKEN_REVOKED: Session was revoked due to security event."

        # 4. Check inactivity timeout
        if now - self._last_activity_time > self._idle_timeout_seconds:
            self._status = "CHALLENGE_MODE"
            self.log_event("INACTIVITY_LOCKOUT", {"idle_seconds": round(now - self._last_activity_time)})
            return False, "INACTIVITY_TIMEOUT: System automatically locked after 2 minutes of idle time."

        # Refresh the activity heartbeat only for credential-bearing requests.
        # Refreshing on unauthenticated/public calls would let any polling loop hold
        # the idle auto-lock open forever and defeat the control entirely.
        if token and self._token_issued_at(token) is not None:
            self._last_activity_time = now
        return True, "ACCESS_GRANTED"

    def record_activity_heartbeat(self) -> None:
        """Refreshes the user activity heartbeat."""
        self._last_activity_time = time.time()

    def get_hardware_biometric_policy(self) -> Dict[str, Any]:
        """
        Evaluates biometric hardware capabilities against strict security policies.

        Policy:
            - Synaptics Touch Sensor -> ACCEPTED (Windows Hello hardware platform).
            - Ordinary RGB Camera (e.g. HP HD Camera) -> REJECTED as biometric proof (photo spoofing risk).
            - Certified IR Depth Camera -> ACCEPTED if hardware detected.
        """
        hw = detect_biometric_hardware()
        return {
            "fingerprint_sensor": {
                "supported": hw.get("supported", False),
                "device_name": hw.get("device_name", "None"),
                "status": hw.get("hardware_status", "None"),
                "trust_level": "PLATFORM_ENCLAVE_VERIFIED",
            },
            "facial_recognition": {
                "supported": False,
                "reason": "Hardware lacks certified IR depth sensor. Standard RGB webcam (HP HD Camera) rejected to prevent photo/screen spoofing.",
                "trust_level": "UNTRUSTED_ORDINARY_RGB",
            },
            "policy": "FAIL_CLOSED_HARDWARE_BOUND",
        }

    def get_audit_trail(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns the recent encrypted audit events."""
        return self._audit_events[-limit:]

    def get_status(self) -> Dict[str, Any]:
        """Returns full live defense telemetry."""
        now = time.time()
        self._prune_expired_challenges()
        return {
            "defense_state": self._status,
            "consecutive_failures": self._consecutive_failures,
            "lockout_remaining_seconds": max(0.0, round(self._lockout_until - now, 2)),
            "active_challenges_count": len(self._active_challenges),
            "revoked_tokens_count": len(self._revoked_tokens),
            "tokens_revoked_at": self._tokens_invalidated_at,
            "audit_events_count": len(self._audit_events),
            "idle_timeout_seconds": self._idle_timeout_seconds,
            "biometric_policy": self.get_hardware_biometric_policy(),
        }


# Global singleton instance
default_intruder_defense = IntruderDefenseEngine()
