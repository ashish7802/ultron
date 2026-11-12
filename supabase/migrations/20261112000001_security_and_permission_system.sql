-- ==============================================================================
-- ULTRON Security & Permission Management System (Blueprint Section 6)
-- Migration: 20261112000001_security_and_permission_system.sql
-- ==============================================================================

-- 1. Security Users & Founder Identity
CREATE TABLE IF NOT EXISTS security_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('founder', 'admin', 'operator', 'guest')),
    is_founder BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Device Bindings
CREATE TABLE IF NOT EXISTS security_devices (
    device_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    platform TEXT NOT NULL,
    hardware_fingerprint TEXT NOT NULL,
    trusted_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_current_device BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. Authenticated Desktop Sessions
CREATE TABLE IF NOT EXISTS security_sessions (
    session_id TEXT PRIMARY KEY,
    session_token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES security_users(user_id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES security_devices(device_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revocation_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_sessions_token ON security_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_security_sessions_user ON security_sessions(user_id);

-- 4. Roles & Permissions (RBAC)
CREATE TABLE IF NOT EXISTS security_roles (
    role TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    hierarchy_weight INT NOT NULL
);

INSERT INTO security_roles (role, description, hierarchy_weight) VALUES
    ('founder', 'Founder with complete sovereign administrative privileges', 400),
    ('admin', 'Administrator with operational authorization privileges', 300),
    ('operator', 'Standard operator executing routine workflows', 200),
    ('guest', 'Guest user with strictly read-only public access', 100)
ON CONFLICT (role) DO NOTHING;

-- 5. Resource Access Policies (ABAC)
CREATE TABLE IF NOT EXISTS security_resource_policies (
    policy_id TEXT PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain IN ('file', 'folder', 'application', 'database', 'credential', 'system', 'network')),
    resource_pattern TEXT NOT NULL,
    allowed_roles TEXT[] NOT NULL,
    allowed_operations TEXT[] NOT NULL,
    requires_approval_operations TEXT[] NOT NULL,
    project_id TEXT,
    is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Permission Approval Requests
CREATE TABLE IF NOT EXISTS security_approval_requests (
    request_id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target TEXT NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    affected_resources TEXT[] NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_explanation TEXT NOT NULL,
    action_hash TEXT NOT NULL,
    requested_by_actor TEXT NOT NULL,
    session_id TEXT REFERENCES security_sessions(session_id) ON DELETE SET NULL,
    project_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'executed', 'cancelled', 'expired', 'revoked')),
    approval_token_hash TEXT NOT NULL,
    execution_grant_token_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_by_actor TEXT,
    decided_at TIMESTAMPTZ,
    decision_reason TEXT,
    is_destructive BOOLEAN NOT NULL DEFAULT FALSE,
    rollback_plan TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_status ON security_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_action_hash ON security_approval_requests(action_hash);

-- 7. Credential Vault Metadata (Zero raw secrets)
CREATE TABLE IF NOT EXISTS security_credential_metadata (
    secret_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('api_key', 'oauth_token', 'database_uri', 'service_account', 'master_key')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    is_dpapi_protected BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_roles TEXT[] NOT NULL,
    fingerprint TEXT NOT NULL
);

-- 8. Security Policies Registry
CREATE TABLE IF NOT EXISTS security_policies (
    policy_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    is_immutable_core_policy BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    scope TEXT NOT NULL,
    rule_expression TEXT NOT NULL,
    enforcement_mode TEXT NOT NULL CHECK (enforcement_mode IN ('BLOCK', 'REQUIRE_APPROVAL', 'AUDIT_ONLY')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL
);

-- 9. Security Events & Threat Monitoring
CREATE TABLE IF NOT EXISTS security_events (
    event_id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    actor TEXT NOT NULL,
    session_id TEXT,
    resource TEXT,
    details TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp DESC);

-- 10. Security Incidents
CREATE TABLE IF NOT EXISTS security_incidents (
    incident_id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    triggering_events TEXT[] NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED')),
    remediation_action_taken TEXT
);

-- 11. Tamper-Resistant Chained Audit Ledger
CREATE TABLE IF NOT EXISTS security_audit_ledger (
    audit_id TEXT PRIMARY KEY,
    sequence_number BIGINT NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    session_ref TEXT,
    approval_ref TEXT,
    execution_status TEXT NOT NULL CHECK (execution_status IN ('SUCCESS', 'FAILURE', 'DENIED', 'BLOCKED', 'REVOKED')),
    result_summary TEXT,
    failure_reason TEXT,
    details_sanitized TEXT NOT NULL,
    previous_entry_hash TEXT NOT NULL,
    current_entry_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_seq ON security_audit_ledger(sequence_number);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON security_audit_ledger(timestamp DESC);

-- 12. Persistent Emergency Lockdown State
CREATE TABLE IF NOT EXISTS security_lockdown_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_locked_down BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by_actor TEXT,
    trigger_reason TEXT,
    active_executions_terminated INT NOT NULL DEFAULT 0,
    sessions_revoked_count INT NOT NULL DEFAULT 0,
    recovery_verification_required BOOLEAN NOT NULL DEFAULT TRUE,
    recovery_passphrase_hash TEXT
);
