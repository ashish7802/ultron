/**
 * @file app/api/research/project/[id]/route.ts
 * @description API Endpoint for inspecting complete research projects and dossiers.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Relational Project Dossier Endpoint.
 *
 * Key Responsibilities:
 * - Retrieves full composite dossier (Project, Queries, Sources, Evidence, Claims, Links) by project UUID.
 * - Guarantees relational referential integrity across the 6 research entities.
 *
 * Architectural Role & Interactions:
 * - Consumed by frontend research viewers, inspector cards, and downstream verification modules.
 *
 * Safety / Security Guarantees:
 * - Read-only query: Returns sanitized JSON without modifying database state.
 */

import { NextRequest, NextResponse } from "next/server";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing or invalid project id" }, { status: 400 });
    }

    const dossier = await researchRepository.getFullProjectDossier(id);
    if (!dossier) {
      return NextResponse.json({ error: `Research project with id ${id} not found` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      dossier,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH PROJECT GET ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal retrieval failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
