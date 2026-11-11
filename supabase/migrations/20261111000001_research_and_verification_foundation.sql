-- ==============================================================================
-- Migration: 20261111000001_research_and_verification_foundation.sql
-- Subsystem: ULTRON Research & Verification Engine - Shared Data Architecture
-- Purpose:
--   Establishes the foundational schema for the 6 core research entities:
--   1. research_projects
--   2. research_queries
--   3. sources
--   4. evidence
--   5. claims
--   6. claim_evidence_links
--
-- Safety & Security Guarantees:
--   - Multi-tenant isolation using UUID tenant_id and user_id.
--   - Row-Level Security (RLS) enabled on all tables.
--   - Read-only historical audit preservation: deletions do not cascade to destroy verified historical evidence.
--   - Foreign key integrity with indexes on all lookup relationships.
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enumerated types for research domains and operational states
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_intent_enum') THEN
        CREATE TYPE research_intent_enum AS ENUM (
            'technical_research',
            'product_research',
            'technology_comparison',
            'architecture_research',
            'market_research',
            'academic_research',
            'problem_investigation',
            'business_decision_research',
            'documentation_research',
            'current_information_research',
            'general_knowledge_research'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_depth_enum') THEN
        CREATE TYPE research_depth_enum AS ENUM (
            'quick',
            'standard',
            'deep',
            'comprehensive'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'research_status_enum') THEN
        CREATE TYPE research_status_enum AS ENUM (
            'planned',
            'discovering',
            'extracting',
            'synthesized',
            'completed',
            'failed',
            'archived'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type_enum') THEN
        CREATE TYPE source_type_enum AS ENUM (
            'official_documentation',
            'technical_specification',
            'academic_paper',
            'github_repository',
            'api_documentation',
            'reputable_publication',
            'independent_analysis',
            'community_discussion',
            'news_release',
            'internal_document',
            'advanced_memory',
            'web_general'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retrieval_status_enum') THEN
        CREATE TYPE retrieval_status_enum AS ENUM (
            'discovered',
            'fetched',
            'cached',
            'failed',
            'restricted',
            'timeout'
        );
    END IF;
END $$;

-- 3. Utility function for automatic timestamp maintenance
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- TABLE 1: research_projects
-- Stores overarching research objectives, scope, depth, constraints, and status.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS research_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    title VARCHAR(512) NOT NULL,
    objective TEXT NOT NULL,
    research_intent research_intent_enum NOT NULL DEFAULT 'technical_research',
    topic VARCHAR(256) NOT NULL,
    problem_statement TEXT NOT NULL,
    expected_outcome TEXT,
    intended_decision TEXT,
    research_depth research_depth_enum NOT NULL DEFAULT 'standard',
    scope_included TEXT[] DEFAULT '{}',
    scope_excluded TEXT[] DEFAULT '{}',
    geographic_scope VARCHAR(128),
    time_period VARCHAR(128),
    constraints JSONB DEFAULT '{}'::jsonb,
    resource_limits JSONB DEFAULT '{"max_queries": 10, "max_sources": 25, "timeout_seconds": 60}'::jsonb,
    completion_criteria JSONB DEFAULT '[]'::jsonb,
    status research_status_enum NOT NULL DEFAULT 'planned',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_projects_tenant ON research_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_user ON research_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_status ON research_projects(status);
CREATE INDEX IF NOT EXISTS idx_research_projects_created ON research_projects(created_at DESC);

DROP TRIGGER IF EXISTS trigger_set_updated_at_research_projects ON research_projects;
CREATE TRIGGER trigger_set_updated_at_research_projects
    BEFORE UPDATE ON research_projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 2: research_queries
-- Decomposed sub-questions and generated discovery strategies linked to projects.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS research_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    sub_question TEXT NOT NULL,
    search_objective TEXT NOT NULL,
    primary_query TEXT NOT NULL,
    alternative_queries TEXT[] DEFAULT '{}',
    priority VARCHAR(32) NOT NULL DEFAULT 'HIGH', -- CRITICAL, HIGH, MEDIUM, LOW
    preferred_source_types source_type_enum[] DEFAULT '{}',
    official_domains TEXT[] DEFAULT '{}',
    relevant_repositories TEXT[] DEFAULT '{}',
    requires_current_info BOOLEAN NOT NULL DEFAULT false,
    requires_official_docs BOOLEAN NOT NULL DEFAULT false,
    execution_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_queries_project ON research_queries(project_id);
CREATE INDEX IF NOT EXISTS idx_research_queries_priority ON research_queries(priority);
CREATE INDEX IF NOT EXISTS idx_research_queries_status ON research_queries(execution_status);

DROP TRIGGER IF EXISTS trigger_set_updated_at_research_queries ON research_queries;
CREATE TRIGGER trigger_set_updated_at_research_queries
    BEFORE UPDATE ON research_queries
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 3: sources
-- Discovered metadata, canonicalized URLs, publishers, and retrieval status.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    query_id UUID REFERENCES research_queries(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    original_url TEXT NOT NULL,
    canonical_url TEXT,
    canonical_url_hash VARCHAR(64) NOT NULL, -- SHA-256 for fast duplicate detection
    source_type source_type_enum NOT NULL DEFAULT 'web_general',
    publisher VARCHAR(256),
    author VARCHAR(256),
    snippet TEXT,
    provider VARCHAR(64) NOT NULL, -- ddgs, github, academic_arxiv, internal_docs, memory, etc.
    provider_metadata JSONB DEFAULT '{}'::jsonb,
    publication_date TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accessed_at TIMESTAMPTZ,
    retrieval_status retrieval_status_enum NOT NULL DEFAULT 'discovered',
    content_availability VARCHAR(32) NOT NULL DEFAULT 'unfetched', -- unfetched, full_text, snippet_only, inaccessible
    content_hash VARCHAR(64), -- SHA-256 hash of extracted payload
    http_status INT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_project_url_hash UNIQUE (project_id, canonical_url_hash)
);

CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_query ON sources(query_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);
CREATE INDEX IF NOT EXISTS idx_sources_url_hash ON sources(canonical_url_hash);
CREATE INDEX IF NOT EXISTS idx_sources_content_hash ON sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_sources_retrieval_status ON sources(retrieval_status);

DROP TRIGGER IF EXISTS trigger_set_updated_at_sources ON sources;
CREATE TRIGGER trigger_set_updated_at_sources
    BEFORE UPDATE ON sources
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 4: evidence
-- Extracted verbatim passages, section headers, technical specifications, and facts.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    exact_passage TEXT NOT NULL,
    surrounding_context TEXT,
    section_heading VARCHAR(512),
    page_number INT,
    chunk_index INT NOT NULL DEFAULT 0,
    char_offset_start INT,
    char_offset_end INT,
    evidence_type VARCHAR(64) NOT NULL DEFAULT 'factual_passage', -- passage, technical_spec, version_date, metric
    structured_data JSONB DEFAULT '{}'::jsonb, -- e.g. extracted version numbers, hardware requirements, numbers
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 for exact passage deduplication
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_content_hash ON evidence(content_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(evidence_type);

DROP TRIGGER IF EXISTS trigger_set_updated_at_evidence ON evidence;
CREATE TRIGGER trigger_set_updated_at_evidence
    BEFORE UPDATE ON evidence
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 5: claims
-- Atomic factual assertions extracted from gathered evidence.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    claim_type VARCHAR(64) NOT NULL DEFAULT 'feature_capability', -- feature_capability, architectural_spec, version_requirement, performance_benchmark
    subject VARCHAR(256), -- e.g. "PostgreSQL 16", "Next.js App Router"
    predicate VARCHAR(256), -- e.g. "supports native JSONB indexing"
    object_value TEXT,
    context_qualifier TEXT, -- e.g. "Under high concurrency workloads"
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);

DROP TRIGGER IF EXISTS trigger_set_updated_at_claims ON claims;
CREATE TRIGGER trigger_set_updated_at_claims
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 6: claim_evidence_links
-- Many-to-many associative junction linking claims to supporting evidence passages.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS claim_evidence_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    relationship_type VARCHAR(32) NOT NULL DEFAULT 'supports', -- supports, provides_context, mentions
    relevance_score REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_claim_evidence_link UNIQUE (claim_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence_links(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_evidence ON claim_evidence_links(evidence_id);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation ensuring users only access their own research.
-- ==============================================================================
ALTER TABLE research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_evidence_links ENABLE ROW LEVEL SECURITY;

-- 1. research_projects policy
CREATE POLICY research_projects_tenant_isolation ON research_projects
    FOR ALL
    USING (
        auth.uid() = user_id
    )
    WITH CHECK (
        auth.uid() = user_id
    );

-- 2. research_queries policy
CREATE POLICY research_queries_tenant_isolation ON research_queries
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = research_queries.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 3. sources policy
CREATE POLICY sources_tenant_isolation ON sources
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = sources.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 4. evidence policy
CREATE POLICY evidence_tenant_isolation ON evidence
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = evidence.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 5. claims policy
CREATE POLICY claims_tenant_isolation ON claims
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = claims.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 6. claim_evidence_links policy
CREATE POLICY claim_evidence_links_tenant_isolation ON claim_evidence_links
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM claims c
            JOIN research_projects p ON p.id = c.project_id
            WHERE c.id = claim_evidence_links.claim_id
            AND p.user_id = auth.uid()
        )
    );
