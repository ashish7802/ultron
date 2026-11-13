-- ==============================================================================
-- ULTRON Task Orchestration Engine (Blueprint Section 7)
-- Migration: 20261112000002_task_orchestration_engine.sql
-- ==============================================================================

-- 1. Orchestration Goals
CREATE TABLE IF NOT EXISTS orchestration_goals (
    goal_id TEXT PRIMARY KEY,
    raw_prompt TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'ENGINEERING', 'RESEARCH', 'AUTOMATION', 'ANALYSIS',
        'DEPLOYMENT', 'SYSTEM_CONFIG', 'SECURITY_AUDIT', 'MAINTENANCE', 'GENERAL'
    )),
    clarity TEXT NOT NULL CHECK (clarity IN ('HIGH', 'MEDIUM', 'AMBIGUOUS', 'INCOMPLETE')),
    primary_objective TEXT NOT NULL,
    expected_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
    in_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    out_of_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
    assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    requires_clarification BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orchestration_goals_category ON orchestration_goals(category);

-- 2. Workflows
CREATE TABLE IF NOT EXISTS orchestration_workflows (
    workflow_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES orchestration_goals(goal_id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN (
        'CREATED', 'PLANNING', 'PENDING_APPROVAL', 'RUNNING',
        'PAUSED', 'CANCELLED', 'FAILED', 'VERIFYING', 'COMPLETED'
    )),
    version INT NOT NULL DEFAULT 1,
    active_wave_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_orchestration_workflows_state ON orchestration_workflows(state);

-- 3. Milestones
CREATE TABLE IF NOT EXISTS orchestration_milestones (
    milestone_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES orchestration_workflows(workflow_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orchestration_milestones_wf ON orchestration_milestones(workflow_id);

-- 4. Tasks
CREATE TABLE IF NOT EXISTS orchestration_tasks (
    task_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES orchestration_workflows(workflow_id) ON DELETE CASCADE,
    parent_task_id TEXT REFERENCES orchestration_tasks(task_id) ON DELETE SET NULL,
    milestone_id TEXT REFERENCES orchestration_milestones(milestone_id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN (
        'PENDING', 'READY', 'BLOCKED', 'AWAITING_APPROVAL',
        'RUNNING', 'COMPLETED', 'VERIFIED', 'FAILED', 'SKIPPED', 'CANCELLED'
    )),
    complexity INT NOT NULL CHECK (complexity BETWEEN 1 AND 10),
    estimated_duration_ms INT NOT NULL DEFAULT 5000,
    actual_duration_ms INT,
    deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    action_type TEXT,
    action_payload JSONB,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    approval_token TEXT,
    execution_grant_token TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_wf_status ON orchestration_tasks(workflow_id, status);

-- 5. Task Dependencies (Edges)
CREATE TABLE IF NOT EXISTS orchestration_dependencies (
    dependency_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES orchestration_workflows(workflow_id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES orchestration_tasks(task_id) ON DELETE CASCADE,
    depends_on_task_id TEXT NOT NULL REFERENCES orchestration_tasks(task_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_orchestration_deps_task ON orchestration_dependencies(task_id);

-- 6. Checkpoints
CREATE TABLE IF NOT EXISTS orchestration_checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES orchestration_workflows(workflow_id) ON DELETE CASCADE,
    version INT NOT NULL,
    state TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    checksum TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orchestration_checkpoints_wf ON orchestration_checkpoints(workflow_id);

-- 7. Verification Evidence
CREATE TABLE IF NOT EXISTS orchestration_verifications (
    evidence_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES orchestration_tasks(task_id) ON DELETE CASCADE,
    verified BOOLEAN NOT NULL,
    checked_criteria_count INT NOT NULL,
    passed_criteria_count INT NOT NULL,
    criteria_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    produced_artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_hash TEXT NOT NULL,
    verifier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_orchestration_verifications_task ON orchestration_verifications(task_id);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- Enforces desktop single-tenant founder boundary isolation
-- ==============================================================================

ALTER TABLE orchestration_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_verifications ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated founder/admin processes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_goals_all'
    ) THEN
        CREATE POLICY founder_orchestration_goals_all ON orchestration_goals FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_workflows_all'
    ) THEN
        CREATE POLICY founder_orchestration_workflows_all ON orchestration_workflows FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_milestones_all'
    ) THEN
        CREATE POLICY founder_orchestration_milestones_all ON orchestration_milestones FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_tasks_all'
    ) THEN
        CREATE POLICY founder_orchestration_tasks_all ON orchestration_tasks FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_dependencies_all'
    ) THEN
        CREATE POLICY founder_orchestration_dependencies_all ON orchestration_dependencies FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_checkpoints_all'
    ) THEN
        CREATE POLICY founder_orchestration_checkpoints_all ON orchestration_checkpoints FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'founder_orchestration_verifications_all'
    ) THEN
        CREATE POLICY founder_orchestration_verifications_all ON orchestration_verifications FOR ALL USING (true);
    END IF;
END $$;

-- ==============================================================================
-- 9. SAFE ROLLBACK STRATEGY (DOWN MIGRATION)
-- ==============================================================================
-- DROP TABLE IF EXISTS orchestration_verifications CASCADE;
-- DROP TABLE IF EXISTS orchestration_checkpoints CASCADE;
-- DROP TABLE IF EXISTS orchestration_dependencies CASCADE;
-- DROP TABLE IF EXISTS orchestration_tasks CASCADE;
-- DROP TABLE IF EXISTS orchestration_milestones CASCADE;
-- DROP TABLE IF EXISTS orchestration_workflows CASCADE;
-- DROP TABLE IF EXISTS orchestration_goals CASCADE;
