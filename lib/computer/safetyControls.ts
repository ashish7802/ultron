/**
 * @file lib/computer/safetyControls.ts
 * @description Module 10: Computer Safety Controls, Boundaries & Independent Emergency Stop.
 *
 * Subsystem:
 * Computer Intelligence - Safety Governance & Failsafe Execution.
 *
 * Key Responsibilities:
 * - Manages the independent Emergency Stop mechanism enforced via an atomic lockfile.
 * - Triggers immediate cancellation of active child processes and releases hardware inputs.
 * - Validates operation safety against protected Windows system processes and directories.
 * - Maintains append-only audit logging of all computer actions.
 * - Enforces fail-closed security invariants.
 *
 * Architectural Role & Interactions:
 * - Master guard before any mutating interaction is executed in `workflowOrchestrator.ts`.
 * - Directly accesses `ultron_engine.computer.safety_controller`.
 *
 * Safety / Security Guarantees:
 * - Independent Emergency Stop can be triggered from backend or frontend.
 * - Protected processes cannot be terminated.
 * - Rejects all operations when Emergency Stop is engaged.
 */

import fs from "fs";
import path from "path";
import { defaultPythonBridge } from "./pythonBridge.ts";
import {
  isSystemLockedDown,
  triggerEmergencyStop as triggerEmergencyLockdown,
  unlockFromEmergencyStop,
} from "../security/emergencyEngine.ts";
import { getEffectiveRecoveryKey } from "../security/recoveryKey.ts";
import { defaultAppPathService } from "../security/appPathService.ts";
import type {
  EmergencyStopState,
  SafetyValidationResult,
} from "./types.ts";

export class ComputerSafetyControls {
  private getLockfilePath(): string {
    return path.join(defaultAppPathService.getUserDataDir(), "ULTRON_EMERGENCY_STOP.lock");
  }

  /**
   * Checks whether Emergency Stop is currently active.
   *
   * Security Invariant:
   * Fails closed: If local lockfile is present, emergencyEngine is locked, or
   * Python safety bridge is unavailable/unresponsive, returns true (LOCKED).
   *
   * @returns Boolean indicating active Emergency Stop.
   */
  public async isEmergencyStopActive(): Promise<boolean> {
    const lockfilePath = this.getLockfilePath();
    try {
      if (fs.existsSync(lockfilePath)) {
        return true;
      }
    } catch {}

    if (isSystemLockedDown()) {
      return true;
    }

    try {
      const res = await defaultPythonBridge.execute<{ emergencyStopActive: boolean }>("emergency_stop_status");
      if (!res.success) {
        console.warn("[SAFETY CONTROLS] Python safety bridge unavailable; failing closed (treating as locked).");
        return true;
      }
      return Boolean(res.emergencyStopActive);
    } catch {
      console.warn("[SAFETY CONTROLS] Python bridge error in isEmergencyStopActive; failing closed.");
      return true;
    }
  }

  /**
   * Triggers the independent Emergency Stop kill-switch.
   *
   * Halts active tasks, releases held mouse/keys, kills background processes.
   *
   * @param reason - Reason for activation.
   * @returns EmergencyStopState.
   */
  public async triggerEmergencyStop(reason: string = "User triggered Emergency Stop"): Promise<EmergencyStopState> {
    triggerEmergencyLockdown({ actor: "safety_controls", reason, revokeAllSessions: true });

    const lockfilePath = this.getLockfilePath();
    try {
      fs.writeFileSync(lockfilePath, JSON.stringify({ triggeredAt: Date.now(), reason }), "utf-8");
    } catch (err) {
      console.warn("[SAFETY CONTROLS] Could not write emergency lockfile:", err);
    }

    const res = await defaultPythonBridge.execute<EmergencyStopState>("trigger_emergency_stop", { reason });
    return {
      emergencyStopActive: true,
      message: (res.message as string) || "Emergency Stop triggered successfully.",
      jobsKilled: res.jobsKilled as number | undefined,
    };
  }

  /**
   * Clears the Emergency Stop lockfile and re-enables automation.
   *
   * Coordinates lockdown release across:
   * 1. Emergency lockdown engine (unlocks Node.js memory state and audit vault).
   * 2. Atomic disk lockfile (`ULTRON_EMERGENCY_STOP.lock`).
   * 3. Python background process safety bridge.
   *
   * @param reason - Reason for reset.
   * @param recoveryKey - Optional founder recovery key. Defaults to current effective recovery key.
   * @returns EmergencyStopState.
   */
  public async resetEmergencyStop(
    reason: string = "Authorized founder reset",
    recoveryKey?: string
  ): Promise<EmergencyStopState> {
    const key = recoveryKey || getEffectiveRecoveryKey();
    if (key && isSystemLockedDown()) {
      unlockFromEmergencyStop({
        actor: "safety_controls",
        reason,
        recoveryKey: key,
      });
    }

    const lockfilePath = this.getLockfilePath();
    try {
      if (fs.existsSync(lockfilePath)) {
        fs.unlinkSync(lockfilePath);
      }
    } catch (err) {
      console.warn("[SAFETY CONTROLS] Could not remove emergency lockfile:", err);
    }

    const res = await defaultPythonBridge.execute<EmergencyStopState>("reset_emergency_stop", { reason });
    return {
      emergencyStopActive: false,
      message: (res.message as string) || "Emergency Stop reset successfully.",
    };
  }

  /**
   * Validates safety boundaries for an intended action.
   *
   * @param action - Action name ('launch', 'terminate', 'click', 'write_file', 'shell').
   * @param target - Target resource.
   * @param params - Optional parameters.
   * @returns SafetyValidationResult.
   */
  public async validateSafety(
    action: string,
    target: unknown,
    params?: Record<string, unknown>
  ): Promise<SafetyValidationResult> {
    const res = await defaultPythonBridge.execute<SafetyValidationResult>("validate_safety", {
      action,
      target,
      params,
    });
    return {
      allowed: Boolean(res.allowed),
      riskLevel: (res.riskLevel as SafetyValidationResult["riskLevel"]) || "low",
      blocked: Boolean(res.blocked),
      reason: (res.reason as string) || "OK",
      requiresApproval: Boolean(res.requiresApproval),
    };
  }
}

export const defaultSafetyControls = new ComputerSafetyControls();
