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

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  EmergencyStopState,
  SafetyValidationResult,
} from "./types.ts";

export class ComputerSafetyControls {
  /**
   * Checks whether Emergency Stop is currently active.
   *
   * @returns Boolean indicating active Emergency Stop.
   */
  public async isEmergencyStopActive(): Promise<boolean> {
    const res = await defaultPythonBridge.execute<{ emergencyStopActive: boolean }>("emergency_stop_status");
    return Boolean(res.emergencyStopActive);
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
    const res = await defaultPythonBridge.execute<EmergencyStopState>("trigger_emergency_stop", { reason });
    return {
      emergencyStopActive: true,
      message: res.message as string | undefined,
      jobsKilled: res.jobsKilled as number | undefined,
    };
  }

  /**
   * Clears the Emergency Stop lockfile and re-enables automation.
   *
   * @param reason - Reason for reset.
   * @returns EmergencyStopState.
   */
  public async resetEmergencyStop(reason: string = "Authorized founder reset"): Promise<EmergencyStopState> {
    const res = await defaultPythonBridge.execute<EmergencyStopState>("reset_emergency_stop", { reason });
    return {
      emergencyStopActive: false,
      message: res.message as string | undefined,
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
