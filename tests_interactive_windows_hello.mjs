/**
 * @file tests_interactive_windows_hello.mjs
 * @description Manual Interactive Verification Harness for Windows Hello Biometrics.
 *
 * Subsystem:
 * Centralized Security, Founder Identity & OS Biometrics (Module 1).
 *
 * Key Responsibilities:
 * - Provides an explicit separation between automated platform checks and manual interactive verification.
 * - In non-interactive mode (`--check`): inspects WinBio biometric units and WinRT UserConsentVerifier availability.
 * - In interactive mode (`--interactive`): pops the native Windows Hello biometric dialogue box
 *   requiring physical fingerprint touch or Hello PIN entry.
 * - Asserts fail-closed behavior: cancellations, timeouts, and unverified touches return `success: false`.
 *
 * Usage:
 *   Non-interactive check:
 *     node --experimental-strip-types tests_interactive_windows_hello.mjs --check
 *   Interactive prompt (Requires Human Founder at Physical Device):
 *     node --experimental-strip-types tests_interactive_windows_hello.mjs --interactive
 */

import { getWindowsHelloStatus, verifyWindowsHelloConsent } from "./lib/security/windowsHelloBridge.ts";

async function run() {
  const isInteractive = process.argv.includes("--interactive");

  console.log("===============================================================================");
  console.log("       WINDOWS HELLO BIOMETRIC VERIFICATION HARNESS                            ");
  console.log("===============================================================================");

  console.log("\n[STEP 1] Checking Windows Hello Hardware & OS Platform Status...");
  const status = await getWindowsHelloStatus();
  console.log("Status Result:", JSON.stringify(status, null, 2));

  if (!status.supported || !status.windowsHelloReady) {
    console.warn("\n[WARNING] Windows Hello is not ready or biometric hardware is absent.");
    process.exit(0);
  }

  console.log("\n[INFO] Biometric Hardware Detected:");
  console.log(`- Supported: ${status.supported}`);
  console.log(`- Biometric Device: ${status.deviceName || "Unknown"}`);
  console.log(`- Biometric Enrolled: ${status.isEnrolled}`);
  console.log(`- WinRT Consent Status: ${status.availability}`);
  console.log(`- Secure Enclave / Isolation: ${status.enclaveType}`);

  if (!isInteractive) {
    console.log("\n[RESULT] Non-interactive hardware & platform verification: PASS");
    console.log("To perform an interactive finger touch verification, re-run with:");
    console.log("  node --experimental-strip-types tests_interactive_windows_hello.mjs --interactive");
    process.exit(0);
  }

  console.log("\n===============================================================================");
  console.log("  ATTENTION: INTERACTIVE VERIFICATION IN PROGRESS                              ");
  console.log("  A native Windows Hello prompt is about to appear on your primary display.    ");
  console.log("  Touch your fingerprint sensor or enter your Hello PIN to verify identity.    ");
  console.log("===============================================================================\n");

  const start = Date.now();
  const consentResult = await verifyWindowsHelloConsent(
    "ULTRON Founder Authority Verification: Interactive Hardware Test"
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`Prompt completed in ${elapsed}s with result:`, consentResult);

  if (consentResult.success && consentResult.result === "Verified") {
    console.log("\n[PASS] Verified! Physical biometric authentication was confirmed by Windows OS kernel.");
    process.exit(0);
  } else {
    console.log(`\n[FAIL-CLOSED] Verification rejected or cancelled. Reason: ${consentResult.message || consentResult.result}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("[FATAL] Error running Windows Hello test harness:", err);
  process.exit(1);
});
