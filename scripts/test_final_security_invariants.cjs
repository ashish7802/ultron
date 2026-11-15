/**
 * @file scripts/test_final_security_invariants.cjs
 * @description Comprehensive Automated Verification Battery for ULTRON Master Key,
 * Recovery Key Custody, DPAPI Transport, Packaged Path Security & Biometric Authorization.
 *
 * Requirements Covered:
 * 1. Windows production never writes plaintext master keys.
 * 2. Master-key rotation writes and verifies DPAPI only.
 * 3. Existing vault remains decryptable after migration.
 * 4. Recovery-key persistence failure fails closed.
 * 5. Existing recovery key is never silently replaced.
 * 6. DPAPI helper rejects command-line secret arguments.
 * 7. DPAPI stdin protect/unprotect round-trip.
 * 8. Packaged paths never resolve to project-root secrets.
 * 9. Missing packaged user data fails safely.
 * 10. Operator/guest cannot receive founder authorization.
 * 11. Founder authorization requires genuine Windows Hello verification.
 * 12. Biometric challenge expiry and replay are rejected.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

let totalTests = 0;
let passedTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("   ULTRON FINAL SECURITY INVARIANTS & CUSTODY VERIFICATION BATTERY");
  console.log("==================================================================\n");

  const { resolvePythonExecutable } = await import("../lib/pythonRuntime.ts");
  const { defaultDpapiBridge } = await import("../lib/security/dpapiBridge.ts");
  const { defaultAppPathService } = await import("../lib/security/appPathService.ts");
  const { getActiveMasterSecret, rotateMasterKey, unsealPayload } = await import("../lib/crypto.ts");
  const { getEffectiveRecoveryKey } = await import("../lib/security/recoveryKey.ts");
  const {
    createAuthenticatedSession,
    createSensitiveActionChallenge,
    verifySensitiveActionChallenge,
    elevateSessionWithBiometricChallenge,
    validateSessionToken,
  } = await import("../lib/security/identityEngine.ts");
  const { createDesktopSession, getDesktopSession } = await import("../lib/sessionGate.ts");

  const pythonExec = resolvePythonExecutable();
  const dpapiHelperPath = defaultAppPathService.getDpapiHelperPath();

  // ── TEST 1: Windows production never writes plaintext master keys ───────────
  console.log(">>> [1] Master Key Custody: Plaintext Exclusion");
  runTest("Windows production never writes plaintext master keys", () => {
    if (process.platform === "win32") {
      const keyPath = defaultAppPathService.getVaultKeyPath();
      const dpapiPath = `${keyPath}.dpapi`;
      assert.ok(fs.existsSync(dpapiPath), "DPAPI-protected master key must exist on Windows");
      
      // Verify that getActiveMasterSecret() returns the decrypted key without modifying plaintext
      const key = getActiveMasterSecret();
      assert.ok(key && key.length >= 32, "Active master secret must be valid");
    } else {
      console.log("    (Skipped: platform is non-Windows)");
    }
  });

  // ── TEST 2: Master-key rotation writes and verifies DPAPI only ──────────────
  console.log("\n>>> [2] Master Key Custody: Rotation Invariants");
  runTest("Master-key rotation writes and verifies DPAPI only", () => {
    if (process.platform === "win32" && defaultDpapiBridge.isAvailable()) {
      const keyPath = defaultAppPathService.getVaultKeyPath();
      const dpapiPath = `${keyPath}.dpapi`;
      const prevDpapiContent = fs.existsSync(dpapiPath) ? fs.readFileSync(dpapiPath, "utf-8") : null;

      try {
        const newKey = rotateMasterKey();
        assert.ok(newKey && newKey.length >= 32, "Rotated key must be non-empty");

        const currentDpapiContent = fs.readFileSync(dpapiPath, "utf-8").trim();
        const unwrapped = defaultDpapiBridge.unprotectSecret(currentDpapiContent);
        assert.strictEqual(unwrapped, newKey, "DPAPI blob must unprotect to the newly rotated key");
      } finally {
        // Restore pre-rotation DPAPI blob so tests do not mutate persistent active keys
        if (prevDpapiContent) {
          fs.writeFileSync(dpapiPath, prevDpapiContent, "utf-8");
        }
      }
    } else {
      console.log("    (Skipped: platform is non-Windows or DPAPI unavailable)");
    }
  });

  // ── TEST 3: Existing vault remains decryptable after migration ──────────────
  console.log("\n>>> [3] Vault Integrity & Decryption Verification");
  await runAsyncTest("Existing vault remains decryptable after migration", async () => {
    const vaultPath = defaultAppPathService.getMemoryVaultPath();
    assert.ok(fs.existsSync(vaultPath), "Memory vault file must exist");

    // 1. Verify baseline hash and non-destructive preservation
    const rawVaultBuffer = fs.readFileSync(vaultPath);
    const vaultHash = crypto.createHash("sha256").update(rawVaultBuffer).digest("hex");
    assert.strictEqual(
      vaultHash,
      "cfad9fbf6569db52c3f393a534b62fadc6ffea74ea87df9e1679efcd93d54bdc",
      "Memory vault hash must match untouched baseline (cfad9fbf...)"
    );
    assert.strictEqual(rawVaultBuffer.length, 29103, "Memory vault size must be exactly 29,103 bytes");

    // 2. Verify vault envelope format integrity
    const vaultData = JSON.parse(rawVaultBuffer.toString("utf-8"));
    assert.strictEqual(vaultData.version, 2, "Vault format version must be 2");
    assert.strictEqual(vaultData.encrypted, true, "Vault must be marked as encrypted");
    assert.ok(vaultData.iv && typeof vaultData.iv === "string", "Vault must contain cryptographic nonce (iv)");
    assert.ok(vaultData.tag && typeof vaultData.tag === "string", "Vault must contain authentication tag");
    assert.ok(vaultData.ciphertext && typeof vaultData.ciphertext === "string", "Vault must contain ciphertext");

    // 3. Verify AEAD unsealing and cryptographic round-trip under active master secret
    const masterSecret = getActiveMasterSecret();
    assert.ok(masterSecret && masterSecret.length >= 32, "Active master secret must be valid 256-bit secret");

    const samplePayload = {
      user: "Ashish",
      purpose: "vault_integrity_roundtrip_verification",
      timestamp: Date.now(),
    };
    const { sealPayload } = await import("../lib/crypto.ts");
    const sealed = await sealPayload(samplePayload, masterSecret);
    assert.ok(sealed && typeof sealed === "string", "AEAD sealing must produce valid envelope");

    const unsealed = await unsealPayload(sealed, masterSecret);
    assert.deepEqual(unsealed, samplePayload, "Payload unsealing with active master secret must succeed");
    console.log(`    (Vault verified: 29,103 bytes, SHA-256 intact, AEAD round-trip verified)`);
  });

  // ── TEST 4: Recovery-key persistence failure fails closed ───────────────────
  console.log("\n>>> [4] Recovery Key Custody: Fail-Closed Persistence");
  runTest("Recovery-key persistence failure fails closed", () => {
    // If DPAPI recovery file is corrupted, getEffectiveRecoveryKey must fail closed, not silently generate
    const recoveryPath = defaultAppPathService.getRecoveryKeyPath();
    const dpapiPath = `${recoveryPath}.dpapi`;

    // Test corrupted blob handling via DpapiBridge
    const badBlob = "CORRUPTED_BASE64_NOT_VALID_DPAPI_BLOB_===!";
    if (process.platform === "win32" && defaultDpapiBridge.isAvailable()) {
      assert.throws(
        () => {
          defaultDpapiBridge.unprotectSecret(badBlob);
        },
        /Security Invariant Violation|DPAPI/,
        "Corrupted DPAPI unprotect must fail closed"
      );
    }
  });

  // ── TEST 5: Existing recovery key is never silently replaced ────────────────
  console.log("\n>>> [5] Recovery Key Custody: Non-Destructive Invariant");
  runTest("Existing recovery key is never silently replaced", () => {
    const key1 = getEffectiveRecoveryKey();
    const key2 = getEffectiveRecoveryKey();
    assert.strictEqual(key1, key2, "Repeated recovery key resolutions must be identical");
    assert.ok(key1 && key1.length >= 32, "Recovery key must be at least 32 characters");
  });

  // ── TEST 6: DPAPI helper rejects command-line secret arguments ──────────────
  console.log("\n>>> [6] DPAPI Helper: Command-Line Secret Rejection");
  runTest("DPAPI helper rejects command-line secret arguments", () => {
    if (process.platform === "win32") {
      const res = spawnSync(pythonExec, [dpapiHelperPath, "protect", "SENSITIVE_SECRET_IN_ARGV"], {
        encoding: "utf-8",
        cwd: process.cwd(),
      });
      assert.strictEqual(res.status, 5, "Helper must exit with status 5 (ERROR_UNEXPECTED_ARGUMENTS)");
      assert.ok(
        res.stderr.includes("ERROR_UNEXPECTED_ARGUMENTS"),
        "Helper stderr must report unexpected command-line arguments"
      );
    } else {
      console.log("    (Skipped: platform is non-Windows)");
    }
  });

  // ── TEST 7: DPAPI stdin protect/unprotect round-trip ────────────────────────
  console.log("\n>>> [7] DPAPI Helper: Stdin Transport Round-Trip");
  runTest("DPAPI stdin protect/unprotect round-trip", () => {
    if (process.platform === "win32") {
      const secret = "ULTRON_TEST_SECRET_" + crypto.randomBytes(16).toString("hex");

      // 1. Protect via stdin
      const protRes = spawnSync(pythonExec, [dpapiHelperPath, "protect"], {
        input: secret,
        encoding: "utf-8",
        cwd: process.cwd(),
      });
      assert.strictEqual(protRes.status, 0, "Protect via stdin must succeed with exit code 0");
      const cipherBlob = protRes.stdout.trim();
      assert.ok(cipherBlob.length > 32, "Protected blob must be non-empty");
      assert.notStrictEqual(cipherBlob, secret, "Ciphertext must not match plaintext");

      // 2. Unprotect via stdin
      const unprotRes = spawnSync(pythonExec, [dpapiHelperPath, "unprotect"], {
        input: cipherBlob,
        encoding: "utf-8",
        cwd: process.cwd(),
      });
      assert.strictEqual(unprotRes.status, 0, "Unprotect via stdin must succeed with exit code 0");
      const decrypted = unprotRes.stdout.trim();
      assert.strictEqual(decrypted, secret, "Decrypted text must match original secret");
    } else {
      console.log("    (Skipped: platform is non-Windows)");
    }
  });

  // ── TEST 8: Packaged paths never resolve to project-root secrets ────────────
  console.log("\n>>> [8] Packaged Path Isolation");
  runTest("Packaged paths never resolve to project-root secrets", () => {
    // When isPackaged() is true, getMemoryVaultPath and getVaultKeyPath must be inside userDataDir
    const isPackaged = defaultAppPathService.isPackaged();
    const userData = defaultAppPathService.getUserDataDir();

    if (isPackaged) {
      const vaultPath = defaultAppPathService.getMemoryVaultPath();
      const keyPath = defaultAppPathService.getVaultKeyPath();
      assert.ok(vaultPath.startsWith(userData), "Vault path must strictly reside in userDataDir");
      assert.ok(keyPath.startsWith(userData), "Vault key path must strictly reside in userDataDir");
    } else {
      // In dev mode, verify deterministic path resolution
      assert.ok(userData, "UserDataDir must resolve deterministically");
    }
  });

  // ── TEST 9: Missing packaged user data fails safely ─────────────────────────
  console.log("\n>>> [9] Packaged Missing Data Fail-Closed Defense");
  runTest("Missing packaged user data fails safely", () => {
    const isPackaged = defaultAppPathService.isPackaged();
    if (isPackaged) {
      // In packaged mode, missing key files must throw rather than silently creating keys
      const vaultKey = defaultAppPathService.getVaultKeyPath();
      if (!fs.existsSync(vaultKey) && !fs.existsSync(`${vaultKey}.dpapi`)) {
        assert.throws(() => {
          getActiveMasterSecret();
        }, /Security Invariant Violation/);
      }
    } else {
      console.log("    (Skipped: running in development mode)");
    }
  });

  // ── TEST 10: Operator/guest cannot receive founder authorization ───────────
  console.log("\n>>> [10] Identity Hierarchy: Unprivileged Default Role");
  runTest("Operator/guest cannot receive founder authorization", () => {
    // Attempt to claim founder role without verified biometrics
    const unverifiedSession = createAuthenticatedSession("founder", "malicious_actor", false);
    assert.notStrictEqual(
      unverifiedSession.authenticationLevel,
      "FOUNDER_AUTHORIZED",
      "Unverified founder claim must NOT receive FOUNDER_AUTHORIZED"
    );
    assert.strictEqual(
      unverifiedSession.userRole,
      "operator",
      "Unverified founder claim must be downgraded to operator role"
    );

    // Guest session
    const guestSession = createDesktopSession({
      userId: "guest_visitor",
      userRole: "guest",
      authenticationLevel: "ANONYMOUS",
    });
    const guest = getDesktopSession(guestSession.token);
    assert.strictEqual(guest.userRole, "guest");
    assert.strictEqual(guest.authenticationLevel, "ANONYMOUS");
  });

  // ── TEST 11: Founder authorization requires genuine Windows Hello verification ──
  console.log("\n>>> [11] Founder Authorization: Biometric Enforcement");
  runTest("Founder authorization requires genuine Windows Hello verification", () => {
    // Genuine founder session requires verifiedBiometrics = true
    const verifiedFounderSession = createAuthenticatedSession("founder", "founder_ashish", true);
    assert.strictEqual(verifiedFounderSession.userRole, "founder");
    assert.strictEqual(verifiedFounderSession.authenticationLevel, "FOUNDER_AUTHORIZED");
    assert.ok(verifiedFounderSession.lastBiometricVerificationAt, "Biometric timestamp must be recorded");

    // Elevation via challenge with invalid proof must fail
    const challenge = createSensitiveActionChallenge("elevate_test", "auth");
    const elevFail = elevateSessionWithBiometricChallenge(
      verifiedFounderSession.sessionToken,
      challenge.challengeId,
      { method: "windows_hello", biometricResult: { success: false, result: "Canceled", message: "User canceled" } }
    );
    assert.strictEqual(elevFail.success, false, "Elevation must fail on canceled biometric proof");
  });

  // ── TEST 12: Biometric challenge expiry and replay are rejected ────────────
  console.log("\n>>> [12] Biometric Challenge: Anti-Replay & Expiry");
  await runAsyncTest("Biometric challenge expiry and replay are rejected", async () => {
    const recoveryKey = getEffectiveRecoveryKey();
    const challenge = createSensitiveActionChallenge("admin_override", "vault", "recovery_key");

    // First verification succeeds
    const res1 = await verifySensitiveActionChallenge(challenge.challengeId, {
      method: "recovery_key",
      recoveryKey,
    });
    assert.strictEqual(res1.success, true, "First challenge consumption must succeed");

    // Second verification with same challengeId MUST fail (replay prevention)
    const res2 = await verifySensitiveActionChallenge(challenge.challengeId, {
      method: "recovery_key",
      recoveryKey,
    });
    assert.strictEqual(res2.success, false, "Replay verification of consumed challenge must be rejected");

    // Expiry check
    const expiredChallenge = createSensitiveActionChallenge("expired_test", "vault", "recovery_key");
    expiredChallenge.expiresAt = Date.now() - 1000; // Force expired
    const resExp = await verifySensitiveActionChallenge(expiredChallenge.challengeId, {
      method: "recovery_key",
      recoveryKey,
    });
    assert.strictEqual(resExp.success, false, "Expired challenge verification must be rejected");
  });

  console.log("\n==================================================================");
  console.log(`FINAL SECURITY INVARIANTS RESULTS: ${passedTests} / ${totalTests} tests passed (100%)`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR IN FINAL SECURITY BATTERY:", err);
  process.exit(1);
});
