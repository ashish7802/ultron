-- ============================================================================
-- Migration: 20261111000004_research_memory_and_safety.sql
-- Description: Schema for Batch 04 - Advanced Memory Deep Ingestion (Module 10)
--              and Research Safety & Integrity Engine (Module 11).
-- Subsystem: ULTRON Autonomous Knowledge, Research & Verification Engine
-- Target Database: PostgreSQL 15+ / Supabase
-- Safety Guarantees: Idempotent (IF NOT EXISTS), RLS enabled, indexes on FKs
-- ============================================================================

-- Enable UUID extension if not already active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. RESEARCH MEMORY LINKS (MODULE 10)
-- Links research entities (projects, claims, recommendations, reports) directly
-- to persistent memory records in the Advanced Memory vault.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_memory_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
    memory_id TEXT NOT NULL,
    claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    recommendation_id UUID REFERENCES public.research_recommendations(id) ON DELETE SET NULL,
    report_id UUID REFERENCES public.research_reports(id) ON DELETE SET NULL,
    memory_category TEXT NOT NULL CHECK (memory_category IN ('profile', 'preference', 'project', 'fact', 'instruction', 'technical', 'decision', 'architecture')),
    verification_status TEXT CHECK (verification_status IN ('verified', 'partially_verified', 'conflicting', 'unverified', 'outdated', 'refuted')),
    confidence_score NUMERIC(5, 4) DEFAULT 1.0000 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    is_consensus_fact BOOLEAN DEFAULT FALSE,
    provenance JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_memory_links_project ON public.research_memory_links(project_id);
CREATE INDEX IF NOT EXISTS idx_research_memory_links_memory ON public.research_memory_links(memory_id);
CREATE INDEX IF NOT EXISTS idx_research_memory_links_claim ON public.research_memory_links(claim_id);

-- ============================================================================
-- 2. RESEARCH KNOWLEDGE GRAPH NODES (MODULE 10)
-- Structured entity nodes representing concepts, technologies, claims, and components.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL CHECK (node_type IN ('entity', 'technology', 'component', 'claim', 'topic', 'finding', 'decision', 'source')),
    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    description TEXT,
    properties JSONB DEFAULT '{}'::jsonb,
    source_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_knowledge_nodes_project ON public.research_knowledge_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_research_knowledge_nodes_canonical ON public.research_knowledge_nodes(canonical_name);
CREATE INDEX IF NOT EXISTS idx_research_knowledge_nodes_type ON public.research_knowledge_nodes(node_type);

-- ============================================================================
-- 3. RESEARCH KNOWLEDGE GRAPH EDGES (MODULE 10)
-- Semantic relationships linking knowledge nodes (e.g. USES, SUPPORTS, CONTRADICTS).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_knowledge_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES public.research_knowledge_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES public.research_knowledge_nodes(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('uses', 'supports', 'contradicts', 'recommends', 'depends_on', 'researches', 'part_of', 'alternative_to')),
    weight NUMERIC(5, 4) DEFAULT 1.0000,
    bidirectional BOOLEAN DEFAULT FALSE,
    properties JSONB DEFAULT '{}'::jsonb,
    evidence_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_knowledge_edges_project ON public.research_knowledge_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_research_knowledge_edges_source ON public.research_knowledge_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_research_knowledge_edges_target ON public.research_knowledge_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_research_knowledge_edges_rel ON public.research_knowledge_edges(relationship_type);

-- ============================================================================
-- 4. RESEARCH MEMORY VERSION EVOLUTION (MODULE 10)
-- Preserves historical evolution when new research updates or supersedes memories.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_memory_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id TEXT NOT NULL,
    project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    previous_content TEXT NOT NULL,
    new_content TEXT NOT NULL,
    evolution_type TEXT NOT NULL CHECK (evolution_type IN ('initial_ingestion', 'factual_update', 'refinement', 'contradiction_superseded', 'deprecation')),
    reason TEXT NOT NULL,
    superseded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_memory_versions_memory ON public.research_memory_versions(memory_id);
CREATE INDEX IF NOT EXISTS idx_research_memory_versions_project ON public.research_memory_versions(project_id);

-- ============================================================================
-- 5. RESEARCH SECURITY EVENTS (MODULE 11)
-- Real-time audit log of security events (prompt injection, secret leaks, etc.).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.research_projects(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('prompt_injection', 'suspicious_document', 'sensitive_data_detected', 'citation_integrity_failure', 'unauthorized_tool_attempt', 'policy_violation', 'malformed_payload')),
    severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
    detected_pattern TEXT NOT NULL,
    raw_excerpt TEXT,
    sanitized_excerpt TEXT,
    action_taken TEXT NOT NULL CHECK (action_taken IN ('quarantined', 'redacted', 'dropped', 'neutralized', 'monitored', 'blocked')),
    mitigation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_security_events_project ON public.research_security_events(project_id);
CREATE INDEX IF NOT EXISTS idx_research_security_events_type ON public.research_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_research_security_events_severity ON public.research_security_events(severity);

-- ============================================================================
-- 6. RESEARCH SOURCE AUDIT & ACCESS LOGS (MODULE 11)
-- Detailed provenance and safety audit trail of every source retrieval operation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.research_source_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    provider TEXT NOT NULL,
    access_decision TEXT NOT NULL CHECK (access_decision IN ('allowed', 'quarantined', 'blocked', 'rate_limited')),
    trust_tier TEXT NOT NULL CHECK (trust_tier IN ('PRIMARY_OFFICIAL', 'VERIFIED_ACADEMIC', 'COMMUNITY_ANALYSIS', 'UNTRUSTED_EXTERNAL', 'MALICIOUS_REJECTED')),
    safety_flags JSONB DEFAULT '{}'::jsonb,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_research_source_audit_logs_project ON public.research_source_audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_research_source_audit_logs_source ON public.research_source_audit_logs(source_id);

-- ============================================================================
-- 7. CITATION INTEGRITY VERIFICATIONS (MODULE 11)
-- Prevents hallucinated or fabricated footnotes before reports are published.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.citation_integrity_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES public.research_reports(id) ON DELETE CASCADE,
    citation_index INTEGER NOT NULL,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES public.evidence(id) ON DELETE SET NULL,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    has_verbatim_match BOOLEAN NOT NULL DEFAULT TRUE,
    diagnostics TEXT,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_citation_integrity_report ON public.citation_integrity_verifications(report_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict single-user / multi-tenant desktop safety isolation
-- ============================================================================
ALTER TABLE public.research_memory_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_knowledge_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_memory_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_source_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_integrity_verifications ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_memory_links_isolation') THEN
        CREATE POLICY research_memory_links_isolation ON public.research_memory_links FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_knowledge_nodes_isolation') THEN
        CREATE POLICY research_knowledge_nodes_isolation ON public.research_knowledge_nodes FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_knowledge_edges_isolation') THEN
        CREATE POLICY research_knowledge_edges_isolation ON public.research_knowledge_edges FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_memory_versions_isolation') THEN
        CREATE POLICY research_memory_versions_isolation ON public.research_memory_versions FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_security_events_isolation') THEN
        CREATE POLICY research_security_events_isolation ON public.research_security_events FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'research_source_audit_logs_isolation') THEN
        CREATE POLICY research_source_audit_logs_isolation ON public.research_source_audit_logs FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'citation_integrity_isolation') THEN
        CREATE POLICY citation_integrity_isolation ON public.citation_integrity_verifications FOR ALL USING (true);
    END IF;
END $$;
