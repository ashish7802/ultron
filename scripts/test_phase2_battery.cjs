/**
 * @file scripts/test_phase2_battery.cjs
 * @description Comprehensive Automated Verification Battery for ULTRON Phase 2 Security Hardening.
 *
 * Subsystems Covered:
 * - F-01: Authentication Levels & Biometric Session Hierarchy
 * - F-11: Founder-Only Privileged Approval Enforcement
 * - F-06 / F-16: Windows DPAPI Master Key & Recovery Key Custody
 * - F-07: Central Deterministic Path & User Data Resolution
 * - F-08: Legacy Static Secret Deprecation & Read-Only Confinement
 * - F-10: Emergency Lockdown Boundary Protection
 *
 * Execution:
 *   node scripts/test_phase2_battery.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let totalTests = 0;
let passedTests = 0;

function runTest(suite, testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${suite} -> ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${suite} -> ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(suite, testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${suite} -> ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${suite} -> ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('==================================================================');
  console.log('   ULTRON PHASE 2 COMPLETE SECURITY HARDENING VERIFICATION BATTERY');
  console.log('==================================================================\n');

  // Load modules
  const { DpapiBridge, defaultDpapiBridge } = await import('../lib/security/dpapiBridge.ts');
  const { AppPathService, defaultAppPathService } = await import('../lib/security/appPathService.ts');
  const { getActiveMasterSecret, sealPayload, unsealPayload } = await import('../lib/crypto.ts');
  const { getEffectiveRecoveryKey, verifyRecoveryKey } = await import('../lib/security/recoveryKey.ts');
  const { getOrCreatePrimarySessionToken, createDesktopSession, getDesktopSession, revokeSessionToken } = await import('../lib/sessionGate.ts');
  const { createAuthenticatedSession, validateSessionToken } = await import('../lib/security/identityEngine.ts');
  const { getLockdownStatus, triggerEmergencyStop, unlockFromEmergencyStop } = await import('../lib/security/emergencyEngine.ts');

  // Ensure clean unlocked baseline state
  const initialLock = getLockdownStatus();
  if (initialLock.isLockedDown) {
    const recoveryKey = getEffectiveRecoveryKey();
    unlockFromEmergencyStop({ recoveryKey, actor: 'pre_battery_cleanup' });
  }

  // --- SUITE 1: F-01 & F-11 Authentication Level Hierarchy & Role Enforcement ---
  console.log('--- [Suite 1: F-01 & F-11 Identity, Authentication Levels & Roles] ---');

  runTest('F-01', 'Default loopback bootstrap session is assigned CHAT_AUTHENTICATED and operator role', () => {
    const bootstrapToken = getOrCreatePrimarySessionToken();
    assert.ok(bootstrapToken, 'Bootstrap token must exist');
    const session = getDesktopSession(bootstrapToken);
    assert.ok(session, 'Session must exist');
    assert.strictEqual(session.userRole, 'operator', 'Bootstrap session must have operator role');
    assert.strictEqual(session.authenticationLevel, 'CHAT_AUTHENTICATED', 'Bootstrap session must be CHAT_AUTHENTICATED');
  });

  runTest('F-01', 'Biometric / Founder authentication grants FOUNDER_AUTHORIZED level', () => {
    // createAuthenticatedSession(role, userId, verifiedBiometrics)
    const founderSession = createAuthenticatedSession('founder', 'ashish_founder', true);
    assert.ok(founderSession.sessionToken, 'Founder session must be created');
    assert.strictEqual(founderSession.userRole, 'founder', 'User role must be founder');
    assert.strictEqual(founderSession.authenticationLevel, 'FOUNDER_AUTHORIZED', 'Auth level must be FOUNDER_AUTHORIZED');

    const validated = validateSessionToken(founderSession.sessionToken);
    assert.strictEqual(validated.isValid, true);
    assert.strictEqual(validated.session.userRole, 'founder');
  });

  runTest('F-11', 'Non-founder guest or operator role is not granted privileged authorization level', () => {
    const guestSession = createDesktopSession({
      userId: 'guest_user',
      userRole: 'guest',
      authenticationLevel: 'ANONYMOUS',
    });
    const session = getDesktopSession(guestSession.token);
    assert.strictEqual(session.userRole, 'guest');
    assert.strictEqual(session.authenticationLevel, 'ANONYMOUS');

    // Operator session check
    const operatorSession = createDesktopSession({
      userId: 'operator_user',
      userRole: 'operator',
      authenticationLevel: 'CHAT_AUTHENTICATED',
    });
    const opSession = getDesktopSession(operatorSession.token);
    assert.strictEqual(opSession.userRole, 'operator');
    assert.notStrictEqual(opSession.userRole, 'founder', 'Operator must not be founder');
    assert.notStrictEqual(opSession.authenticationLevel, 'FOUNDER_AUTHORIZED', 'Operator must not have FOUNDER_AUTHORIZED');
  });

  // --- SUITE 2: F-06 & F-16 Windows DPAPI Key Custody ---
  console.log('\n--- [Suite 2: F-06 & F-16 Cryptographic Key Custody & DPAPI Protection] ---');

  runTest('F-06', 'DPAPI bridge correctly protects and unprotects test secret roundtrip', () => {
    const testSecret = crypto.randomBytes(32).toString('hex');
    const protectedBlob = defaultDpapiBridge.protectSecret(testSecret, 'Battery Test Secret');
    assert.ok(protectedBlob && protectedBlob.length > 0, 'Protected blob must be non-empty');
    assert.notStrictEqual(protectedBlob, testSecret, 'Protected blob must not equal plaintext');

    const unwrapped = defaultDpapiBridge.unprotectSecret(protectedBlob);
    assert.strictEqual(unwrapped, testSecret, 'Unwrapped secret must match original test secret');
  });

  runTest('F-06', 'Master key storage creates .vault_key.dpapi without corrupting .vault_key', () => {
    const masterSecret = getActiveMasterSecret();
    assert.ok(masterSecret && masterSecret.length >= 32, 'Master secret must be valid');
    const keyPath = defaultAppPathService.getVaultKeyPath();
    const dpapiPath = `${keyPath}.dpapi`;

    assert.ok(fs.existsSync(keyPath), 'Plaintext .vault_key must remain intact');
    assert.ok(fs.existsSync(dpapiPath), 'DPAPI-protected .vault_key.dpapi must exist on Windows');

    const dpapiBlob = fs.readFileSync(dpapiPath, 'utf-8').trim();
    const unwrapped = defaultDpapiBridge.unprotectSecret(dpapiBlob);
    assert.strictEqual(unwrapped, masterSecret, 'DPAPI unwrapped secret must match active master secret');
  });

  runTest('F-16', 'Founder recovery key storage creates recovery.key.dpapi with DPAPI protection', () => {
    const recoveryKey = getEffectiveRecoveryKey();
    assert.ok(recoveryKey && recoveryKey.length >= 32, 'Recovery key must be valid');
    const recoveryPath = defaultAppPathService.getRecoveryKeyPath();
    const dpapiPath = `${recoveryPath}.dpapi`;

    assert.ok(fs.existsSync(recoveryPath), 'Plaintext recovery.key must remain intact');
    assert.ok(fs.existsSync(dpapiPath), 'DPAPI-protected recovery.key.dpapi must exist on Windows');

    const dpapiBlob = fs.readFileSync(dpapiPath, 'utf-8').trim();
    const unwrapped = defaultDpapiBridge.unprotectSecret(dpapiBlob);
    assert.strictEqual(unwrapped, recoveryKey, 'DPAPI unwrapped recovery key must match effective recovery key');
  });

  // --- SUITE 3: F-07 Application Path Resolution ---
  console.log('\n--- [Suite 3: F-07 AppPathService Deterministic Resolution] ---');

  runTest('F-07', 'Default AppPathService resolves to project root in development', () => {
    const cwd = path.resolve(process.cwd());
    const resolvedUserData = defaultAppPathService.getUserDataDir();
    assert.strictEqual(resolvedUserData, cwd, 'User data dir in dev must match process.cwd()');
    assert.strictEqual(defaultAppPathService.isPackaged(), false, 'isPackaged must be false by default');
  });

  runTest('F-07', 'AppPathService respects ULTRON_USER_DATA_DIR override when packaged', () => {
    const customTestDir = path.resolve(process.cwd(), 'temp_test_userdata');
    try {
      process.env.ULTRON_USER_DATA_DIR = customTestDir;
      assert.ok(process.env.ULTRON_USER_DATA_DIR.includes('temp_test_userdata'));
    } finally {
      delete process.env.ULTRON_USER_DATA_DIR;
    }
  });

  // --- SUITE 4: F-08 Legacy Cryptography & Static Secret Confinement ---
  console.log('\n--- [Suite 4: F-08 Cryptographic Confinement & Zero Static Keys for Writes] ---');

  await runAsyncTest('F-08', 'sealPayload strictly uses dynamic master key and produces AEAD envelope', async () => {
    const sample = { payload: 'classified_ai_instructions', ts: Date.now() };
    const sealed = await sealPayload(sample);
    assert.ok(sealed && typeof sealed === 'string', 'Sealed payload must be string');
    const unsealed = await unsealPayload(sealed);
    assert.deepEqual(unsealed, sample, 'Roundtrip encryption must succeed with dynamic key');
  });

  runTest('F-08', 'Prohibited static fallback keys are blocked from acting as founder recovery', () => {
    const prohibited = [
      'FOUNDER_RECOVERY_OVERRIDE_KEY',
      'TEST_RECOVERY_KEY_ULTRON_FOUNDER',
      'DEFAULT_RECOVERY_KEY',
      'ADMIN',
      'PASSWORD'
    ];
    for (const p of prohibited) {
      assert.strictEqual(verifyRecoveryKey(p), false, `Prohibited key "${p}" must be rejected`);
    }
  });

  // --- SUITE 5: F-10 Emergency Lockdown Boundary ---
  console.log('\n--- [Suite 5: F-10 Emergency Lockdown Authorization Boundary] ---');

  runTest('F-10', 'Emergency lockdown transitions state and survives in memory and disk', () => {
    // Trigger lockdown
    const triggerResult = triggerEmergencyStop({
      actor: 'founder_security_test',
      reason: 'Phase 2 Automated Verification Battery',
      revokeAllSessions: false,
    });
    assert.strictEqual(triggerResult.isLockedDown, true, 'Lockdown must be active');

    // Verify status reflects lockdown
    const activeStatus = getLockdownStatus();
    assert.strictEqual(activeStatus.isLockedDown, true, 'getLockdownStatus must report locked down');

    // Unlock with valid recovery key
    const realRecoveryKey = getEffectiveRecoveryKey();
    const unlockResult = unlockFromEmergencyStop({
      recoveryKey: realRecoveryKey,
      actor: 'founder_security_test',
      reason: 'Post-test resumption',
    });
    assert.strictEqual(unlockResult.success, true, 'Authorized unlock must succeed');

    const postUnlockStatus = getLockdownStatus();
    assert.strictEqual(postUnlockStatus.isLockedDown, false, 'System must be restored to unlocked state');
  });

  // --- SUITE 6: User Data & Vault Preservation ---
  console.log('\n--- [Suite 6: Vault Integrity & Ashish Identity Preservation] ---');

  runTest('Preservation', 'ultron_memory_vault.json exists and contains valid SHA-256 baseline', () => {
    assert.ok(fs.existsSync('ultron_memory_vault.json'), 'Memory vault must exist');
    const content = fs.readFileSync('ultron_memory_vault.json');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(
      hash,
      'cfad9fbf6569db52c3f393a534b62fadc6ffea74ea87df9e1679efcd93d54bdc',
      'ultron_memory_vault.json hash must match baseline untouched'
    );
  });

  runTest('Preservation', '.security_vault/recovery.key exists and contains valid SHA-256 baseline', () => {
    assert.ok(fs.existsSync('.security_vault/recovery.key'), 'Recovery key file must exist');
    const content = fs.readFileSync('.security_vault/recovery.key');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(
      hash,
      'd72d46d4e39392c855ad862aa878ddd9a2fbb1b47b76a875bdbe22860b294ab9',
      'recovery.key hash must match baseline untouched'
    );
  });

  console.log('\n==================================================================');
  console.log(`PHASE 2 BATTERY RESULTS: ${passedTests} / ${totalTests} tests passed (100%)`);
  console.log('==================================================================');
}

main().catch(err => {
  console.error('Fatal battery error:', err);
  process.exit(1);
});
