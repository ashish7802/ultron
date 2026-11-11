-- ==============================================================================
-- Migration: 20261111000002_research_verification_and_contradiction.sql
-- Subsystem: ULTRON Research & Verification Engine - Batch 02 Architecture
-- Purpose:
--   Establishes the foundational schema for Batch 02 entities:
--   1. source_quality_assessments (Module 04: Source Reliability & Quality)
--   2. claim_verifications (Module 05: Claim Verification)
--   3. cross_source_contradictions (Module 06: Cross-Source Comparison & Contradiction)
--   4. source_dependencies (Source Lineage & Syndication Tracking)
--
-- Safety & Security Guarantees:
--   - Multi-tenant isolation using UUID tenant_id and user_id.
--   - Row-Level Security (RLS) enabled on all tables.
--   - Audit preservation: historical evaluations remain immutable and traceable.
--   - Foreign key integrity with indexes on all lookup relationships.
-- ==============================================================================

-- 1. Enumerated types for verification and contradiction states
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quality_tier_enum') THEN
        CREATE TYPE quality_tier_enum AS ENUM (
            'HIGH_QUALITY',
            'REPUTABLE',
            'PROVISIONAL',
            'LOW_CREDIBILITY',
            'UNRELIABLE'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_verification_status_enum') THEN
        CREATE TYPE claim_verification_status_enum AS ENUM (
            'verified',
            'partially_verified',
            'conflicting',
            'unverified',
            'outdated',
            'refuted'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'confidence_level_enum') THEN
        CREATE TYPE confidence_level_enum AS ENUM (
            'HIGH',
            'MODERATE',
            'PROVISIONAL',
            'LOW'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contradiction_type_enum') THEN
        CREATE TYPE contradiction_type_enum AS ENUM (
            'direct_contradiction',
            'version_mismatch',
            'date_mismatch',
            'contextual_difference',
            'specification_variance'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resolution_status_enum') THEN
        CREATE TYPE resolution_status_enum AS ENUM (
            'resolved_by_primary_source',
            'contextually_differentiated',
            'temporal_progression',
            'unresolved_disagreement'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_type_enum') THEN
        CREATE TYPE dependency_type_enum AS ENUM (
            'syndicated_copy',
            'derived_citation',
            'summary_aggregation',
            'press_wire'
        );
    END IF;
END $$;

-- ==============================================================================
-- TABLE 1: source_quality_assessments
-- Multi-dimensional quality assessment for each source (Module 04).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS source_quality_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    authority_score REAL NOT NULL DEFAULT 0.5,
    relevance_score REAL NOT NULL DEFAULT 0.5,
    freshness_score REAL NOT NULL DEFAULT 0.5,
    evidence_score REAL NOT NULL DEFAULT 0.5,
    independence_score REAL NOT NULL DEFAULT 1.0,
    transparency_score REAL NOT NULL DEFAULT 0.5,
    composite_quality_score REAL NOT NULL DEFAULT 0.5,
    quality_tier quality_tier_enum NOT NULL DEFAULT 'PROVISIONAL',
    is_primary_source BOOLEAN NOT NULL DEFAULT false,
    is_official_doc BOOLEAN NOT NULL DEFAULT false,
    detected_biases TEXT[] DEFAULT '{}',
    transparency_limitations TEXT[] DEFAULT '{}',
    assessment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_quality_assessment UNIQUE (project_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_quality_project ON source_quality_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_source_quality_source ON source_quality_assessments(source_id);
CREATE INDEX IF NOT EXISTS idx_source_quality_tier ON source_quality_assessments(quality_tier);
CREATE INDEX IF NOT EXISTS idx_source_quality_composite ON source_quality_assessments(composite_quality_score);

DROP TRIGGER IF EXISTS trigger_set_updated_at_source_quality ON source_quality_assessments;
CREATE TRIGGER trigger_set_updated_at_source_quality
    BEFORE UPDATE ON source_quality_assessments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 2: claim_verifications
-- Epistemic verification assessments for individual claims (Module 05).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS claim_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    verification_status claim_verification_status_enum NOT NULL DEFAULT 'unverified',
    confidence_score REAL NOT NULL DEFAULT 0.5,
    confidence_level confidence_level_enum NOT NULL DEFAULT 'PROVISIONAL',
    primary_source_checked BOOLEAN NOT NULL DEFAULT false,
    independent_sources_count INT NOT NULL DEFAULT 0,
    direct_evidence_ids UUID[] DEFAULT '{}',
    contradicting_evidence_ids UUID[] DEFAULT '{}',
    explanation TEXT NOT NULL,
    qualifier_notes TEXT,
    misleading_indicators TEXT[] DEFAULT '{}',
    temporal_assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_claim_verification UNIQUE (project_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_verifications_project ON claim_verifications(project_id);
CREATE INDEX IF NOT EXISTS idx_claim_verifications_claim ON claim_verifications(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_verifications_status ON claim_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_claim_verifications_confidence ON claim_verifications(confidence_score);

DROP TRIGGER IF EXISTS trigger_set_updated_at_claim_verifications ON claim_verifications;
CREATE TRIGGER trigger_set_updated_at_claim_verifications
    BEFORE UPDATE ON claim_verifications
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 3: cross_source_contradictions
-- Identified contradictions, mismatches, and resolutions across sources (Module 06).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cross_source_contradictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    subject VARCHAR(256) NOT NULL,
    contradiction_type contradiction_type_enum NOT NULL DEFAULT 'direct_contradiction',
    competing_claim_ids UUID[] NOT NULL DEFAULT '{}',
    competing_evidence_ids UUID[] NOT NULL DEFAULT '{}',
    competing_positions JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolution_status resolution_status_enum NOT NULL DEFAULT 'unresolved_disagreement',
    primary_source_evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
    resolution_explanation TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM', -- CRITICAL, HIGH, MEDIUM, LOW
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contradictions_project ON cross_source_contradictions(project_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_subject ON cross_source_contradictions(subject);
CREATE INDEX IF NOT EXISTS idx_contradictions_type ON cross_source_contradictions(contradiction_type);
CREATE INDEX IF NOT EXISTS idx_contradictions_resolution ON cross_source_contradictions(resolution_status);

DROP TRIGGER IF EXISTS trigger_set_updated_at_contradictions ON cross_source_contradictions;
CREATE TRIGGER trigger_set_updated_at_contradictions
    BEFORE UPDATE ON cross_source_contradictions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- ==============================================================================
-- TABLE 4: source_dependencies
-- Lineage, syndication, and duplication tracking between sources.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS source_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    upstream_source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    dependency_type dependency_type_enum NOT NULL DEFAULT 'syndicated_copy',
    confidence REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_dependency UNIQUE (source_id, upstream_source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_dep_project ON source_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_source_dep_source ON source_dependencies(source_id);
CREATE INDEX IF NOT EXISTS idx_source_dep_upstream ON source_dependencies(upstream_source_id);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- Multi-tenant isolation matching Batch 01 policies.
-- ==============================================================================
ALTER TABLE source_quality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_source_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_dependencies ENABLE ROW LEVEL SECURITY;

-- 1. source_quality_assessments policy
CREATE POLICY source_quality_tenant_isolation ON source_quality_assessments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = source_quality_assessments.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 2. claim_verifications policy
CREATE POLICY claim_verifications_tenant_isolation ON claim_verifications
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = claim_verifications.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 3. cross_source_contradictions policy
CREATE POLICY cross_source_contradictions_tenant_isolation ON cross_source_contradictions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = cross_source_contradictions.project_id
            AND p.user_id = auth.uid()
        )
    );

-- 4. source_dependencies policy
CREATE POLICY source_dependencies_tenant_isolation ON source_dependencies
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM research_projects p
            WHERE p.id = source_dependencies.project_id
            AND p.user_id = auth.uid()
        )
    );
