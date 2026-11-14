/**
 * @file scripts/test_milestone5_battery.cjs
 * @description Comprehensive automated integration, regression, and security verification test battery for Milestone 5.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Security & Identity
const { verifyRecoveryKey } = require('../lib/security/recoveryKey.ts');
const { createAuthenticatedSession, validateSessionToken, revokeSession } = require('../lib/security/identityEngine.ts');
const { validateDesktopSession } = require('../lib/sessionGate.ts');

// 2. Computer Execution & Tool Registry
const { defaultComputerToolRegistry } = require('../lib/computer/toolRegistry.ts');
const { approveActionPlan, planAction } = require('../lib/permissionGateway.ts');
const { defaultPythonBridge } = require('../lib/computer/pythonBridge.ts');
const { defaultSafetyControls } = require('../lib/computer/safetyControls.ts');

// 3. Task Verification
const { defaultTaskVerificationEngine } = require('../lib/orchestration/taskVerificationEngine.ts');

async function runMilestone5Battery() {
  console.log('================================================================');
  console.log('ULTRON MILESTONE 5: AUTOMATED INTEGRATION & REGRESSION BATTERY');
  console.log('================================================================\n');

  // ── TEST GROUP 1: SECURITY FOUNDATION REGRESSION (M1) ─────────────────
  console.log('>>> [GROUP 1] Security Foundation Regression Tests');

  // SEC-01: Prohibited default recovery keys
  assert.strictEqual(verifyRecoveryKey('FOUNDER_RECOVERY_OVERRIDE_KEY'), false, 'FOUNDER_RECOVERY_OVERRIDE_KEY must be rejected');
  assert.strictEqual(verifyRecoveryKey('TEST_RECOVERY_KEY_ULTRON_FOUNDER'), false, 'TEST_RECOVERY_KEY_ULTRON_FOUNDER must be rejected');
  assert.strictEqual(verifyRecoveryKey(''), false, 'Empty key must be rejected');
  console.log('  [PASS] Prohibited static recovery passphrases fail closed.');

  // SEC-02: Recovery key constant-time verification
  const { getEffectiveRecoveryKey } = require('../lib/security/recoveryKey.ts');
  const validKey = getEffectiveRecoveryKey();
  assert.ok(validKey && validKey.length >= 32, 'Effective recovery key must be resolved');
  assert.strictEqual(verifyRecoveryKey(validKey), true, 'Valid recovery key must verify');
  console.log('  [PASS] Authorized recovery key constant-time verification succeeds.');

  // SEC-03: Emergency Stop & Lockfile Synchronization
  const triggerRes = await defaultSafetyControls.triggerEmergencyStop('Milestone 5 battery test');
  assert.strictEqual(triggerRes.emergencyStopActive, true, 'Trigger emergency stop must return active');
  assert.strictEqual(fs.existsSync(path.join(process.cwd(), 'ULTRON_EMERGENCY_STOP.lock')), true, 'Emergency lockfile must exist');

  const isLocked = await defaultSafetyControls.isEmergencyStopActive();
  assert.strictEqual(isLocked, true, 'Safety controls must report emergency stop active');

  // While locked down, tools must fail closed
  const toolBlocked = await defaultComputerToolRegistry.executeTool('run_shell_command', { command: 'echo test' });
  assert.strictEqual(toolBlocked.success, false, 'Tool execution must be blocked during emergency stop');
  console.log('  [PASS] Emergency Stop fail-closed lockfile behavior verified.');

  // Reset Emergency Stop
  const resetRes = await defaultSafetyControls.resetEmergencyStop('Authorized battery reset');
  assert.strictEqual(resetRes.emergencyStopActive, false);
  assert.strictEqual(fs.existsSync(path.join(process.cwd(), 'ULTRON_EMERGENCY_STOP.lock')), false);
  console.log('  [PASS] Emergency Stop authorized reset verified.');

  // ── TEST GROUP 2: IDENTITY & SESSION UNIFICATION (M4) ─────────────────
  console.log('\n>>> [GROUP 2] Unified Identity & Session Lifecycle Tests');

  // ID-01: Create session with founder role and biometric verification flag
  const sess = createAuthenticatedSession('founder', 'usr_ashish_m5', true);
  assert.ok(sess.sessionToken, 'Must generate sessionToken');
  assert.strictEqual(sess.userRole, 'founder');
  assert.ok(sess.lastBiometricVerificationAt, 'Biometric verification timestamp must be recorded');

  // ID-02: Validate across identityEngine and sessionGate
  const valId = validateSessionToken(sess.sessionToken);
  assert.strictEqual(valId.isValid, true);
  assert.strictEqual(valId.session.userRole, 'founder');

  const gateReq = {
    headers: {
      get: (h) => {
        if (h.toLowerCase() === 'x-ultron-session-token') return sess.sessionToken;
        if (h.toLowerCase() === 'origin') return 'http://localhost:3000';
        return null;
      }
    }
  };
  const valGate = validateDesktopSession(gateReq);
  assert.strictEqual(valGate.valid, true, 'sessionGate must recognize identityEngine session');
  console.log('  [PASS] Biometric founder session recognized across identityEngine and sessionGate.');

  // ID-03: Revocation synchronization
  const revOk = revokeSession(sess.sessionToken, 'Milestone 5 battery revocation');
  assert.strictEqual(revOk, true);

  const valIdAfter = validateSessionToken(sess.sessionToken);
  assert.strictEqual(valIdAfter.isValid, false, 'identityEngine must reject revoked session');

  const valGateAfter = validateDesktopSession(gateReq);
  assert.strictEqual(valGateAfter.valid, false, 'sessionGate must reject revoked session');
  console.log('  [PASS] Immediate session revocation synchronized across subsystems.');

  // ── TEST GROUP 3: REAL COMPUTER EXECUTION (M2 & M4) ───────────────────
  console.log('\n>>> [GROUP 3] Real Computer Execution Pipeline Tests');

  const testTempDir = path.join(process.cwd(), 'temp_m5_battery');
  if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });
  const testFilePath = path.join(testTempDir, 'm5_test_file.txt');

  // TOOL-01: write_file
  const writeRes = await defaultComputerToolRegistry.executeTool('write_file', {
    path: testFilePath,
    content: 'Verified physical disk content for Milestone 5.',
    overwrite: true
  });
  assert.strictEqual(writeRes.success, true);
  assert.strictEqual(writeRes.verified, true);
  assert.strictEqual(fs.existsSync(testFilePath), true);
  console.log('  [PASS] write_file: Physical file created and verified on disk.');

  // TOOL-02: read_file
  const readRes = await defaultComputerToolRegistry.executeTool('read_file', { path: testFilePath });
  assert.strictEqual(readRes.success, true);
  assert.ok(readRes.output.includes('Verified physical disk content for Milestone 5.'));
  console.log('  [PASS] read_file: Real content read and validated.');

  // TOOL-03: search_files
  const searchRes = await defaultComputerToolRegistry.executeTool('search_files', {
    directory: testTempDir,
    pattern: 'm5_test'
  });
  assert.strictEqual(searchRes.success, true);
  assert.ok(searchRes.data.matchCount >= 1);
  console.log('  [PASS] search_files: Pattern matching on real filesystem verified.');

  // TOOL-04: delete_file approval requirement
  const delPlan = await defaultComputerToolRegistry.executeTool('delete_file', { path: testFilePath });
  assert.strictEqual(delPlan.success, false, 'Unapproved delete must be blocked');
  assert.ok(delPlan.permissionPlan, 'Must return approval plan');

  const delApprove = approveActionPlan(delPlan.permissionPlan.planId, delPlan.permissionPlan.approvalToken);
  assert.strictEqual(delApprove.success, true);

  const delExec = await defaultComputerToolRegistry.executeTool('delete_file', { path: testFilePath }, {
    planId: delPlan.permissionPlan.planId,
    executionGrantToken: delApprove.executionGrantToken,
  });
  assert.strictEqual(delExec.success, true);
  assert.strictEqual(delExec.verified, true);
  assert.strictEqual(fs.existsSync(testFilePath), false);
  console.log('  [PASS] delete_file: Approval enforcement and physical deletion verified.');

  // Cleanup temp dir
  fs.rmdirSync(testTempDir);

  // ── TEST GROUP 4: PYTHON BRIDGE INTEGRATION (M4) ──────────────────────
  console.log('\n>>> [GROUP 4] Python Bridge Subprocess Integration Tests');

  // BRG-01: Small payload stdin transport
  const brg1 = await defaultPythonBridge.execute('os_info', { check: 'small' });
  assert.strictEqual(brg1.success, true);
  assert.ok(brg1.data.platform);
  console.log('  [PASS] Python bridge: Stdin transport for small payload verified.');

  // BRG-02: Large 2MB payload stdin transport
  const largePayload = 'X'.repeat(2 * 1024 * 1024);
  const brg2 = await defaultPythonBridge.execute('os_info', { blob: largePayload });
  assert.strictEqual(brg2.success, true);
  console.log('  [PASS] Python bridge: Stdin streaming for large 2MB payload verified.');

  // BRG-03: Unknown command handling
  const brg3 = await defaultPythonBridge.execute('unknown_bogus_action', {});
  assert.strictEqual(brg3.success, false);
  assert.ok(brg3.error.includes("Unknown command 'unknown_bogus_action'"));
  console.log('  [PASS] Python bridge: Graceful error handling on unknown commands verified.');

  // ── TEST GROUP 5: VERIFICATION RELIABILITY & DEFENSE (M3 & M5) ─────────
  console.log('\n>>> [GROUP 5] Task Verification Reliability & Defenses');

  // VER-01: Missing exit code rejected
  const vExit = defaultTaskVerificationEngine.verifyTask({
    id: 't_exit',
    title: 'Exit check',
    status: 'READY',
    acceptanceCriteria: [{ id: 'c_ex', description: 'Requires exit code 0', evaluator: 'EXIT_CODE', expectedValue: 0 }],
    deliverables: []
  }, { output: 'Done' });
  assert.strictEqual(vExit.isVerified, false, 'Missing exit code must fail verification');
  console.log('  [PASS] Missing exit code rejected with isVerified: false.');

  // VER-02: Empty file on disk rejected
  const emptyTemp = path.join(process.cwd(), 'temp_m5_empty.txt');
  fs.writeFileSync(emptyTemp, '', 'utf-8');
  const vEmpty = defaultTaskVerificationEngine.verifyTask({
    id: 't_empty',
    title: 'Empty file check',
    status: 'READY',
    acceptanceCriteria: [{ id: 'c_fl', description: 'Non-empty file', evaluator: 'FILE_NON_EMPTY', expectedValue: 'temp_m5_empty.txt' }],
    deliverables: ['temp_m5_empty.txt']
  }, { success: true });
  assert.strictEqual(vEmpty.isVerified, false, 'Empty file must fail FILE_NON_EMPTY');
  fs.unlinkSync(emptyTemp);
  console.log('  [PASS] Empty file on disk rejected with isVerified: false.');

  console.log('\n================================================================');
  console.log('ALL MILESTONE 5 INTEGRATION & REGRESSION TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runMilestone5Battery().catch(err => {
  console.error('\n[FATAL ERROR IN MILESTONE 5 BATTERY]', err);
  process.exit(1);
});
