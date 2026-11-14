# ULTRON Phase 2 Changelog

## [Phase 2] - 2026-11-14

### Added
- **Windows DPAPI Integration (`ultron_engine/dpapi_helper.py`, `lib/security/dpapiBridge.ts`):**
  - Added native Python bridge utilizing `win32crypt.CryptProtectData` and `win32crypt.CryptUnprotectData`.
  - Added TypeScript `DpapiBridge` singleton with cross-platform fallback for containerized test environments.
  - Automatically encrypts `.vault_key` to `.vault_key.dpapi` and `recovery.key` to `recovery.key.dpapi`.
- **Deterministic Application Path Resolver (`lib/security/appPathService.ts`):**
  - Centralized path resolution across development and packaged Electron environments.
  - Prioritizes `process.env.ULTRON_USER_DATA_DIR` to prevent read-only directory failures.
- **Authentication Level Hierarchy (`lib/security/types.ts`):**
  - Introduced `AuthenticationLevel` type union (`ANONYMOUS`, `CHAT_AUTHENTICATED`, `BIOMETRIC_VERIFIED`, `PRIVILEGED_AUTHORIZED`, `FOUNDER_AUTHORIZED`).
  - Added `authenticationLevel` and `userRole` to `DesktopSession` and `SessionInfo`.
- **CI/CD Security Workflow (`.github/workflows/security-ci.yml`):**
  - Added GitHub Actions pipeline for continuous static type-checking and automated security test suite execution.
- **Automated Phase 2 Battery (`scripts/test_phase2_battery.cjs`):**
  - Added comprehensive 13-test automated regression suite covering F-01, F-06, F-07, F-08, F-10, F-11, F-16, and data preservation.

### Changed
- **Session Gate (`lib/sessionGate.ts`):**
  - Scoped bootstrap token strictly to `operator` role and `CHAT_AUTHENTICATED` level.
  - Added `getDesktopSession()` and `createDesktopSession()` helper functions.
- **Identity Engine (`lib/security/identityEngine.ts`):**
  - Updated `createAuthenticatedSession()` to compute `authenticationLevel` based on verified biometric evidence and founder status.
  - Updated `listActiveSessions()` to expose `authenticationLevel` in sanitized session listings.
- **Permission Route (`app/api/permission/route.ts`):**
  - Gated action approval behind strict role verification (`session.userRole === "founder"` or `operator`), rejecting unauthorized callers with HTTP 403.
- **Emergency Route (`app/api/security/emergency/route.ts`):**
  - Enforced authenticated session or valid recovery key requirements on `action: "lockdown"` to prevent local DoS attacks.
- **Crypto Subsystem (`lib/crypto.ts`):**
  - Integrated `defaultAppPathService` and `defaultDpapiBridge` for `.vault_key` storage.
  - Confined `LEGACY_MIGRATION_KEY` strictly to read-only decryption of historical V1 envelopes.
- **Recovery Key Manager (`lib/security/recoveryKey.ts`):**
  - Integrated `defaultAppPathService` and `defaultDpapiBridge` for `recovery.key` storage.
  - Enforced constant-time verification against prohibited static keys.

### Security Guarantees Preserved
- 100% data preservation of user memory vault (`ultron_memory_vault.json`) and recovery keys.
- Preserved all Phase 1 and Milestone 5 invariants (HMAC subprocess grants, parameter binding, safe predicate evaluator, tool registry).
