/**
 * @file app/api/memory/confirm/route.ts
 * @description RESTful API Endpoint for Reviewing & Resolving Pending Memory Contradiction Confirmations.
 *
 * Subsystem:
 * Persistent Cognitive Memory Infrastructure (Phase P5.3 Founder Confirmation Gate).
 *
 * Key Responsibilities:
 * - GET: Retrieves pending memory confirmation requests for review in UI or CLI.
 * - POST: Resolves a pending confirmation request via 'approve' (supersede), 'reject', or 'defer'.
 *
 * Architectural Role & Interactions:
 * - Bridges the frontend UltronChat / Neural Vault UI with `MemoryReconciler` and `SqliteMemoryAdapter`.
 * - Executes atomic supersession upon founder approval, updating lineage in `ultron_memory_revisions`.
 * - Protected by `validateDesktopSession` to reject unauthorized cross-origin or remote callers.
 *
 * Safety / Security Guarantees:
 * - Session token and loopback origin validation required on all requests (fail-closed).
 * - Maximum payload size limitation (32 KB).
 * - Validates confirmation existence and enforces idempotent status transitions.
 * - Emits tamper-evident cryptographic audit logs for every resolution action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDefaultMemoryAdapter } from "@/lib/memory/sqliteAdapter";
import { MemoryReconciler } from "@/lib/memory/reconciler";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";

const MAX_PAYLOAD_BYTES = 32 * 1024; // 32 KB limit

/**
 * Handles GET requests to list confirmation requests.
 * Query Parameters:
 * - `projectId`: Optional UUID string to filter confirmations by workspace.
 * - `status`: Optional filter ('pending', 'approved', 'rejected', 'deferred'). Defaults to 'pending'.
 *
 * @param req - Incoming NextRequest.
 * @returns JSON array of ConfirmationRecord items.
 */
export async function GET(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const status = url.searchParams.get("status") || "pending";

    const adapter = getDefaultMemoryAdapter();
    const confirmations = adapter.listConfirmations(projectId, status);

    return NextResponse.json({
      ok: true,
      confirmations,
      count: confirmations.length,
    });
  } catch (error) {
    console.error("[API MEMORY CONFIRM GET] Error listing confirmations:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list memory confirmations" },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to approve, reject, or defer a pending confirmation.
 * Request Body:
 * - `confirmationId`: UUID of the pending confirmation record.
 * - `action`: 'approve' | 'reject' | 'defer'
 * - `resolvedBy`: Optional actor label (defaults to 'founder').
 *
 * @param req - Incoming NextRequest with JSON payload.
 * @returns JSON response with updated confirmation record.
 */
export async function POST(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload exceeds 32 KB limit" }, { status: 413 });
    }

    const body = await req.json();
    const { confirmationId, action, resolvedBy } = body;

    if (!confirmationId || typeof confirmationId !== "string") {
      return NextResponse.json({ ok: false, error: "Missing or invalid confirmationId" }, { status: 400 });
    }

    if (!["approve", "reject", "defer"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid action. Allowed: 'approve', 'reject', 'defer'" },
        { status: 400 }
      );
    }

    const adapter = getDefaultMemoryAdapter();
    const reconciler = new MemoryReconciler(adapter);

    const updated = await reconciler.resolveConfirmation(
      confirmationId,
      action as "approve" | "reject" | "defer",
      resolvedBy || "founder"
    );

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Confirmation not found or not in pending status" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      confirmation: updated,
    });
  } catch (error) {
    console.error("[API MEMORY CONFIRM POST] Error resolving confirmation:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to resolve memory confirmation" },
      { status: 500 }
    );
  }
}
