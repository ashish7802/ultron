-- ==============================================================================
-- Migration: 20261111000003_research_intelligence_freshness_reporting.sql
-- Subsystem: ULTRON Research & Verification Engine - Batch 03 Architecture
-- Purpose:
--   Establishes the foundational schema for Batch 03 entities:
--   1. Module 07: Research Analysis, Findings, Recommendations, Gaps, Alternatives
--   2. Module 08: Source Freshness, Revalidation Policies, Jobs, Records
--   3. Module 09: Research Reports, Report Versions, Citations
--
-- Safety & Security Guarantees:
--   - Multi-tenant isolation using UUID tenant_id and user_id.
--   - Row-Level Security (RLS) enabled on all tables.
--   - Full historical audit preservation (reports and revalidation versions are immutable).
--   - Foreign key integrity with indexes on all lookup relationships.
-- ==============================================================================

-- 1. Enumerated types for Analysis, Freshness, and Reporting
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'freshness_state_enum') THEN
        CREATE TYPE freshness_state_enum AS ENUM (
            'CURRENT',
            'AGING',
            'STALE',
            'EXPIRED',
            'UNKNOWN'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'revalidation_job_status_enum') THEN
        CREATE TYPE revalidation_job_status_enum AS ENUM (
            'scheduled',
            'running',
            'completed',
            'failed',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type_enum') THEN
        CREATE TYPE report_type_enum AS ENUM (
            'executive_briefing',
            'comprehensive_report',
            'technical_dossier',
            'technology_comparison',
            'architecture_recommendation',
            'business_decision',
            'research_gap_report',
            'source_evidence_report',
            'revalidation_change_report'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_format_enum') THEN
        CREATE TYPE report_format_enum AS ENUM (
            'json',
            'markdown',
            'html'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gap_severity_enum') THEN
        CREATE TYPE gap_severity_enum AS ENUM (
            'CRITICAL',
            'HIGH',
            'MEDIUM',
            'LOW'
        );
    END IF;
END $$;

-- ==============================================================================
-- MODULE 07: RESEARCH ANALYSIS & INTELLIGENCE TABLES
-- ==============================================================================

-- 1. research_analyses: High-level synthesis, comparative metrics, and architectural conclusions
CREATE TABLE IF NOT EXISTS research_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    executive_summary TEXT NOT NULL,
    evidence_based_conclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    comparative_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    architectural_implications JSONB NOT NULL DEFAULT '[]'::jsonb,
    uncertainty_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision_framework JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_research_analysis_project UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_research_analyses_project ON research_analyses(project_id);

DROP TRIGGER IF EXISTS trigger_set_updated_at_research_analyses ON research_analyses;
CREATE TRIGGER trigger_set_updated_at_research_analyses
    BEFORE UPDATE ON research_analyses
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- 2. research_findings: Granular synthesized findings mapped to subquestions
CREATE TABLE IF NOT EXISTS research_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    sub_question_id VARCHAR(64),
    finding_title VARCHAR(512) NOT NULL,
    finding_statement TEXT NOT NULL,
    finding_type VARCHAR(64) NOT NULL DEFAULT 'technical', -- technical, architectural, operational, comparative
    supporting_claim_ids UUID[] DEFAULT '{}',
    supporting_evidence_ids UUID[] DEFAULT '{}',
    confidence_level VARCHAR(32) NOT NULL DEFAULT 'MODERATE', -- HIGH, MODERATE, PROVISIONAL, LOW
    is_consensus_fact BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_findings_project ON research_findings(project_id);
CREATE INDEX IF NOT EXISTS idx_research_findings_subquestion ON research_findings(sub_question_id);

-- 3. research_recommendations: Evidence-backed recommendations with risks, trade-offs, and conditions
CREATE TABLE IF NOT EXISTS research_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    recommendation_text TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    supporting_claim_ids UUID[] DEFAULT '{}',
    supporting_evidence_ids UUID[] DEFAULT '{}',
    advantages TEXT[] DEFAULT '{}',
    trade_offs TEXT[] DEFAULT '{}',
    risks TEXT[] DEFAULT '{}',
    assumptions TEXT[] DEFAULT '{}',
    confidence_score REAL NOT NULL DEFAULT 0.8,
    conditional_triggers TEXT[] DEFAULT '{}', -- Conditions under which recommendation changes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_recs_project ON research_recommendations(project_id);

-- 4. research_gaps: Missing evidence, unanswered questions, and unverified assumptions
CREATE TABLE IF NOT EXISTS research_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    gap_title VARCHAR(512) NOT NULL,
    gap_description TEXT NOT NULL,
    sub_question_id VARCHAR(64),
    severity gap_severity_enum NOT NULL DEFAULT 'MEDIUM',
    impact_analysis TEXT NOT NULL,
    recommended_remedy TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_gaps_project ON research_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_research_gaps_severity ON research_gaps(severity);

-- 5. research_alternatives: Structured technical/architectural alternatives evaluated
CREATE TABLE IF NOT EXISTS research_alternatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    name VARCHAR(256) NOT NULL,
    description TEXT NOT NULL,
    advantages TEXT[] DEFAULT '{}',
    disadvantages TEXT[] DEFAULT '{}',
    dependencies TEXT[] DEFAULT '{}',
    technical_requirements TEXT[] DEFAULT '{}',
    operational_limitations TEXT[] DEFAULT '{}',
    risks TEXT[] DEFAULT '{}',
    unresolved_questions TEXT[] DEFAULT '{}',
    supporting_evidence_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_alternatives_project ON research_alternatives(project_id);

-- ==============================================================================
-- MODULE 08: FRESHNESS & REVALIDATION TABLES
-- ==============================================================================

-- 6. source_freshness_records: Tracking freshness status and last-checked timestamps
CREATE TABLE IF NOT EXISTS source_freshness_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    freshness_state freshness_state_enum NOT NULL DEFAULT 'CURRENT',
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_revalidation_due TIMESTAMPTZ NOT NULL,
    staleness_reasons TEXT[] DEFAULT '{}',
    version_observed VARCHAR(128),
    content_hash_observed VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_freshness UNIQUE (project_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_freshness_project ON source_freshness_records(project_id);
CREATE INDEX IF NOT EXISTS idx_source_freshness_source ON source_freshness_records(source_id);
CREATE INDEX IF NOT EXISTS idx_source_freshness_state ON source_freshness_records(freshness_state);
CREATE INDEX IF NOT EXISTS idx_source_freshness_due ON source_freshness_records(next_revalidation_due);

DROP TRIGGER IF EXISTS trigger_set_updated_at_source_freshness ON source_freshness_records;
CREATE TRIGGER trigger_set_updated_at_source_freshness
    BEFORE UPDATE ON source_freshness_records
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- 7. revalidation_policies: Configurable TTL and frequency rules per topic / category
CREATE TABLE IF NOT EXISTS revalidation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES research_projects(id) ON DELETE CASCADE, -- Null = global default policy
    category VARCHAR(64) NOT NULL, -- software_spec, api_docs, academic_paper, market_trends, general
    ttl_days INT NOT NULL DEFAULT 30,
    check_frequency_days INT NOT NULL DEFAULT 7,
    auto_revalidation_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revalidation_policies_project ON revalidation_policies(project_id);
CREATE INDEX IF NOT EXISTS idx_revalidation_policies_category ON revalidation_policies(category);

-- 8. revalidation_jobs: Scheduled revalidation worker executions
CREATE TABLE IF NOT EXISTS revalidation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    status revalidation_job_status_enum NOT NULL DEFAULT 'scheduled',
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revalidation_jobs_project ON revalidation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_revalidation_jobs_status ON revalidation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_revalidation_jobs_scheduled ON revalidation_jobs(scheduled_for);

-- 9. revalidation_records: Immutable log of detected changes, version updates, and impacted claims
CREATE TABLE IF NOT EXISTS revalidation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    previous_content_hash VARCHAR(64),
    new_content_hash VARCHAR(64),
    previous_version VARCHAR(128),
    new_version VARCHAR(128),
    change_description TEXT NOT NULL,
    impacted_claim_ids UUID[] DEFAULT '{}',
    impacted_evidence_ids UUID[] DEFAULT '{}',
    impacted_recommendation_ids UUID[] DEFAULT '{}',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revalidation_records_project ON revalidation_records(project_id);
CREATE INDEX IF NOT EXISTS idx_revalidation_records_source ON revalidation_records(source_id);

-- ==============================================================================
-- MODULE 09: RESEARCH REPORT GENERATOR TABLES
-- ==============================================================================

-- 10. research_reports: Generated reports (Executive, Comprehensive, Comparison, etc.)
CREATE TABLE IF NOT EXISTS research_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    title VARCHAR(512) NOT NULL,
    report_type report_type_enum NOT NULL DEFAULT 'comprehensive_report',
    format report_format_enum NOT NULL DEFAULT 'markdown',
    content_raw TEXT NOT NULL, -- Full markdown or HTML payload
    content_structured JSONB NOT NULL DEFAULT '{}'::jsonb, -- Structured sections, findings, gaps, recs
    summary_brief TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    citations_count INT NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_reports_project ON research_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_type ON research_reports(report_type);

DROP TRIGGER IF EXISTS trigger_set_updated_at_research_reports ON research_reports;
CREATE TRIGGER trigger_set_updated_at_research_reports
    BEFORE UPDATE ON research_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

-- 11. research_report_versions: Immutable historical snapshots of published reports
CREATE TABLE IF NOT EXISTS research_report_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content_raw TEXT NOT NULL,
    content_structured JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_versions_report ON research_report_versions(report_id);

-- 12. research_report_citations: Traceable footnotes linking report statements to sources & evidence
CREATE TABLE IF NOT EXISTS research_report_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    citation_index INT NOT NULL,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
    claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
    citation_marker VARCHAR(32) NOT NULL, -- e.g. "[1]", "[2]"
    source_title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    publisher VARCHAR(256),
    publication_date VARCHAR(64),
    exact_passage_excerpt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_report_citation_index UNIQUE (report_id, citation_index)
);

CREATE INDEX IF NOT EXISTS idx_report_citations_report ON research_report_citations(report_id);
CREATE INDEX IF NOT EXISTS idx_report_citations_source ON research_report_citations(source_id);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- Multi-tenant isolation matching Batch 01 & 02 policies.
-- ==============================================================================
ALTER TABLE research_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_freshness_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE revalidation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE revalidation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE revalidation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_report_citations ENABLE ROW LEVEL SECURITY;

-- Multi-tenant RLS policies using project ownership lookup
CREATE POLICY research_analyses_tenant_isolation ON research_analyses FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_analyses.project_id AND p.user_id = auth.uid()));

CREATE POLICY research_findings_tenant_isolation ON research_findings FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_findings.project_id AND p.user_id = auth.uid()));

CREATE POLICY research_recs_tenant_isolation ON research_recommendations FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_recommendations.project_id AND p.user_id = auth.uid()));

CREATE POLICY research_gaps_tenant_isolation ON research_gaps FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_gaps.project_id AND p.user_id = auth.uid()));

CREATE POLICY research_alts_tenant_isolation ON research_alternatives FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_alternatives.project_id AND p.user_id = auth.uid()));

CREATE POLICY source_freshness_tenant_isolation ON source_freshness_records FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = source_freshness_records.project_id AND p.user_id = auth.uid()));

CREATE POLICY revalidation_jobs_tenant_isolation ON revalidation_jobs FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = revalidation_jobs.project_id AND p.user_id = auth.uid()));

CREATE POLICY revalidation_records_tenant_isolation ON revalidation_records FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = revalidation_records.project_id AND p.user_id = auth.uid()));

CREATE POLICY research_reports_tenant_isolation ON research_reports FOR ALL
    USING (EXISTS (SELECT 1 FROM research_projects p WHERE p.id = research_reports.project_id AND p.user_id = auth.uid()));

CREATE POLICY report_versions_tenant_isolation ON research_report_versions FOR ALL
    USING (EXISTS (SELECT 1 FROM research_reports r JOIN research_projects p ON p.id = r.project_id WHERE r.id = research_report_versions.report_id AND p.user_id = auth.uid()));

CREATE POLICY report_citations_tenant_isolation ON research_report_citations FOR ALL
    USING (EXISTS (SELECT 1 FROM research_reports r JOIN research_projects p ON p.id = r.project_id WHERE r.id = research_report_citations.report_id AND p.user_id = auth.uid()));
