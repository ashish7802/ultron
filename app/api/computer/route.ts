/**
 * @file app/api/computer/route.ts
 * @description API Endpoint for ULTRON Computer Intelligence System (Modules 01 - 11).
 *
 * Subsystem:
 * Computer Intelligence Web API.
 *
 * Key Responsibilities:
 * - Exposes REST endpoints for desktop understanding, application discovery,
 *   file operations, terminal queries, development status, and Emergency Stop.
 * - Enforces fail-closed validation and returns structured JSON responses.
 *
 * Safety / Security Guarantees:
 * - Mutating actions must pass through the Permission Gateway.
 * - Emergency Stop status is always returned and checked.
 */

import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import { validateSessionToken } from "@/lib/security/identityEngine";
import { verifyExecutionGrant } from "@/lib/security/permissionEngine";
import {
  defaultDesktopEngine,
  defaultApplicationIntelligence,
  defaultFileSystemIntelligence,
  defaultTerminalIntelligence,
  defaultBrowserIntelligence,
  defaultDevEnvironmentIntelligence,
  defaultSafetyControls,
  defaultComputerWorkflowOrchestrator,
} from "@/lib/computer/index.ts";

/**
 * Validates request origin and extracts session token.
 */
function extractAuthSession(req: NextRequest) {
  const token =
    req.headers.get("x-ultron-session-token") ||
    req.cookies.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return { token: token || "", validation: validateSessionToken(token) };
}

/**
 * Validates path safety to prevent directory traversal and access to sensitive files.
 */
function isPathSafe(targetPath: string | undefined): boolean {
  if (!targetPath || typeof targetPath !== "string") return false;
  const resolved = path.resolve(targetPath);
  const forbiddenPatterns = [
    /windows[\\/]system32[\\/]config/i,
    /[\\/]\.vault_key$/i,
    /[\\/]\.security_vault/i,
    /[\\/]\.env(\..+)?$/i,
    /[\\/]\.ssh[\\/]/i,
  ];
  return !forbiddenPatterns.some((pattern) => pattern.test(resolved));
}

export async function GET(req: NextRequest) {
  const { validation } = extractAuthSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to access Computer Intelligence." },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "status";

  try {
    const isEmergencyStopped = await defaultSafetyControls.isEmergencyStopActive();

    if (action === "status") {
      const os = await defaultDesktopEngine.getOSMetadata();
      const activeWin = await defaultDesktopEngine.getActiveWindow();
      return NextResponse.json({
        success: true,
        emergencyStopActive: isEmergencyStopped,
        os,
        activeWindow: activeWin,
      });
    }

    if (action === "apps") {
      const apps = await defaultApplicationIntelligence.discoverApps();
      return NextResponse.json({ success: true, count: apps.length, apps });
    }

    if (action === "windows") {
      const windows = await defaultDesktopEngine.getWindows();
      return NextResponse.json({ success: true, count: windows.length, windows });
    }

    if (action === "monitors") {
      const monitors = await defaultDesktopEngine.getMonitors();
      return NextResponse.json({ success: true, monitors });
    }

    if (action === "git") {
      const git = await defaultDevEnvironmentIntelligence.getGitStatus();
      return NextResponse.json({ success: true, git });
    }

    return NextResponse.json({ success: false, error: `Unknown query action '${action}'` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { validation } = extractAuthSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to operate Computer Intelligence." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { action, payload } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: "Missing required 'action' field." }, { status: 400 });
    }

    // Emergency Stop Actions
    if (action === "emergency_stop") {
      const reason = payload?.reason || "User emergency stop via API";
      const result = await defaultSafetyControls.triggerEmergencyStop(reason);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "reset_emergency_stop") {
      // Require founder authorization and recovery key to reset emergency stop
      if (validation.session.userRole !== "founder") {
        return NextResponse.json(
          { success: false, error: "Forbidden: Only Founder can reset Emergency Stop." },
          { status: 403 }
        );
      }

      const recoveryKey = payload?.recoveryKey;
      const expectedRecoveryKey = process.env.ULTRON_RECOVERY_KEY || "TEST_RECOVERY_KEY_ULTRON_FOUNDER";
      if (!recoveryKey || recoveryKey !== expectedRecoveryKey) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Valid recovery key required to reset Emergency Stop." },
          { status: 403 }
        );
      }

      const reason = payload?.reason || "Authorized reset via API";
      const result = await defaultSafetyControls.resetEmergencyStop(reason);
      return NextResponse.json({ success: true, ...result });
    }

    // Check Emergency Stop before executing any computer operation
    if (await defaultSafetyControls.isEmergencyStopActive()) {
      return NextResponse.json(
        {
          success: false,
          error: "Operation blocked: Independent Emergency Stop is currently active.",
          emergencyStop: true,
        },
        { status: 403 }
      );
    }

    // Task Workflow Execution (Module 11)
    if (action === "plan_task") {
      const workflow = await defaultComputerWorkflowOrchestrator.planTask(payload);
      return NextResponse.json({ success: true, workflow });
    }

    if (action === "approve_task") {
      if (validation.session.userRole !== "founder" && validation.session.userRole !== "admin") {
        return NextResponse.json(
          { success: false, error: "Forbidden: Only Founder or Admin can approve computer tasks." },
          { status: 403 }
        );
      }
      const { taskId, approvalToken } = payload || {};
      if (!taskId || !approvalToken) {
        return NextResponse.json(
          { success: false, error: "Missing taskId or approvalToken for task approval." },
          { status: 400 }
        );
      }
      const workflow = defaultComputerWorkflowOrchestrator.approveTask(taskId, approvalToken);
      return NextResponse.json({ success: true, workflow });
    }

    if (action === "execute_task") {
      const { taskId } = payload || {};
      if (!taskId) {
        return NextResponse.json({ success: false, error: "Missing taskId for execution." }, { status: 400 });
      }
      const workflow = await defaultComputerWorkflowOrchestrator.executeAndVerifyTask(taskId);
      return NextResponse.json({ success: workflow.success, workflow });
    }

    // Read-only queries with path traversal protection
    if (action === "read_file") {
      const targetPath = payload?.path;
      if (!targetPath || !isPathSafe(targetPath)) {
        return NextResponse.json(
          { success: false, error: "Access Denied: Unsafe or prohibited file path." },
          { status: 403 }
        );
      }
      const result = await defaultFileSystemIntelligence.readFile(targetPath);
      return NextResponse.json(result);
    }

    if (action === "search_files") {
      const rootPath = payload?.root;
      if (rootPath && !isPathSafe(rootPath)) {
        return NextResponse.json(
          { success: false, error: "Access Denied: Unsafe or prohibited search root." },
          { status: 403 }
        );
      }
      const matches = await defaultFileSystemIntelligence.searchFiles(payload?.query, rootPath);
      return NextResponse.json({ success: true, matches });
    }

    if (action === "exec_command") {
      const command = payload?.command;
      if (!command || typeof command !== "string") {
        return NextResponse.json({ success: false, error: "Missing or invalid command string." }, { status: 400 });
      }

      // Analyze command risk through central terminal intelligence
      const risk = await defaultTerminalIntelligence.analyzeRisk(command);
      if (risk.isBlocked) {
        return NextResponse.json(
          {
            success: false,
            error: `Security Policy Violation: Command execution blocked. ${risk.reason}`,
            risk,
          },
          { status: 403 }
        );
      }

      // If high or critical risk or requiring approval, enforce valid execution grant token
      if (risk.riskLevel === "critical" || risk.riskLevel === "high" || risk.requiresApproval) {
        const grantToken = payload?.executionGrantToken || payload?.grantToken;
        const approvalRequestId = payload?._approvalRequestId || payload?.approvalRequestId;
        if (!grantToken || !approvalRequestId) {
          return NextResponse.json(
            {
              success: false,
              requiresApproval: true,
              error: `Command '${command}' requires explicit Founder approval. Present valid execution grant token.`,
              risk,
            },
            { status: 403 }
          );
        }

        const grantCheck = verifyExecutionGrant(approvalRequestId, grantToken, { command }, "terminal");
        if (!grantCheck.authorized) {
          return NextResponse.json(
            {
              success: false,
              error: `Execution Grant Denied: ${grantCheck.reason}`,
              risk,
            },
            { status: 403 }
          );
        }
      }

      const result = await defaultTerminalIntelligence.executeCommand(command, payload?.shell);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: `Unsupported POST action '${action}'.` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
