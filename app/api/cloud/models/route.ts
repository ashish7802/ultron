/**
 * ================================================================================
 * ULTRON Cloud AI Brain & Model Management API Route
 * Module Name: app/api/cloud/models/route.ts
 * Subsystem: Cloud AI Brain Infrastructure
 * ================================================================================
 *
 * Architectural Role & Purpose:
 *   Acts as the central gateway for ULTRON's cloud brain model management.
 *   Provides Next.js frontend and desktop clients direct access to:
 *   1. User's 5TB Google Drive storage allocation, active model status, and cloud health.
 *   2. Instant model hot-swapping across multiple LLM weights without rebuilding the client.
 *   3. Real-time cost telemetry and multi-cloud GPU provider projections (RunPod, Modal, Vast.ai).
 *
 * Key Responsibilities:
 *   - GET: Fetches active model specifications, available Google Drive models, and 5TB quota.
 *   - POST (action="switch"): Hot-swaps the active remote LLM model.
 *   - POST (action="costs"): Computes transparent cloud GPU pricing estimates.
 *   - Direct laptop access: No biometric gates or passkey prompts required.
 *
 * Safety & Security Guarantees:
 *   - Transparent cost protection: Displays cost estimates to prevent unwanted charges.
 *   - Zero local model files stored: All weights stay in Google Drive & remote cloud VRAM.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

// Paths to Python environment and cloud bridge CLI
const PYTHON_EXE = "C:\\Users\\kelvy\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";
const CLOUD_CLI_SCRIPT = path.join(process.cwd(), "ultron_engine", "cloud", "cloud_brain_cli.py");

/**
 * Spawns the Python Cloud Brain CLI bridge to execute commands and return JSON.
 *
 * @param args - Command line arguments passed to cloud_brain_cli.py.
 * @returns Parsed JSON telemetry from the Python cloud orchestrator.
 */
async function runCloudCli(args: string[]): Promise<any> {
  const { stdout } = await execFileAsync(PYTHON_EXE, [CLOUD_CLI_SCRIPT, ...args], {
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf-8",
  });

  // Extract JSON output from potentially formatted logs
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines[i].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return JSON.parse(candidate);
    }
  }

  return JSON.parse(stdout.trim());
}

/**
 * Handles GET requests: retrieves cloud status, active model, and 5TB drive quota.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const status = await runCloudCli(["status"]);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error("[CLOUD BRAIN API ERROR - GET]", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve cloud brain status",
        details: error.message || String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests: executes model hot-swapping or cost estimations.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";

    if (action === "switch") {
      const modelId = body.model_id;
      if (!modelId) {
        return NextResponse.json({ error: "Missing required 'model_id' parameter" }, { status: 400 });
      }
      const switchResult = await runCloudCli(["switch", modelId]);
      return NextResponse.json(switchResult);
    }

    if (action === "costs") {
      const hours = body.hours ? String(body.hours) : "1.0";
      const costs = await runCloudCli(["costs", "--hours", hours]);
      return NextResponse.json(costs);
    }

    // Default: return status
    const status = await runCloudCli(["status"]);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error("[CLOUD BRAIN API ERROR - POST]", error);
    return NextResponse.json(
      {
        error: "Failed to process cloud brain request",
        details: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
