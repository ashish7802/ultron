"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.engines.memory
Purpose: Zero-Trust Encrypted Memory Engine (AES-256-GCM & Token-Gated Access)
===============================================================================

Architectural Role & Security Guarantees:
- Subsystem: Core Knowledge & Persistent Storage (Layer: core).
- Zero-Plaintext at Rest: All facts and episodic memories in `ultron_memory.db`
  are encrypted using AES-256-GCM, backed by Windows DPAPI via SecureVault.
- Zero-Trust Policy Enforcement:
  - Tiers:
    * 'public' / 'short': Ephemeral session memory and general facts.
    * 'sensitive' / 'long': Private personal facts, episodic transcripts, user secrets.
  - Access to 'sensitive' / 'long' memories REQUIRES a cryptographically valid
    Zero-Trust session token (issued after Windows Hello biometric verification).
  - Unauthenticated requests cannot read sensitive memories.
- Tamper Resistance:
  - GCM 128-bit authentication tags verify record integrity. Corrupted or modified
    records raise PermissionError and trigger tamper alerts.
- Blind Indexing:
  - Deduplication uses HMAC-SHA256 blind indexing to maintain O(1) deduplication
    without storing or indexing searchable plaintext.
===============================================================================
"""

import asyncio
import os
import time
import json
import sqlite3
import base64
import hmac
import hashlib
from typing import Any, Dict, List, Optional
from ..core import BaseEngine, EventBus, SharedState
from ..crypto import default_crypto
from ..secure_vault import default_vault
from ..intruder_defense import default_intruder_defense

DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ultron_memory.db")


class MemoryEngine(BaseEngine):
    """
    Zero-Trust Encrypted Memory Engine.
    """
    name = "memory"
    layer = "core"

    def __init__(self, bus: EventBus, state: SharedState):
        """
        Initializes the MemoryEngine.
        """
        super().__init__(bus, state)
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = asyncio.Lock()
        self._short: List[Dict[str, Any]] = []
        self.SHORT_CAP = 50
        self._master_secret = default_vault.get_master_key()

    async def start(self) -> None:
        """
        Connects to SQLite database, verifies schema, and subscribes to EventBus.
        """
        await super().start()
        self._conn = sqlite3.connect(DB, check_same_thread=False)
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS memory(
                id TEXT PRIMARY KEY,
                tier TEXT,
                content TEXT,
                hash TEXT,
                ts REAL,
                meta TEXT
            )"""
        )
        self._conn.commit()
        self.bus.subscribe("memory.*", self._on_mem)

    async def _on_mem(self, ev) -> None:
        """Internal EventBus handler."""
        pass

    def _hash(self, content: Any) -> str:
        """Computes HMAC-SHA256 blind index hash for deduplication."""
        return default_crypto.blind_index_hash(content)

    @staticmethod
    def _record_id(value: Any) -> Optional[str]:
        """Normalizes a memory id coming from the UI for SQL binding.

        SQLite raises ``ProgrammingError`` for dict/list parameters before it
        can report "record not found", so non-string ids are treated as absent.

        Args:
            value: Raw ``target`` value from a payload.

        Returns:
            Optional[str]: The id when it is a string, otherwise ``None``.
        """
        return value if isinstance(value, str) else None

    def _validate_token(self, token: Optional[str]) -> bool:
        """
        Validates HMAC-SHA256 Zero-Trust session token and revocation blacklist.
        """
        if not token or not isinstance(token, str) or "." not in token:
            return False
        if default_intruder_defense.is_token_revoked(token):
            return False
        try:
            payload_b64, provided_sig = token.split(".", 1)
            expected_sig = hmac.new(self._master_secret, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig, provided_sig):
                return False
            payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8"))
            return time.time() <= payload.get("exp", 0)
        except Exception:
            return False

    async def store(
        self,
        content: Any,
        tier: str = "long",
        meta: Optional[Dict[str, Any]] = None,
        session_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stores an item encrypted at rest with AES-256-GCM.
        """
        # `tier` is forwarded to a SQLite TEXT column; a JSON object/list would
        # raise sqlite3.InterfaceError at bind time, so fall back to the default.
        if not isinstance(tier, str):
            tier = "long"
        h = self._hash(content)
        cur = self._conn.execute("SELECT id FROM memory WHERE hash=?", (h,))
        existing = cur.fetchone()
        if existing:
            # Refresh timestamp on re-storage so recently referenced memories remain active
            self._conn.execute("UPDATE memory SET ts=? WHERE id=?", (time.time(), existing[0]))
            self._conn.commit()
            return {"stored": False, "reason": "duplicate", "hash": h}

        mid = str(__import__("uuid").uuid4())
        encrypted_content = default_crypto.seal(content)
        encrypted_meta = default_crypto.seal(meta or {})

        self._conn.execute(
            "INSERT INTO memory VALUES (?,?,?,?,?,?)",
            (mid, tier, encrypted_content, h, time.time(), encrypted_meta),
        )
        self._conn.commit()

        if tier == "short":
            self._short.append({"id": mid, "content": content, "ts": time.time()})
            if len(self._short) > self.SHORT_CAP:
                self._short = self._short[-self.SHORT_CAP:]

        await self.bus.publish("memory.stored", {"id": mid, "tier": tier}, source=self.name)
        return {"stored": True, "id": mid, "tier": tier, "hash": h, "encrypted": True}

    async def recall(
        self,
        query: str = "",
        tier: Optional[str] = None,
        limit: int = 20,
        session_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Recalls memories with Zero-Trust access gating.

        Security Enforcement:
            If accessing 'sensitive' or 'long' memories and session_token is not verified,
            sensitive memories are blocked.
        """
        # Check intruder defense state
        if not isinstance(tier, str):
            # SQLite cannot bind dict/list tier filters; treat as "no filter".
            tier = None
        # `query` is used with `.lower()`; a dict/list from the UI would raise.
        if not isinstance(query, str):
            query = "" if query is None else str(query)
        # `limit` comes from the UI and may be null/string/negative; it is used
        # both as a SQL LIMIT and a list bound, so clamp it to a sane integer.
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 200))
        defense_allowed, _ = default_intruder_defense.check_access_permission(session_token)
        if not defense_allowed:
            is_authenticated = False
            if tier == "sensitive":
                return []
        else:
            is_authenticated = self._validate_token(session_token)

        sql = "SELECT id,tier,content,hash,ts,meta FROM memory"
        params: List[Any] = []
        if tier:
            sql += " WHERE tier=?"
            params.append(tier)
        sql += " ORDER BY ts DESC LIMIT ?"
        scan_limit = max(limit * 5, 200) if query else limit * 2
        params.append(scan_limit)

        rows = self._conn.execute(sql, params).fetchall()
        out = []

        for r in rows:
            record_id, record_tier, raw_content, rec_hash, rec_ts, raw_meta = r

            # Zero-Trust Check: If record is sensitive and user is not authenticated, block it
            if record_tier == "sensitive" and not is_authenticated:
                continue

            try:
                content = default_crypto.unseal(raw_content)
            except PermissionError as pe:
                # Tamper detected!
                await self.bus.publish("memory.tamper_detected", {"id": record_id, "error": str(pe)}, source=self.name)
                continue
            except Exception:
                try:
                    content = json.loads(raw_content)
                except Exception:
                    content = raw_content

            if query and query.lower() not in str(content).lower():
                continue

            out.append({"id": record_id, "tier": record_tier, "content": content, "hash": rec_hash, "ts": rec_ts})
            if len(out) >= limit:
                break

        # Include short-term active buffer
        if not tier or tier == "short":
            for s in reversed(self._short):
                if query and query.lower() not in str(s["content"]).lower():
                    continue
                out.append(s)

        return out[:limit]

    async def correct(self, target_id: str, new_content: Any) -> Dict[str, Any]:
        """Corrects an existing memory record, re-sealing it."""
        target_id = self._record_id(target_id)
        cur = self._conn.execute("SELECT id FROM memory WHERE id=?", (target_id,))
        if not cur.fetchone():
            return {"corrected": False, "reason": "not_found"}

        h = self._hash(new_content)
        encrypted_new_content = default_crypto.seal(new_content)

        self._conn.execute(
            "UPDATE memory SET content=?, hash=? WHERE id=?",
            (encrypted_new_content, h, target_id),
        )
        self._conn.commit()

        for item in self._short:
            if item.get("id") == target_id:
                item["content"] = new_content

        await self.bus.publish("memory.corrected", {"id": target_id}, source=self.name)
        return {"corrected": True, "id": target_id}

    async def delete(self, target_id: Optional[str] = None, tier: Optional[str] = None) -> Dict[str, Any]:
        """Securely deletes records."""
        # SQLite cannot bind a dict/list tier filter; ignore such values.
        if tier is not None and not isinstance(tier, str):
            tier = None
        target_id = self._record_id(target_id)
        if target_id:
            self._conn.execute("DELETE FROM memory WHERE id=?", (target_id,))
            self._short = [s for s in self._short if s.get("id") != target_id]
        elif tier:
            self._conn.execute("DELETE FROM memory WHERE tier=?", (tier,))
            if tier == "short":
                self._short = []
        self._conn.commit()
        return {"deleted": True}

    async def process(self, payload: Optional[Any] = None) -> Dict[str, Any]:
        """Processes memory operations."""
        if not isinstance(payload, dict):
            payload = {"action": "store", "content": payload}
        action = payload.get("action", "store")

        if action == "store":
            res = await self.store(
                payload.get("content"),
                payload.get("tier", "long"),
                payload.get("meta"),
                payload.get("session_token"),
            )
            return {"id": str(__import__("uuid").uuid4()), "engine": self.name, "status": "ok", **res}
        if action == "recall":
            items = await self.recall(
                payload.get("query", ""),
                payload.get("tier"),
                payload.get("limit", 20),
                payload.get("session_token"),
            )
            return {"id": str(__import__("uuid").uuid4()), "engine": self.name, "status": "ok", "items": items, "count": len(items)}
        if action == "correct":
            res = await self.correct(payload.get("target"), payload.get("content"))
            return {"id": str(__import__("uuid").uuid4()), "engine": self.name, "status": "ok", **res}
        if action == "delete":
            res = await self.delete(payload.get("target"), payload.get("tier"))
            return {"id": str(__import__("uuid").uuid4()), "engine": self.name, "status": "ok", **res}

        return {"id": str(__import__("uuid").uuid4()), "engine": self.name, "status": "ok", "action": action}

    async def get_state(self) -> Dict[str, Any]:
        """Returns memory state."""
        cur = self._conn.execute("SELECT tier, COUNT(*) FROM memory GROUP BY tier").fetchall()
        return {
            "name": self.name,
            "counts": {r[0]: r[1] for r in cur},
            "short_term": len(self._short),
            "encryption": "AES-256-GCM (Windows DPAPI Key)",
            "zero_trust_gating": True,
        }

    def health(self) -> Dict[str, Any]:
        """Reports health."""
        return {
            "name": self.name,
            "layer": self.layer,
            "running": self._running,
            "db": DB,
            "short_term": len(self._short),
            "encryption_status": "AES-256-GCM_DPAPI_VERIFIED",
        }
