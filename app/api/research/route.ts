/**
 * @file app/api/research/route.ts
 * @description Autonomous Quantum-Speed Web Research & Browser Scraping Route.
 *
 * Subsystem:
 * Autonomous Knowledge & Real-Time Web Intelligence Engine.
 *
 * Key Responsibilities:
 * - Resolves the Python interpreter portably (env override -> known install paths -> PATH).
 * - Spawns the native Python Quantum Research Agent (`ultron_engine/quantum_research_agent.py`)
 *   via `execFile` (no shell), with request-abort propagation and a hard timeout.
 * - Enforces the requested `maxSources` bound on the returned dossier.
 * - Streams staged research telemetry via Server-Sent Events (SSE) or returns structured JSON.
 *
 * Safety & Security Guarantees:
 * - Local single-user design: authentication is not required (fingerprint/Zero-Trust gating
 *   removed per user request).
 * - Read-Only Live Web Exploration: SSRF filtering is implemented inside the Python agent
 *   (`quantum_research_agent.py` rejects loopback/private/link-local targets before scraping).
 *   This route adds no URL inputs of its own, so it cannot be used to reach internal hosts.
 * - No shell interpolation: the query is passed as a single argv element to `execFile`.
 * - Research failures are reported with an honest HTTP status (400/502/503/504), not silently
 *   hidden behind a 200 response.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { getCryptoStatus } from "@/lib/crypto";
import { resolvePythonExecutable } from "@/lib/pythonRuntime";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";

export { resolvePythonExecutable };

const execFileAsync = promisify(execFile);

/** Wall-clock budget for a full research run (multi-vector search + scraping + synthesis). */
const RESEARCH_TIMEOUT_MS = 30000;
/** Hard cap on query length; the Python CLI receives it as argv, and huge argv values fail. */
const MAX_QUERY_LENGTH = 2000;
/** Default/limits for the dossier source list. */
const DEFAULT_MAX_SOURCES = 6;
const MAX_MAX_SOURCES = 12;

const RESEARCH_SCRIPT = path.join(process.cwd(), "ultron_engine", "quantum_research_agent.py");

export interface ResearchRequestBody {
  query: string;
  maxSources?: number;
  sessionToken?: string;
  stream?: boolean;
}

/**
 * Clamps an untrusted `maxSources` value into the supported range.
 *
 * @param value - Raw request value (may be missing or of any type).
 * @returns Integer between 1 and MAX_MAX_SOURCES (defaults to DEFAULT_MAX_SOURCES).
 */
function normalizeMaxSources(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_SOURCES;
  return Math.min(MAX_MAX_SOURCES, Math.max(1, Math.floor(parsed)));
}

/**
 * Enforces the requested source bound on a dossier returned by the Python agent.
 *
 * WHY: the agent's CLI only accepts the query today, so the API's documented `maxSources`
 * contract is applied here instead of being silently ignored. When the Python CLI learns a
 * `--max-sources` flag this trimming becomes a defence-in-depth check.
 *
 * @param dossier - Parsed dossier object from the agent.
 * @param maxSources - Validated upper bound.
 * @returns Dossier with a trimmed source list, or the original value when not an object.
 */
function limitDossierSources(dossier: unknown, maxSources: number): unknown {
  if (!dossier || typeof dossier !== "object") return dossier;
  const record = dossier as Record<string, unknown>;
  if (!Array.isArray(record.sources)) return dossier;

  const sources = record.sources.slice(0, maxSources);
  return {
    ...record,
    sources,
    sources_analyzed_count:
      typeof record.sources_analyzed_count === "number"
        ? Math.min(record.sources_analyzed_count, sources.length)
        : sources.length,
  };
}

/**
 * Runs the Python Quantum Research Agent via `execFile`.
 *
 * @param query - Raw user search prompt.
 * @param maxSources - Upper bound on returned sources (default 6).
 * @param signal - Optional abort signal so client disconnects stop the child process.
 * @returns Parsed JSON research dossier.
 * @throws Error from `execFile`/JSON parsing (callers classify it for HTTP responses).
 */
export async function runQuantumResearchAgent(
  query: string,
  maxSources: number = DEFAULT_MAX_SOURCES,
  signal?: AbortSignal
) {
  const { stdout } = await execFileAsync(
    resolvePythonExecutable(),
    [RESEARCH_SCRIPT, query],
    {
      timeout: RESEARCH_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf-8",
      windowsHide: true,
      signal,
      env: {
        ...process.env,
        // Force UTF-8 so Hinglish/Devanagari queries and scraped text survive the pipe.
        PYTHONIOENCODING: "utf-8",
      },
    }
  );

  const parsed = JSON.parse(stdout.trim());
  return limitDossierSources(parsed, normalizeMaxSources(maxSources)) as Record<string, unknown>;
}

/**
 * Maps a research execution failure to an honest HTTP status and client-safe message.
 *
 * WHY: `err.message` from child_process contains absolute paths, interpreter details and
 * stderr, which should stay in server logs rather than leak through the API.
 *
 * @param err - Error thrown by execFile/JSON.parse.
 * @returns Client-safe error code/message and HTTP status.
 */
function describeResearchFailure(err: unknown): { code: string; message: string; status: number } {
  const error = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string; name?: string };

  if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
    return { code: "RESEARCH_ABORTED", message: "Research request was cancelled by the client.", status: 499 };
  }
  if (error?.code === "ENOENT") {
    return {
      code: "PYTHON_INTERPRETER_NOT_FOUND",
      message:
        "Python 3 interpreter not found. Set ULTRON_PYTHON_PATH to the installed python.exe path.",
      status: 503,
    };
  }
  if (error?.killed || error?.signal === "SIGTERM" || error?.code === "ETIMEDOUT") {
    return {
      code: "RESEARCH_TIMEOUT",
      message: `Web research exceeded the ${Math.round(RESEARCH_TIMEOUT_MS / 1000)}s execution budget.`,
      status: 504,
    };
  }
  return {
    code: "RESEARCH_EXECUTION_FAILED",
    message: "Failed to execute autonomous web research.",
    status: 502,
  };
}

/**
 * Handles incoming Quantum Research requests.
 *
 * @param req - NextRequest containing JSON payload with target inquiry and max sources.
 * @returns NextResponse with structured research dossier or SSE telemetry stream.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: ResearchRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { query, maxSources: requestedMaxSources = DEFAULT_MAX_SOURCES, stream = false } = body || {};
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "A valid, non-empty query string is required" }, { status: 400 });
    }

    const sanitizedQuery = query.trim();
    if (sanitizedQuery.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Query exceeds the ${MAX_QUERY_LENGTH} character limit` },
        { status: 400 }
      );
    }
    const maxSources = normalizeMaxSources(requestedMaxSources);

    // Run the agent BEFORE opening an SSE stream.
    // WHY: HTTP headers (including status) are flushed as soon as the streaming response is
    // created; an execution failure discovered after that can only be sent as an in-band
    // event on a 200 response. Awaiting first lets genuine failures return 502/503/504.
    let dossier: Record<string, unknown>;
    try {
      dossier = await runQuantumResearchAgent(sanitizedQuery, maxSources, req.signal);
    } catch (researchErr) {
      console.error("[RESEARCH ROUTE EXECUTION ERROR]", researchErr);
      const failure = describeResearchFailure(researchErr);
      return NextResponse.json(
        { success: false, error: failure.code, message: failure.message },
        { status: failure.status }
      );
    }

    // SSE Streaming Mode for staged telemetry (the Python agent is batch, so stages replay
    // the real pipeline phases once synthesis has completed).
    if (stream) {
      const encoder = new TextEncoder();
      const stages = [
        {
          stage: "DECOMPOSITION",
          message: "Decomposing inquiry into orthogonal quantum search vectors...",
          progress: 20,
        },
        {
          stage: "WEB_HARVEST",
          message: "Deploying concurrent live web probes across DuckDuckGo and authoritative domains...",
          progress: 50,
        },
        {
          stage: "SYNTHESIS",
          message: "Cross-correlating facts and computing credibility index...",
          progress: 85,
        },
        {
          stage: "COMPLETE",
          message: "Quantum research synthesis finalized.",
          progress: 100,
          dossier,
        },
      ];

      let cancelled = false;
      const sseStream = new ReadableStream({
        start(controller) {
          try {
            for (const event of stages) {
              if (cancelled || req.signal.aborted) break;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            if (!cancelled) controller.close();
          } catch (streamErr) {
            console.warn("[RESEARCH SSE] Stream terminated early:", streamErr);
            try {
              controller.close();
            } catch {
              // Already closed/cancelled by the client; nothing left to do.
            }
          }
        },
        cancel() {
          // Client disconnected (HUD navigation/abort): stop emitting and let the response
          // be garbage-collected instead of enqueueing into a closed controller.
          cancelled = true;
        },
      });

      return new NextResponse(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Ultron-Security": "AES-256-GCM",
        },
      });
    }

    // Synchronous JSON response mode
    return NextResponse.json(
      {
        success: true,
        dossier,
        security: getCryptoStatus(),
      },
      {
        headers: {
          "X-Ultron-Security": "AES-256-GCM",
          "X-Ultron-Research-Status": "VERIFIED_LIVE",
        },
      }
    );
  } catch (err) {
    console.error("[RESEARCH ROUTE EXCEPTION]", err);
    return NextResponse.json(
      {
        success: false,
        error: "RESEARCH_EXECUTION_FAILED",
        message: "Failed to execute autonomous web research",
      },
      { status: 500 }
    );
  }
}
