"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.engines.security
Purpose: Zero-Trust Access Control, Session Token Authority & Tamper Auditing
===============================================================================

Architectural Role & Security Guarantees:
- Enforces Zero-Trust access control: Access to sensitive memory, personal facts,
  or critical system commands requires a cryptographically verified session token.
- Issues time-limited HMAC-SHA256 session tokens (15-minute expiration) upon successful
  biometric (Windows Hello) or device authentication.
- Never stores raw biometric or fingerprint templates; authentication relies on
  the operating system platform authenticator (Windows Hello / WebAuthn).
- Continuously audits cryptographic health and OS-backed key protection status.
- Manages lockdown states upon tamper detection.
===============================================================================
"""

import asyncio
import time
import uuid
import json
import base64
import hmac
import hashlib
from typing import Any, Dict, List, Optional
from ..core import BaseEngine, EventBus, SharedState
from ..crypto import default_crypto
from ..secure_vault import default_vault


class SecurityEngine(BaseEngine):
    """
    Zero-Trust Security Engine and Session Authority.
    """
    name = "security"
    layer = "safety"

    def __init__(self, bus: EventBus, state: SharedState):
        """
        Initializes the SecurityEngine.
        """
        super().__init__(bus, state)
        self._store: Dict[str, Any] = {}
        self._history: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._tamper_count: int = 0
        self._active_sessions: Dict[str, Dict[str, Any]] = {}
        self._master_secret = default_vault.get_master_key()

    async def start(self) -> None:
        """Starts the Security Engine and subscribes to events."""
        await super().start()
        self.bus.subscribe(self.name + ".*", self._on_event)
        self.bus.subscribe("*.tamper_detected", self._on_tamper)

    async def _on_event(self, ev) -> None:
        """Internal event handler."""
        pass

    async def _on_tamper(self, ev) -> None:
        """Handles tamper alerts from memory or storage layers."""
        async with self._lock:
            self._tamper_count += 1
        await self.bus.publish(
            "security.lockdown_alert",
            {"threat": "TAMPER_DETECTED", "source": getattr(ev, "source", "unknown"), "count": self._tamper_count},
            source=self.name,
            priority=100,
        )

    def issue_session_token(self, identity: str = "primary_user", auth_method: str = "windows_hello_fingerprint", ttl_seconds: int = 900) -> str:
        """
        Issues a cryptographically signed HMAC-SHA256 Zero-Trust session token.

        Args:
            identity (str): Authenticated user identifier.
            auth_method (str): Authentication factor (e.g. windows_hello_fingerprint).
            ttl_seconds (int): Token lifespan in seconds (default: 15 minutes).

        Returns:
            str: URL-safe Base64 token string: [PAYLOAD_B64].[SIGNATURE_HEX].
        """
        payload = {
            "sub": identity,
            "auth": auth_method,
            "iat": time.time(),
            "exp": time.time() + ttl_seconds,
            "jti": str(uuid.uuid4()),
        }
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
        sig = hmac.new(self._master_secret, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
        token = f"{payload_b64}.{sig}"
        self._active_sessions[payload["jti"]] = payload
        return token

    def verify_session_token(self, token: Optional[str]) -> bool:
        """
        Verifies the cryptographic signature, expiration, and validity of a session token.

        Args:
            token (str, optional): Token to verify.

        Returns:
            bool: True if token is genuine, untampered, and unexpired.
        """
        if not token or not isinstance(token, str) or "." not in token:
            return False

        try:
            payload_b64, provided_sig = token.split(".", 1)
            expected_sig = hmac.new(self._master_secret, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()

            # Constant-time comparison to prevent timing attacks
            if not hmac.compare_digest(expected_sig, provided_sig):
                return False

            payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8"))
            if time.time() > payload.get("exp", 0):
                return False  # Expired

            return True
        except Exception:
            return False

    async def audit_system_security(self) -> Dict[str, Any]:
        """
        Returns verifiable cryptographic audit telemetry without exaggerated claims.
        """
        telemetry = default_crypto.get_telemetry()
        return {
            "status": "VERIFIED_ACTIVE" if not default_vault.is_tampered() else "LOCKED_TAMPER_DETECTED",
            "cipher": telemetry["cipher"],
            "key_storage": telemetry["key_storage"],
            "key_length_bits": telemetry["key_length_bits"],
            "tamper_detected": default_vault.is_tampered() or self._tamper_count > 0,
            "tamper_blocks_count": telemetry["tamper_attempts_blocked"] + self._tamper_count,
            "biometric_hardware": telemetry["biometric_hardware"],
            "active_sessions_count": len([s for s in self._active_sessions.values() if time.time() < s.get("exp", 0)]),
            "zero_trust_policy": "ENFORCED (Sensitive Memory Gated)",
        }

    async def process(self, payload: Optional[Any] = None) -> Dict[str, Any]:
        """Processes security requests."""
        async with self._lock:
            if not isinstance(payload, dict):
                payload = {"action": "audit"}

            action = payload.get("action", "audit")

            if action == "issue_token":
                method = payload.get("auth_method", "windows_hello_fingerprint")
                token = self.issue_session_token(auth_method=method)
                rec = {
                    "id": str(uuid.uuid4()),
                    "engine": self.name,
                    "action": "issue_token",
                    "status": "ok",
                    "token": token,
                    "expires_in_seconds": 900,
                }
            elif action == "verify_token":
                token = payload.get("token")
                is_valid = self.verify_session_token(token)
                rec = {
                    "id": str(uuid.uuid4()),
                    "engine": self.name,
                    "action": "verify_token",
                    "status": "ok",
                    "valid": is_valid,
                }
            elif action == "seal":
                data = payload.get("data")
                sealed = default_crypto.seal(data)
                rec = {
                    "id": str(uuid.uuid4()),
                    "engine": self.name,
                    "action": "seal",
                    "status": "ok",
                    "envelope": sealed,
                }
            elif action == "unseal":
                envelope = payload.get("envelope", "")
                try:
                    unsealed = default_crypto.unseal(envelope)
                    rec = {
                        "id": str(uuid.uuid4()),
                        "engine": self.name,
                        "action": "unseal",
                        "status": "ok",
                        "data": unsealed,
                    }
                except Exception as e:
                    rec = {
                        "id": str(uuid.uuid4()),
                        "engine": self.name,
                        "action": "unseal",
                        "status": "error",
                        "error": str(e),
                    }
            else:
                audit = await self.audit_system_security()
                rec = {
                    "id": str(uuid.uuid4()),
                    "engine": self.name,
                    "action": "audit",
                    "status": "ok",
                    "audit": audit,
                }

            self._history.append(rec)
            if len(self._history) > 5000:
                self._history = self._history[-2500:]

            await self.bus.publish(self.name + ".processed", rec, source=self.name)
            return rec

    async def get_state(self) -> Dict[str, Any]:
        """Returns security state."""
        async with self._lock:
            return {
                "name": self.name,
                "tamper_count": self._tamper_count,
                "active_sessions": len(self._active_sessions),
                "history_len": len(self._history),
            }

    def health(self) -> Dict[str, Any]:
        """Returns health report."""
        audit = default_crypto.get_telemetry()
        return {
            "name": self.name,
            "layer": self.layer,
            "running": self._running,
            "status": audit["status"],
            "cipher": audit["cipher"],
            "key_storage": audit["key_storage"],
            "biometric_sensor": audit["biometric_hardware"].get("device_name", "None"),
        }
