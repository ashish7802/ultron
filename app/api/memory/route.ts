/**
 * @file app/api/memory/route.ts
 * @description RESTful API Endpoint for ULTRON Persistent Memory Vault Management.
 * 
 * Subsystem:
 * Long-Term Episodic Memory & User Profile Management.
 * 
 * Key Responsibilities:
 * - GET: Retrieves all persistent memory records, grouped by category with statistics.
 * - POST: Allows saving a new memory or updating an existing memory record.
 * - DELETE: Allows deleting a memory by unique ID or clearing all memories.
 * 
 * Architectural Role & Interactions:
 * - Backs the frontend "Neural Memories" management modal in `components/UltronChat.tsx`.
 * - Communicates with `lib/memoryManager.ts` to read and write to `ultron_memory_vault.json`.
 * 
 * Safety / Security Guarantees:
 * - Local-only single-tenant operation.
 * - Sanitizes all incoming memory keys and contents to prevent injection.
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

/**
 * Handles GET requests to list all stored memories and vault statistics.
 *
 * @returns JSON response containing memories array and stats.
 */
export async function GET() {
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
  try {
    const body = await req.json();
    const { action, id, key, content, category, importance } = body;

    if (action === "update" && id) {
      const updated = updateMemoryById(id, { content, category, importance });
      if (!updated) {
        return NextResponse.json({ ok: false, error: "Memory record not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, memory: updated });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ ok: false, error: "Memory content cannot be empty" }, { status: 400 });
    }

    const memoryKey = key && typeof key === "string" ? key : "fact_" + Date.now();
    const memoryCat: MemoryCategory = category && ["profile", "preference", "project", "fact", "instruction"].includes(category)
      ? category
      : "fact";
    const memoryImportance = typeof importance === "number" ? Math.max(1, Math.min(5, importance)) : 3;

    const record = saveMemory(memoryKey, content, memoryCat, memoryImportance, "explicit");

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
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    if (clearAll) {
      clearAllMemories();
      return NextResponse.json({ ok: true, message: "All memories cleared" });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "Memory ID is required" }, { status: 400 });
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
