/**
 * @file app/api/memory/route.ts
 * @description Hardened RESTful API Endpoint for ULTRON Persistent Memory Vault Management.
 * 
 * Subsystem:
 * Long-Term Episodic Memory & User Profile Management.
 * 
 * Key Responsibilities:
 * - GET: Retrieves all persistent memory records, grouped by category with statistics.
 * - POST: Allows saving a new memory or updating an existing memory record with schema validation.
 * - DELETE: Allows deleting a memory by unique ID or clearing all memories with cryptographic confirmation token.
 * 
 * Architectural Role & Interactions:
 * - Backs the frontend "Neural Memories" management modal in `components/UltronChat.tsx`.
 * - Communicates with `lib/memoryManager.ts` to read and write to `ultron_memory_vault.json`.
 * - Protected by `lib/sessionGate.ts` to reject unauthorized cross-origin calls and CSRF.
 * 
 * Safety / Security Guarantees:
 * - Session token & loopback origin validation on all methods (fail-closed).
 * - Maximum payload size limitation (64 KB) to prevent memory-exhaustion denial-of-service.
 * - Cryptographic single-use action token required for bulk memory deletion (`clear_all`).
 * - Strict schema validation on keys, categories, content length, and numeric bounds.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAllMemories,
  saveMemory,
  deleteMemory,
  clearAllMemories,
  updateMemoryById,
  getMemoryStats,
  MemoryCategory,
} from "@/lib/memoryManager";
import {
  validateDesktopSession,
  createAuthErrorResponse,
  consumeSingleUseActionToken,
} from "@/lib/sessionGate";

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit
const VALID_CATEGORIES: Set<string> = new Set(["profile", "preference", "project", "fact", "instruction"]);

/**
 * Handles GET requests to list all stored memories and vault statistics.
 *
 * @param req - Incoming NextRequest.
 * @returns JSON response containing memories array and stats.
 */
export async function GET(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const memories = loadAllMemories();
    const stats = getMemoryStats();

    return NextResponse.json({
      ok: true,
      memories,
      stats,
    });
  } catch (err) {
    console.error("[API MEMORY GET] Error fetching memories:", err);
    return NextResponse.json({ ok: false, error: "Failed to load memory vault" }, { status: 500 });
  }
}

/**
 * Handles POST requests to create or update memory records.
 *
 * @param req - NextRequest containing JSON payload.
 * @returns JSON response with the saved memory record.
 */
export async function POST(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Payload exceeds maximum allowed size of 64KB" },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON format" }, { status: 400 });
    }

    const { action, id, key, content, category, importance } = body;

    // Handle memory update
    if (action === "update" && id) {
      if (typeof id !== "string" || !/^mem_[a-zA-Z0-9_-]+$/.test(id)) {
        return NextResponse.json({ ok: false, error: "Invalid memory ID format" }, { status: 400 });
      }

      const updateData: { content?: string; category?: MemoryCategory; importance?: number } = {};
      if (typeof content === "string" && content.trim().length > 0) {
        if (content.length > 5000) {
          return NextResponse.json({ ok: false, error: "Memory content exceeds maximum length (5000 chars)" }, { status: 400 });
        }
        updateData.content = content.trim();
      }
      if (typeof category === "string" && VALID_CATEGORIES.has(category)) {
        updateData.category = category as MemoryCategory;
      }
      if (typeof importance === "number") {
        updateData.importance = Math.max(1, Math.min(5, Math.round(importance)));
      }

      const updated = updateMemoryById(id, updateData);
      if (!updated) {
        return NextResponse.json({ ok: false, error: "Memory record not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, memory: updated });
    }

    // Handle new memory creation
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ ok: false, error: "Memory content cannot be empty" }, { status: 400 });
    }

    if (content.length > 5000) {
      return NextResponse.json({ ok: false, error: "Memory content exceeds maximum length (5000 chars)" }, { status: 400 });
    }

    const memoryKey = typeof key === "string" && key.trim().length > 0 && key.length <= 100
      ? key.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "fact_" + Date.now();

    const memoryCat: MemoryCategory = typeof category === "string" && VALID_CATEGORIES.has(category)
      ? (category as MemoryCategory)
      : "fact";

    const memoryImportance = typeof importance === "number"
      ? Math.max(1, Math.min(5, Math.round(importance)))
      : 3;

    const record = saveMemory(memoryKey, content.trim(), memoryCat, memoryImportance, "explicit");

    return NextResponse.json({ ok: true, memory: record });
  } catch (err) {
    console.error("[API MEMORY POST] Error saving memory:", err);
    return NextResponse.json({ ok: false, error: "Failed to persist memory record" }, { status: 500 });
  }
}

/**
 * Handles DELETE requests to remove a single memory or clear the entire vault.
 *
 * @param req - NextRequest containing query params or JSON body.
 * @returns JSON response with deletion status.
 */
export async function DELETE(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    // Destructive bulk wipe: requires confirmation token and confirmation parameter
    if (clearAll) {
      const confirmationToken =
        searchParams.get("actionToken") ||
        req.headers.get("x-ultron-action-token");
      const confirmPhrase = searchParams.get("confirm");

      if (confirmPhrase !== "CONFIRM_CLEAR_VAULT") {
        return NextResponse.json(
          {
            ok: false,
            error: "Destructive action blocked: Parameter confirm=CONFIRM_CLEAR_VAULT is required to clear vault.",
          },
          { status: 400 }
        );
      }

      if (!confirmationToken || !consumeSingleUseActionToken(confirmationToken, "CONFIRM_CLEAR_VAULT")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Action Authorization Required: A valid single-use action token is required to clear all memories.",
          },
          { status: 403 }
        );
      }

      clearAllMemories();
      return NextResponse.json({ ok: true, message: "All memories cleared securely" });
    }

    if (!id || typeof id !== "string" || !/^mem_[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ ok: false, error: "Valid Memory ID is required" }, { status: 400 });
    }

    const deleted = deleteMemory(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Memory ID not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: `Memory ${id} deleted` });
  } catch (err) {
    console.error("[API MEMORY DELETE] Error deleting memory:", err);
    return NextResponse.json({ ok: false, error: "Failed to delete memory record" }, { status: 500 });
  }
}
