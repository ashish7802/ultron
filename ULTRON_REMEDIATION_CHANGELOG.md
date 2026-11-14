# ULTRON Remediation Changelog

All notable changes made during the ULTRON remediation mission are documented in this file.

---

## [Milestone 2 — Real Computer Execution] - 2026-11-14

### Added
- `lib/computer/toolRegistry.ts`: Central Computer Tool Registry implementing standard execution, parameter schemas, risk levels, and permission gateway coordination for 7 tools (`launch_application`, `write_file`, `read_file`, `delete_file`, `search_files`, `run_shell_command`, `open_browser_url`).
- `ULTRON_MILESTONE_2_IMPLEMENTATION_REPORT.md`: Detailed test report and execution evidence for Milestone 2.

### Changed
- `lib/computer/index.ts`: Re-exported `toolRegistry.ts` from unified computer facade.
- `app/api/chat/route.ts`: Connected conversational dialogue to real tool execution for file operations, terminal commands, and application launching with honest verification reporting.
- `lib/orchestration/orchestrator.ts`: Replaced simulated default task executor with physical OS execution via `TerminalIntelligence` and `ComputerToolRegistry`.
- `components/UltronChat.tsx`: Added interactive approval card rendering and `/api/permission` invocation with live execution result feedback.

---

## [Milestone 1 — Security Foundation] - 2026-11-14
**Commit:** `af1d5eb5ba1ca693b40cc3fbbbdc1332755e0a74`

### Added
- `lib/security/recoveryKey.ts`: Centralized recovery key management utility prohibiting insecure static defaults (`FOUNDER_RECOVERY_OVERRIDE_KEY`, `TEST_RECOVERY_KEY_ULTRON_FOUNDER`), using constant-time comparison (`crypto.timingSafeEqual`) and local CSPRNG storage.

### Changed
- `app/api/computer/route.ts`:
  - Replaced hardcoded fallback in `reset_emergency_stop` with `verifyRecoveryKey()`.
  - Added physical filesystem path resolution via `fs.realpathSync()` in `isPathSafe()` to block symlink/junction traversals.
  - Enforced approval token presence before terminal command execution.
- `app/api/learning/route.ts`:
  - Added `isLearningAuthorized` authentication guard supporting session tokens and desktop cookies.
  - Implemented strict anti-poisoning in `ingest_task`: rejected non-standard outcomes and required explicit `testEvidenceId` for `verifiedByTest`.
  - Enforced founder or admin role requirement for `approve_evolution`, `activate_evolution`, and `rollback_evolution`.
- `app/api/permission/route.ts`:
  - Redacted `approvalToken` from returned plan objects in `GET` handler.
- `app/api/research/*`:
  - Enforced `validateDesktopSession` on `plan`, `project/[id]`, `discover`, `extract`, `reliability`, `verify`, and `contradictions` routes.
- `app/api/security/auth/route.ts`:
  - Replaced fallback check with `verifyRecoveryKey()`.
  - Authenticated session revocation (`revoke_session`, `revoke_all_sessions`) with role and ownership checks.
- `app/api/security/permissions/route.ts`:
  - Enforced founder/admin session validation on `GET /api/security/permissions`.
  - Redacted `executionGrantToken` from all query responses.
- `lib/computer/safetyControls.ts`:
  - Modified `isEmergencyStopActive()` to fail closed (returning `true`) if the Python bridge fails or throws an exception.
  - Synchronized lockdown state and written `ULTRON_EMERGENCY_STOP.lock` to disk.
- `lib/computer/terminalIntelligence.ts`:
  - Added `approvalGranted` parameter and payload transport to `executeCommand()` and `startBackgroundJob()`.
- `lib/security/emergencyEngine.ts`:
  - Synchronized `isSystemLockedDown()` across internal state, `.security_vault/lockdown.json`, and `ULTRON_EMERGENCY_STOP.lock`.
  - Integrated `verifyRecoveryKey()` into emergency reset flow.
- `lib/security/identityEngine.ts`:
  - Integrated `verifyRecoveryKey()` into `recovery_key` proof validation.
- `ultron_engine/computer/computer_intelligence_cli.py`:
  - Added `approvalGranted` extraction and passed it to terminal driver commands.
- `ultron_engine/computer/filesystem_driver.py`:
  - Added real physical path resolution (`os.path.realpath`) against protected boundaries in `_validate_path_safety()`.
- `ultron_engine/computer/safety_controller.py`:
  - Added file-based synchronization (`ULTRON_EMERGENCY_STOP.lock` and `.security_vault/lockdown.json`) to `is_emergency_stop_active()`.
- `ultron_engine/computer/terminal_driver.py`:
  - Enforced `approval_granted: bool = False` requirement on high-risk commands.
