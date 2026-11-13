/**
 * @file scripts/founder_recovery.mjs
 * @description Authenticated Founder Emergency Recovery & Lockdown Management Utility.
 *
 * Subsystem:
 * Centralized Security, Emergency & System Defense Subsystem (Module 9).
 *
 * Key Responsibilities:
 * - Provides an authenticated, non-destructive CLI interface for the human founder to inspect
 *   and safely unlock ULTRON from active Emergency Stop / Security Lockdown.
 * - Enforces PBKDF2 cryptographic key validation via `unlockFromEmergencyStop()`.
 * - Strictly preserves all persistent vault artifacts (`lockdown.json`, `audit_chain.json`, `approvals.json`)
 *   without manual file deletion, ensuring the audit trail remains tamper-evident and unbroken.
 *
 * Architectural Role & Interactions:
 * - Interfaces directly with `lib/security/emergencyEngine.ts`.
 * - Interacts with `.security_vault/lockdown.json` via concurrency-locked vault primitives.
 *
 * Safety / Security Guarantees:
 * - Zero raw vault deletion: Never unlinks or wipes security files.
 * - Timing attack resistant: Relies on `crypto.timingSafeEqual` in `emergencyEngine.ts`.
 * - Audit logging: Records both successful unlock and unauthorized unlock attempts in the audit chain.
 *
 * Usage:
 *   node --experimental-strip-types scripts/founder_recovery.mjs --status
 *   node --experimental-strip-types scripts/founder_recovery.mjs --recovery-key "YOUR_RECOVERY_KEY" --reason "Routine recovery"
 */

import { isSystemLockedDown, getLockdownStatus, unlockFromEmergencyStop } from "../lib/security/emergencyEngine.ts";

/**
 * Parses simple command line flags.
 *
 * @param {string[]} args - Process arguments.
 * @returns {Record<string, string | boolean>} Key-value argument map.
 */
function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--status") {
      flags.status = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--recovery-key" && i + 1 < args.length) {
      flags.recoveryKey = args[++i];
    } else if (arg === "--reason" && i + 1 < args.length) {
      flags.reason = args[++i];
    }
  }
  return flags;
}

/**
 * Main execution function for founder recovery CLI.
 */
async function main() {
  const flags = parseArgs(process.argv.slice(2));

  console.log("===============================================================================");
  console.log("       ULTRON FOUNDER EMERGENCY RECOVERY & LOCKDOWN UTILITY                    ");
  console.log("===============================================================================");

  if (flags.help) {
    console.log(`
Usage:
  node --experimental-strip-types scripts/founder_recovery.mjs [options]

Options:
  --status                     Inspect current lockdown state without making modifications.
  --recovery-key <KEY>         Provide the founder emergency recovery key to unlock the system.
  --reason <TEXT>              Audit explanation for the recovery action (default: "Founder CLI recovery").
  --help, -h                   Show this help reference.

Safety Notice:
  Manual deletion of .security_vault/lockdown.json or approvals.json is strictly prohibited.
  This tool executes authenticated cryptographic recovery while preserving all audit records.
`);
    process.exit(0);
  }

  const status = getLockdownStatus();

  if (flags.status || (!flags.recoveryKey && !flags.help)) {
    console.log(`Current Status: ${status.isLockedDown ? "[LOCKED DOWN]" : "[NORMAL OPERATIONAL]"}`);
    if (status.isLockedDown) {
      console.log(`Locked At:                     ${new Date(status.lockedAt || 0).toISOString()}`);
      console.log(`Locked By Actor:               ${status.lockedByActor}`);
      console.log(`Trigger Reason:                ${status.triggerReason}`);
      console.log(`Sessions Revoked:              ${status.sessionsRevokedCount}`);
      console.log(`In-Flight Grants Terminated:   ${status.activeExecutionsTerminated}`);
      console.log(`Recovery Verification Needed:  ${status.recoveryVerificationRequired}`);
      console.log("");
      console.log("To unlock the system, run:");
      console.log('  node --experimental-strip-types scripts/founder_recovery.mjs --recovery-key "<KEY>" --reason "Reason"');
    } else {
      console.log("All systems are operational. Emergency stop is currently inactive.");
    }

    if (!flags.recoveryKey) {
      process.exit(0);
    }
  }

  if (flags.recoveryKey) {
    const reason = typeof flags.reason === "string" ? flags.reason : "Founder CLI authenticated recovery";
    console.log(`Attempting authenticated unlock with reason: "${reason}"...`);

    const result = unlockFromEmergencyStop({
      actor: "founder_cli_admin",
      recoveryKey: String(flags.recoveryKey),
      reason,
    });

    if (result.success) {
      console.log("");
      console.log("[SUCCESS] Emergency Lockdown has been lifted successfully.");
      console.log("[AUDIT] Recovery event has been written to the chained tamper-evident audit ledger.");
      console.log("All systems have returned to standard founder-controlled operational state.");
      process.exit(0);
    } else {
      console.error("");
      console.error(`[FAILED] Unlock rejected: ${result.error || "Authentication failed."}`);
      console.error("[SECURITY] Unauthorized attempt recorded in audit log. System remains LOCKED.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("[FATAL ERROR] Unexpected exception in founder recovery utility:", err);
  process.exit(1);
});
