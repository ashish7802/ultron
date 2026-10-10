"""
ULTRON Permanent Memory Engine
Provides SQLite-backed persistence, FTS5 semantic/keyword search, selective fact preservation,
and explicit memory management (save, update, delete, search, reset).
"""

import os
import sqlite3
import json
import time
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", Path.home()))
MEMORY_DIR = LOCAL_APP_DATA / "ULTRON" / "memory"
DB_PATH = MEMORY_DIR / "ultron_memory.db"

def get_db_connection() -> sqlite3.Connection:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_memory_db() -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. User facts / permanent preferences table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT DEFAULT 'general',
            fact_key TEXT UNIQUE NOT NULL,
            fact_value TEXT NOT NULL,
            tags TEXT DEFAULT '',
            confidence REAL DEFAULT 1.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Historical conversations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            summary TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 3. FTS5 Virtual Table for full-text / semantic keyword search
    cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
            content,
            summary,
            content='conversation_history',
            content_rowid='id'
        )
    """)
    
    conn.commit()
    conn.close()

# Initialize upon module import
init_memory_db()

class UltronMemory:
    @staticmethod
    def save_fact(key: str, value: str, category: str = "general", tags: str = "") -> Dict[str, Any]:
        """Explicitly saves or updates a persistent user fact."""
        conn = get_db_connection()
        cursor = conn.cursor()
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO user_facts (fact_key, fact_value, category, tags, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(fact_key) DO UPDATE SET
                fact_value=excluded.fact_value,
                category=excluded.category,
                tags=excluded.tags,
                updated_at=excluded.updated_at
        """, (key.strip().lower(), value.strip(), category, tags, now))
        conn.commit()
        conn.close()
        return {"status": "saved", "key": key, "value": value, "category": category}

    @staticmethod
    def get_fact(key: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user_facts WHERE fact_key = ?", (key.strip().lower(),))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def delete_fact(key: str) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_facts WHERE fact_key = ?", (key.strip().lower(),))
        changed = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return changed

    @staticmethod
    def list_facts(category: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        if category:
            cursor.execute("SELECT * FROM user_facts WHERE category = ? ORDER BY updated_at DESC", (category,))
        else:
            cursor.execute("SELECT * FROM user_facts ORDER BY updated_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def reset_all_memories() -> Dict[str, Any]:
        """Clears all facts and historical conversation indexes."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_facts")
        cursor.execute("DELETE FROM conversation_history")
        cursor.execute("DELETE FROM conversation_fts")
        conn.commit()
        conn.close()
        return {"status": "reset_complete", "message": "All permanent memory has been securely cleared."}

    @staticmethod
    def record_conversation(session_id: str, role: str, content: str, summary: str = "") -> None:
        """Stores conversation turn and updates FTS5 index."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO conversation_history (session_id, role, content, summary)
            VALUES (?, ?, ?, ?)
        """, (session_id, role, content, summary))
        rowid = cursor.lastrowid
        cursor.execute("""
            INSERT INTO conversation_fts (rowid, content, summary)
            VALUES (?, ?, ?)
        """, (rowid, content, summary))
        conn.commit()
        conn.close()

    @staticmethod
    def search_memories(query: str, limit: int = 5) -> Dict[str, Any]:
        """
        Dual search:
        1. Checks relevant user facts (key/value match)
        2. Queries conversation_fts for historical matches with BM25 ranking
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fact matches
        query_terms = [t for t in re.split(r'\W+', query.lower()) if len(t) > 2]
        matching_facts = []
        if query_terms:
            like_clauses = " OR ".join(["fact_key LIKE ? OR fact_value LIKE ?"] * len(query_terms))
            params = []
            for t in query_terms:
                params.extend([f"%{t}%", f"%{t}%"])
            cursor.execute(f"SELECT * FROM user_facts WHERE {like_clauses} LIMIT {limit}", params)
            matching_facts = [dict(r) for r in cursor.fetchall()]

        # FTS Conversation search
        matching_history = []
        cleaned_query = " ".join(query_terms)
        if cleaned_query:
            try:
                cursor.execute("""
                    SELECT c.id, c.session_id, c.role, c.content, c.summary, c.created_at, bm25(conversation_fts) as rank
                    FROM conversation_fts f
                    JOIN conversation_history c ON f.rowid = c.id
                    WHERE conversation_fts MATCH ?
                    ORDER BY rank ASC
                    LIMIT ?
                """, (cleaned_query, limit))
                matching_history = [dict(r) for r in cursor.fetchall()]
            except sqlite3.OperationalError:
                # Fallback if syntax invalid in FTS query
                cursor.execute("""
                    SELECT id, session_id, role, content, summary, created_at
                    FROM conversation_history
                    WHERE content LIKE ? OR summary LIKE ?
                    ORDER BY id DESC LIMIT ?
                """, (f"%{query}%", f"%{query}%", limit))
                matching_history = [dict(r) for r in cursor.fetchall()]

        conn.close()
        return {
            "query": query,
            "facts": matching_facts,
            "conversations": matching_history,
        }

    @staticmethod
    def selective_fact_extraction(text: str) -> Optional[Dict[str, str]]:
        """
        Rule-based selective memory filter.
        Only explicit facts/preferences are saved (prevents polluting DB with small talk).
        """
        lower = text.lower().strip()
        
        # Name declaration
        name_match = re.search(r'\b(?:my name is|mera naam|call me)\s+([A-Za-z]+)\b', text, re.IGNORECASE)
        if name_match:
            name = name_match.group(1).capitalize()
            return {"key": "user_name", "value": name, "category": "biography"}

        # Preference declaration
        pref_match = re.search(r'\b(?:i prefer|i like|mujhe pasand hai)\s+(.+)', text, re.IGNORECASE)
        if pref_match:
            pref = pref_match.group(1).strip()
            return {"key": f"preference_{int(time.time())}", "value": pref, "category": "preference"}

        # Explicit 'remember that' / 'yaad rakhna'
        remember_match = re.search(r'\b(?:remember that|yaad rakhna ki|save fact:?)\s+(.+)', text, re.IGNORECASE)
        if remember_match:
            fact = remember_match.group(1).strip()
            key_slug = re.sub(r'\W+', '_', fact[:30]).strip('_').lower()
            return {"key": f"fact_{key_slug}", "value": fact, "category": "fact"}

        # Project declaration
        proj_match = re.search(r'\b(?:working on project|mera project|current project is)\s+(.+)', text, re.IGNORECASE)
        if proj_match:
            proj = proj_match.group(1).strip()
            return {"key": "current_project", "value": proj, "category": "project"}

        return None

