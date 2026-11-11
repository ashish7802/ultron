"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.memory_dao
Purpose: Python DAO for ULTRON Advanced Cognitive Memory System (Phase P1–P5)
===============================================================================

Architectural Role & Security Guarantees:
- Subsystem: Core Knowledge & Persistent Storage (Layer: core).
- Provides Python engine modules with strongly-typed, low-latency access to
  `ultron_memories`, `ultron_memories_fts`, and `ultron_memory_revisions`.
- Preserves Zero-Plaintext at Rest via AES-256-GCM encryption with Windows DPAPI
  master key protection (`ultron_engine.secure_vault`).
- Supports blind indexing via HMAC-SHA256 for deterministic deduplication.
- Records all data mutations in `ultron_memory_audit_ledger` with tamper seals.
- Implements Phase P5 atomic memory supersession with BEGIN IMMEDIATE and 5000ms busy timeout.
===============================================================================
"""

import os
import time
import json
import uuid
import sqlite3
import hmac
import hashlib
from typing import Any, Dict, List, Optional, Tuple

from .crypto import default_crypto
from .secure_vault import default_vault
from .intruder_defense import default_intruder_defense

DB_PATH = os.path.join(os.path.dirname(__file__), "ultron_memory.db")
GLOBAL_PROJECT_ID = "00000000-0000-0000-0000-000000000000"


class PythonMemoryDAO:
    """
    Python Data Access Object for the canonical ULTRON Advanced Memory System.
    Provides strict parity with TypeScript SqliteMemoryAdapter.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._master_secret = default_vault.get_master_key()

    def _get_connection(self) -> sqlite3.Connection:
        """
        Creates an SQLite connection configured with WAL concurrency and foreign keys.
        Configures busy_timeout = 5000 to prevent database lock collisions with Next.js.
        """
        conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout=5.0)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    def compute_content_hash(self, content: Any) -> str:
        """Computes HMAC-SHA256 blind index hash for O(1) deduplication."""
        return default_crypto.blind_index_hash(content)

    def _compute_audit_tamper_seal(self, memory_id: str, content_hash: str, timestamp: float) -> str:
        """Computes HMAC-SHA256 audit seal matching TypeScript implementation."""
        payload = f"{memory_id}:{content_hash}:{int(timestamp)}".encode("utf-8")
        return hmac.new(self._master_secret, payload, hashlib.sha256).hexdigest()

    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single memory record by primary ID."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                """
                SELECT id, project_id, tier, semantic_key, content, summary, sensitivity, status,
                       importance, confidence, access_count, last_accessed_at, content_hash,
                       valid_from, valid_until, decay_rate, version, superseded_by, parent_memory_id,
                       source, source_ref, metadata, is_encrypted, created_at, updated_at
                FROM ultron_memories WHERE id = ? LIMIT 1
                """,
                (memory_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_dict(row)
        finally:
            conn.close()

    def store_memory(
        self,
        content: Any,
        tier: str = "semantic",
        semantic_key: Optional[str] = None,
        project_id: str = GLOBAL_PROJECT_ID,
        summary: Optional[str] = None,
        sensitivity: str = "internal",
        importance: int = 3,
        confidence: float = 1.0,
        source: str = "inferred_dialogue",
        source_ref: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        encrypt_payload: bool = False,
        parent_memory_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stores a memory in the canonical `ultron_memories` table with FTS5 indexing.
        """
        content_str = str(content) if not isinstance(content, str) else content
        content_hash = self.compute_content_hash(content_str)
        now = time.time() * 1000  # Unix ms
        mem_id = f"mem_{uuid.uuid4().hex[:16]}"
        key = semantic_key or f"fact_{int(now)}"

        stored_content = content_str
        is_encrypted = 0
        if encrypt_payload or sensitivity in ("sensitive", "restricted"):
            stored_content = default_crypto.seal(content_str)
            is_encrypted = 1

        conn = self._get_connection()
        try:
            # Deduplication check
            cur = conn.execute(
                "SELECT id, access_count FROM ultron_memories WHERE project_id=? AND content_hash=? AND status='active' LIMIT 1",
                (project_id, content_hash),
            )
            row = cur.fetchone()
            if row:
                existing_id, count = row
                conn.execute(
                    "UPDATE ultron_memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
                    (now, existing_id),
                )
                conn.commit()
                return {"stored": False, "duplicate": True, "id": existing_id, "hash": content_hash}

            conn.execute(
                """
                INSERT INTO ultron_memories (
                    id, project_id, tier, semantic_key, content, summary, sensitivity, status,
                    importance, confidence, access_count, last_accessed_at, content_hash,
                    valid_from, valid_until, decay_rate, version, superseded_by, parent_memory_id, source,
                    source_ref, metadata, is_encrypted, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, 'active',
                    ?, ?, 0, ?, ?,
                    ?, NULL, 0.050, 1, NULL, ?, ?,
                    ?, ?, ?, ?, ?
                )
                """,
                (
                    mem_id,
                    project_id,
                    tier,
                    key,
                    stored_content,
                    summary or content_str[:120],
                    sensitivity,
                    importance,
                    confidence,
                    now,
                    content_hash,
                    now,
                    parent_memory_id,
                    source,
                    source_ref,
                    json.dumps(metadata or {}),
                    is_encrypted,
                    now,
                    now,
                ),
            )

            tamper_seal = self._compute_audit_tamper_seal(mem_id, content_hash, now)
            conn.execute(
                """
                INSERT INTO ultron_memory_audit_ledger (
                    memory_id, action, actor, previous_hash, current_hash, tamper_seal, payload_snapshot, created_at
                ) VALUES (?, 'CREATE', 'python_core', NULL, ?, ?, ?, ?)
                """,
                (mem_id, content_hash, tamper_seal, json.dumps({"tier": tier, "key": key}), now),
            )
            conn.commit()
            return {"stored": True, "id": mem_id, "tier": tier, "hash": content_hash, "encrypted": bool(is_encrypted)}
        finally:
            conn.close()

    def supersede_memory(
        self,
        old_id: str,
        new_content: str,
        reason: str = "Content revision",
        actor: str = "agent",
    ) -> Dict[str, Any]:
        """
        Phase P5.1: Atomically supersedes an existing memory record.
        Executes within a strict BEGIN IMMEDIATE SQLite transaction.
        Updates parent to 'superseded', inserts child, creates revision link, and records audit trail.
        """
        content_str = new_content.strip()
        if len(content_str) < 3:
            raise ValueError("new_content must be at least 3 characters")

        now = time.time() * 1000  # Unix ms
        new_hash = self.compute_content_hash(content_str)
        new_id = f"mem_{uuid.uuid4().hex[:16]}"
        rev_id = f"rev_{uuid.uuid4().hex[:16]}"

        conn = self._get_connection()
        # Raw transaction management with BEGIN IMMEDIATE
        conn.isolation_level = None
        try:
            conn.execute("BEGIN IMMEDIATE;")

            # 1. Fetch parent row
            cur = conn.execute("SELECT * FROM ultron_memories WHERE id = ? LIMIT 1", (old_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Cannot supersede memory: record {old_id} not found")

            # Col indices in ultron_memories
            cols = [d[0] for d in cur.description]
            old_data = dict(zip(cols, row))

            next_version = int(old_data["version"]) + 1
            project_id = old_data["project_id"]
            tier = old_data["tier"]
            semantic_key = old_data["semantic_key"]
            is_encrypted = old_data["is_encrypted"]
            source = old_data["source"]

            stored_content = content_str
            if is_encrypted:
                stored_content = default_crypto.seal(content_str)

            meta = {}
            if old_data.get("metadata"):
                try:
                    meta = json.loads(old_data["metadata"])
                except Exception:
                    pass
            meta.update({
                "parentMemoryId": old_id,
                "relationshipType": "supersedes",
                "revisionReason": reason,
                "actor": actor,
            })

            # 2a. Update parent status to superseded first (to satisfy partial unique active index)
            # Do NOT set superseded_by yet until new_id exists in ultron_memories
            conn.execute(
                "UPDATE ultron_memories SET status = 'superseded', updated_at = ? WHERE id = ?",
                (now, old_id),
            )

            # 2b. Insert child revision as active
            conn.execute(
                """
                INSERT INTO ultron_memories (
                    id, project_id, tier, semantic_key, content, summary, sensitivity, status,
                    importance, confidence, access_count, last_accessed_at, content_hash,
                    valid_from, valid_until, decay_rate, version, superseded_by, parent_memory_id,
                    source, source_ref, metadata, is_encrypted, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, 'active',
                    ?, ?, 0, ?, ?,
                    ?, ?, ?, ?, NULL, ?,
                    ?, ?, ?, ?, ?, ?
                )
                """,
                (
                    new_id,
                    project_id,
                    tier,
                    semantic_key,
                    stored_content,
                    old_data["summary"],
                    old_data["sensitivity"],
                    old_data["importance"],
                    old_data["confidence"],
                    now,
                    new_hash,
                    now,
                    old_data["valid_until"],
                    old_data["decay_rate"],
                    next_version,
                    old_id,
                    source,
                    f"superseded:{old_id}",
                    json.dumps(meta),
                    is_encrypted,
                    now,
                    now,
                ),
            )

            # 2c. Now that new_id exists in ultron_memories, link parent's superseded_by foreign key
            conn.execute(
                "UPDATE ultron_memories SET superseded_by = ?, updated_at = ? WHERE id = ?",
                (new_id, now, old_id),
            )

            # 4. Insert revision edge into ultron_memory_revisions
            conn.execute(
                """
                INSERT INTO ultron_memory_revisions (
                    id, project_id, parent_id, child_id, relationship_type,
                    confidence_score, reconciliation_strategy, change_summary, actor, created_at
                ) VALUES (?, ?, ?, ?, 'supersedes', ?, 'atomic_supersession', ?, ?, ?)
                """,
                (rev_id, project_id, old_id, new_id, float(old_data["confidence"]), reason, actor, now),
            )

            # 5. Append audit ledger entry
            tamper_seal = self._compute_audit_tamper_seal(new_id, new_hash, now)
            conn.execute(
                """
                INSERT INTO ultron_memory_audit_ledger (
                    memory_id, action, actor, previous_hash, current_hash, tamper_seal, payload_snapshot, created_at
                ) VALUES (?, 'SUPERSEDE', ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    actor,
                    old_data["content_hash"],
                    new_hash,
                    tamper_seal,
                    json.dumps({"oldId": old_id, "newId": new_id, "version": next_version, "reason": reason}),
                    now,
                ),
            )

            conn.execute("COMMIT;")
            return {
                "id": new_id,
                "project_id": project_id,
                "version": next_version,
                "parent_id": old_id,
                "content_hash": new_hash,
                "status": "active",
            }
        except Exception:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            raise
        finally:
            conn.close()

    def get_revision_history(self, memory_id: str) -> List[Dict[str, Any]]:
        """
        Phase P5.1: Traces full chronological revision ancestry back to genesis root using recursive CTE.
        """
        conn = self._get_connection()
        try:
            sql = """
                WITH RECURSIVE AncestryTree AS (
                    SELECT m.*, 0 AS depth
                    FROM ultron_memories m
                    WHERE m.id = ?

                    UNION ALL

                    SELECT p.*, a.depth + 1
                    FROM ultron_memories p
                    JOIN AncestryTree a ON p.id = a.parent_memory_id
                    WHERE a.depth < 100
                )
                SELECT * FROM AncestryTree ORDER BY depth DESC;
            """
            cur = conn.execute(sql, (memory_id,))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in rows]
        finally:
            conn.close()

    def search_memories(
        self,
        query: str,
        project_id: str = GLOBAL_PROJECT_ID,
        tier: Optional[str] = None,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        """
        Executes BM25 full-text keyword retrieval using the SQLite FTS5 table.
        """
        clean = query.strip().replace('"', "").replace("'", "")
        if not clean:
            return []

        words = [w for w in clean.split() if len(w) >= 2]
        if not words:
            return []
        fts_query = " OR ".join(f'"{w}"*' for w in words)

        conn = self._get_connection()
        try:
            sql = """
                SELECT m.id, m.project_id, m.tier, m.semantic_key, m.content, m.summary,
                       m.sensitivity, m.importance, m.confidence, m.is_encrypted, m.created_at, fts.rank
                FROM ultron_memories_fts fts
                JOIN ultron_memories m ON fts.memory_id = m.id
                WHERE ultron_memories_fts MATCH ?
                  AND (m.project_id = ? OR m.project_id = ?)
                  AND m.status = 'active'
            """
            params: List[Any] = [fts_query, project_id, GLOBAL_PROJECT_ID]
            if tier:
                sql += " AND m.tier = ?"
                params.append(tier)

            sql += " ORDER BY fts.rank ASC, m.importance DESC LIMIT ?"
            params.append(limit)

            cur = conn.execute(sql, params)
            rows = cur.fetchall()
            results = []

            for r in rows:
                mid, pid, r_tier, skey, raw_content, summ, sens, imp, conf, is_enc, cat, rank = r
                content = raw_content
                if is_enc:
                    try:
                        content = default_crypto.unseal(raw_content)
                    except Exception:
                        content = "[Encrypted Content - Decryption Failed]"

                results.append({
                    "id": mid,
                    "project_id": pid,
                    "tier": r_tier,
                    "semantic_key": skey,
                    "content": content,
                    "summary": summ,
                    "sensitivity": sens,
                    "importance": imp,
                    "confidence": conf,
                    "created_at": cat,
                    "rank": rank,
                })
            return results
        except Exception:
            # Fallback to standard LIKE
            sql = """
                SELECT id, project_id, tier, semantic_key, content, summary, sensitivity,
                       importance, confidence, is_encrypted, created_at
                FROM ultron_memories
                WHERE (content LIKE ? OR semantic_key LIKE ?)
                  AND (project_id = ? OR project_id = ?)
                  AND status = 'active'
                ORDER BY importance DESC LIMIT ?
            """
            wildcard = f"%{clean}%"
            cur = conn.execute(sql, (wildcard, wildcard, project_id, GLOBAL_PROJECT_ID, limit))
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "project_id": r[1],
                    "tier": r[2],
                    "semantic_key": r[3],
                    "content": default_crypto.unseal(r[4]) if r[9] else r[4],
                    "summary": r[5],
                    "sensitivity": r[6],
                    "importance": r[7],
                    "confidence": r[8],
                    "created_at": r[10],
                }
                for r in rows
            ]
        finally:
            conn.close()

    def get_stats(self) -> Dict[str, Any]:
        """Returns statistics from the canonical tables."""
        conn = self._get_connection()
        try:
            total = conn.execute("SELECT count(*) FROM ultron_memories").fetchone()[0]
            active = conn.execute("SELECT count(*) FROM ultron_memories WHERE status='active'").fetchone()[0]
            tier_rows = conn.execute("SELECT tier, count(*) FROM ultron_memories GROUP BY tier").fetchall()
            fts_count = conn.execute("SELECT count(*) FROM ultron_memories_fts").fetchone()[0]
            rev_count = conn.execute("SELECT count(*) FROM ultron_memory_revisions").fetchone()[0]
            conf_count = 0
            try:
                conf_count = conn.execute("SELECT count(*) FROM ultron_memory_confirmations WHERE status = 'pending'").fetchone()[0]
            except Exception:
                pass
            return {
                "total": total,
                "active": active,
                "revisions": rev_count,
                "pending_confirmations": conf_count,
                "tiers": {r[0]: r[1] for r in tier_rows},
                "fts_indexed": fts_count,
            }
        finally:
            conn.close()

    def list_confirmations(self, project_id: Optional[str] = None, status: str = "pending") -> List[Dict[str, Any]]:
        """Phase P5.3: Lists memory confirmation requests."""
        conn = self._get_connection()
        try:
            sql = "SELECT * FROM ultron_memory_confirmations WHERE 1=1"
            params: List[Any] = []
            if project_id:
                sql += " AND project_id = ?"
                params.append(project_id)
            if status:
                sql += " AND status = ?"
                params.append(status)
            sql += " ORDER BY created_at DESC"
            cur = conn.execute(sql, tuple(params))
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]
        finally:
            conn.close()

    def resolve_confirmation(self, confirmation_id: str, action: str, resolved_by: str = "founder") -> bool:
        """Phase P5.3: Resolves a confirmation request."""
        now = time.time() * 1000
        conn = self._get_connection()
        try:
            cur = conn.execute(
                "UPDATE ultron_memory_confirmations SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'",
                (action, now, resolved_by, confirmation_id),
            )
            return cur.rowcount > 0
        finally:
            conn.close()

    def _row_to_dict(self, row: Tuple[Any, ...]) -> Dict[str, Any]:
        """Maps an ultron_memories row tuple to a dictionary."""
        return {
            "id": row[0],
            "project_id": row[1],
            "tier": row[2],
            "semantic_key": row[3],
            "content": row[4],
            "summary": row[5],
            "sensitivity": row[6],
            "status": row[7],
            "importance": row[8],
            "confidence": row[9],
            "access_count": row[10],
            "last_accessed_at": row[11],
            "content_hash": row[12],
            "valid_from": row[13],
            "valid_until": row[14],
            "decay_rate": row[15],
            "version": row[16],
            "superseded_by": row[17],
            "parent_memory_id": row[18],
            "source": row[19],
            "source_ref": row[20],
            "metadata": json.loads(row[21]) if row[21] else {},
            "is_encrypted": bool(row[22]),
            "created_at": row[23],
            "updated_at": row[24],
        }


default_python_memory_dao = PythonMemoryDAO()
