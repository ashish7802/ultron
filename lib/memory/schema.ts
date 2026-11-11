/**
 * @file lib/memory/schema.ts
 * @description Canonical Database DDL and Migration Scripts for ULTRON Advanced Memory System.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P1–P5 Foundation).
 *
 * Key Responsibilities:
 * - Provides the complete, idempotent SQLite 3 DDL establishing all 9 canonical memory tables.
 * - Enforces Write-Ahead Logging (WAL), synchronous NORMAL, and 5000ms busy timeout for high-concurrency desktop performance.
 * - Sets up the FTS5 virtual table (`ultron_memories_fts`) with automatic INSERT/UPDATE/DELETE triggers.
 * - Establishes the Global Workspace root project (`00000000-0000-0000-0000-000000000000`).
 * - Creates the Phase P5 revision relationships table (`ultron_memory_revisions`) and ancestry indexes.
 * - Enforces partial unique constraint on active semantic keys to prevent concurrent split-brain mutations.
 *
 * Architectural Role & Safety Guarantees:
 * - Schema initialization is idempotent (`CREATE TABLE IF NOT EXISTS`).
 * - Preserves existing legacy tables (`memory` and `research_archive` in `ultron_memory.db`) without alteration.
 * - Safe for concurrent read and write access across Electron, Next.js, and Python child processes.
 */

/** Global Workspace UUID shared across projects for personal and foundational memories. */
export const GLOBAL_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

/** Complete SQLite 3 DDL Script establishing the Phase P1–P5 Memory Foundation. */
export const SQLITE_MEMORY_SCHEMA_DDL = `
-- 1. Pragmas for high-throughput, low-overhead desktop operation
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 5000;

-- 2. Projects Isolation Table
CREATE TABLE IF NOT EXISTS ultron_projects (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    workspace_path TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

-- Seed global workspace if absent
INSERT OR IGNORE INTO ultron_projects (id, slug, name, description, created_at, updated_at)
VALUES (
    '${GLOBAL_PROJECT_ID}',
    'global',
    'Global ULTRON Workspace',
    'Shared co-founder memory across projects',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- 3. Canonical Memory Records (Source of Truth)
CREATE TABLE IF NOT EXISTS ultron_memories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK(tier IN (
        'working', 'episodic', 'semantic', 'procedural', 'personal', 'project',
        'decision', 'error_solution', 'research', 'temporal', 'relational', 'meta'
    )),
    semantic_key TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    sensitivity TEXT NOT NULL DEFAULT 'internal' CHECK(sensitivity IN ('public', 'internal', 'sensitive', 'restricted')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deprecated', 'superseded', 'pending_confirmation', 'rejected', 'disputed')),
    importance INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5),
    confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence BETWEEN 0.0 AND 1.0),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at REAL,
    content_hash TEXT NOT NULL,
    valid_from REAL NOT NULL,
    valid_until REAL,
    decay_rate REAL NOT NULL DEFAULT 0.050,
    version INTEGER NOT NULL DEFAULT 1,
    superseded_by TEXT REFERENCES ultron_memories(id) ON DELETE SET NULL,
    parent_memory_id TEXT REFERENCES ultron_memories(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'inferred_dialogue',
    source_ref TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    is_encrypted INTEGER NOT NULL DEFAULT 0 CHECK(is_encrypted IN (0, 1)),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(project_id, semantic_key, version)
);

-- Partial Unique Index on Active Semantic Keys:
-- Guarantees that at most ONE record per (project_id, semantic_key) can be 'active' simultaneously.
-- Pending, disputed, deprecated, and rejected revisions are exempt, permitting arbitrary candidate coexistence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_semantic_key 
ON ultron_memories(project_id, semantic_key) 
WHERE status = 'active' AND semantic_key IS NOT NULL;

-- 4. Phase P5 Dedicated Revision Relationship Table (DAG Branches)
CREATE TABLE IF NOT EXISTS ultron_memory_revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    parent_id TEXT NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK(relationship_type IN (
        'supersedes',
        'refines',
        'forks',
        'merges',
        'rolls_back'
    )),
    confidence_score REAL NOT NULL CHECK(confidence_score >= 0.0 AND confidence_score <= 1.0),
    reconciliation_strategy TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    actor TEXT NOT NULL CHECK(actor IN ('founder', 'agent', 'system', 'consensus')),
    created_at REAL NOT NULL,
    UNIQUE(parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_revisions_parent ON ultron_memory_revisions(parent_id);
CREATE INDEX IF NOT EXISTS idx_revisions_child ON ultron_memory_revisions(child_id);
CREATE INDEX IF NOT EXISTS idx_revisions_project ON ultron_memory_revisions(project_id);

-- 5. Full-Text Search Virtual Table (FTS5) with Porter Stemming
CREATE VIRTUAL TABLE IF NOT EXISTS ultron_memories_fts USING fts5(
    memory_id UNINDEXED,
    semantic_key,
    content,
    summary,
    tokenize = 'porter unicode61'
);

-- 6. Automatic FTS5 Synchronization Triggers
CREATE TRIGGER IF NOT EXISTS trg_memories_fts_insert AFTER INSERT ON ultron_memories BEGIN
    INSERT INTO ultron_memories_fts(memory_id, semantic_key, content, summary)
    VALUES (new.id, new.semantic_key, new.content, COALESCE(new.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_memories_fts_delete AFTER DELETE ON ultron_memories BEGIN
    DELETE FROM ultron_memories_fts WHERE memory_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_memories_fts_update AFTER UPDATE ON ultron_memories BEGIN
    DELETE FROM ultron_memories_fts WHERE memory_id = old.id;
    INSERT INTO ultron_memories_fts(memory_id, semantic_key, content, summary)
    VALUES (new.id, new.semantic_key, new.content, COALESCE(new.summary, ''));
END;

-- 7. Vector Embeddings Table
CREATE TABLE IF NOT EXISTS ultron_memory_vectors (
    memory_id TEXT PRIMARY KEY REFERENCES ultron_memories(id) ON DELETE CASCADE,
    embedding_blob BLOB NOT NULL,
    dimensions INTEGER NOT NULL DEFAULT 768,
    model_name TEXT NOT NULL DEFAULT 'nomic-embed-text',
    provider TEXT NOT NULL DEFAULT 'ollama',
    vector_version INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vectors_model_dim ON ultron_memory_vectors(model_name, dimensions);

-- 8. Knowledge Graph: Entity Nodes & Directed Edges
CREATE TABLE IF NOT EXISTS ultron_entity_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    description TEXT,
    attributes TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    UNIQUE(project_id, name, entity_type)
);

CREATE TABLE IF NOT EXISTS ultron_entity_edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES ultron_entity_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES ultron_entity_nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

-- 9. Specialized Table: Architecture Decisions (ADRs)
CREATE TABLE IF NOT EXISTS ultron_decisions (
    id TEXT PRIMARY KEY,
    memory_id TEXT UNIQUE NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    problem_context TEXT NOT NULL,
    decision_made TEXT NOT NULL,
    alternatives_considered TEXT NOT NULL DEFAULT '[]',
    tradeoffs TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at REAL NOT NULL
);

-- 10. Specialized Table: Error & Solution Memory
CREATE TABLE IF NOT EXISTS ultron_error_solutions (
    id TEXT PRIMARY KEY,
    memory_id TEXT UNIQUE NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    error_signature TEXT NOT NULL,
    stack_trace_snippet TEXT,
    root_cause TEXT NOT NULL,
    verified_solution TEXT NOT NULL,
    prevention_rule TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    last_occurred_at REAL NOT NULL
);

-- 11. Cryptographic Tamper-Evident Memory Audit Ledger
CREATE TABLE IF NOT EXISTS ultron_memory_audit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'ultron_agent',
    previous_hash TEXT,
    current_hash TEXT NOT NULL,
    tamper_seal TEXT NOT NULL,
    payload_snapshot TEXT,
    created_at REAL NOT NULL
);

-- 12. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_memories_project_tier ON ultron_memories(project_id, tier, status);
CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON ultron_memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_memories_access ON ultron_memories(access_count, last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_edges_source ON ultron_entity_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON ultron_entity_edges(target_id);

-- 13. Phase P5 Pending Memory Confirmations Table
CREATE TABLE IF NOT EXISTS ultron_memory_confirmations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
    existing_memory_id TEXT REFERENCES ultron_memories(id) ON DELETE CASCADE,
    candidate_key TEXT NOT NULL,
    candidate_tier TEXT NOT NULL,
    candidate_content TEXT NOT NULL,
    candidate_source TEXT NOT NULL,
    conflict_class TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'deferred', 'expired')),
    inline_prompt TEXT NOT NULL,
    created_at REAL NOT NULL,
    resolved_at REAL,
    resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_confirmations_status ON ultron_memory_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_confirmations_project ON ultron_memory_confirmations(project_id);
`;
