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

export async function GET(req: NextRequest) {
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
      const { taskId, approvalToken } = payload;
      const workflow = defaultComputerWorkflowOrchestrator.approveTask(taskId, approvalToken);
      return NextResponse.json({ success: true, workflow });
    }

    if (action === "execute_task") {
      const { taskId } = payload;
      const workflow = await defaultComputerWorkflowOrchestrator.executeAndVerifyTask(taskId);
      return NextResponse.json({ success: workflow.success, workflow });
    }

    // Read-only queries
    if (action === "read_file") {
      const result = await defaultFileSystemIntelligence.readFile(payload?.path);
      return NextResponse.json(result);
    }

    if (action === "search_files") {
      const matches = await defaultFileSystemIntelligence.searchFiles(payload?.query, payload?.root);
      return NextResponse.json({ success: true, matches });
    }

    if (action === "exec_command") {
      const result = await defaultTerminalIntelligence.executeCommand(payload?.command, payload?.shell);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: `Unsupported POST action '${action}'.` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
