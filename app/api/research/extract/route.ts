/**
 * @file app/api/research/extract/route.ts
 * @description API Endpoint for Module 03: Evidence Collection & Extraction Engine.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Evidence Extraction Endpoint.
 *
 * Key Responsibilities:
 * - Ingests discovered sources for a project.
 * - Extracts clean text, verbatim supporting passages, structured facts, technical specs, and atomic claims.
 * - Enforces many-to-many relationship mappings between claims and supporting evidence.
 * - Persists evidence, claims, and links in `researchRepository`.
 * - Returns structured extraction summaries and counts.
 *
 * Architectural Role & Interactions:
 * - Upstream: Consumes sources from `app/api/research/discover/route.ts`.
 * - Downstream: Feeds structured evidence to Module 04/05 verification engines and the UI.
 *
 * Safety / Security Guarantees:
 * - Sandbox isolation: Strips potentially malicious tags and scripts from incoming HTML.
 * - Full audit traceability: Rejects claims that cannot be grounded in an exact supporting passage.
 */

import { NextRequest, NextResponse } from "next/server";
import { evidenceCollectionEngine } from "@/lib/research/evidenceEngine";
import { researchRepository } from "@/lib/research/repository";
import type {
  NormalizedDiscoveryResult,
  EvidenceExtractionResult,
  EvidenceRecord,
  ClaimRecord,
  ClaimEvidenceLinkRecord,
} from "@/lib/research/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { projectId: string; sources: NormalizedDiscoveryResult[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.projectId || !Array.isArray(body.sources)) {
      return NextResponse.json(
        { error: "A valid projectId and array of discovered sources are required" },
        { status: 400 }
      );
    }

    const { projectId, sources } = body;
    await researchRepository.updateProjectStatus(projectId, "extracting");

    const extractionResults: EvidenceExtractionResult[] = [];
    for (const source of sources) {
      const result = await evidenceCollectionEngine.processSource(source);
      extractionResults.push(result);
    }

    // Persist extracted evidence passages, claims, and links
    const allEvidence: EvidenceRecord[] = [];
    const allClaims: ClaimRecord[] = [];
    const allLinks: ClaimEvidenceLinkRecord[] = [];

    for (const res of extractionResults) {
      for (const p of res.passages) {
        allEvidence.push({
          id: p.id,
          project_id: projectId,
          source_id: res.sourceId,
          exact_passage: p.exactText,
          surrounding_context: p.surroundingContext,
          section_heading: p.sectionHeading,
          chunk_index: p.chunkIndex,
          char_offset_start: p.charOffsetStart,
          char_offset_end: p.charOffsetEnd,
          evidence_type: p.evidenceType,
          structured_data: p.structuredData,
          content_hash: p.contentHash,
          extracted_at: p.extractedAt,
          created_at: p.extractedAt,
          updated_at: p.extractedAt,
        });
      }

      for (const c of res.claims) {
        allClaims.push({
          id: c.id,
          project_id: projectId,
          claim_text: c.claimText,
          claim_type: c.claimType,
          subject: c.subject,
          predicate: c.predicate,
          object_value: c.objectValue,
          context_qualifier: c.contextQualifier,
          extracted_at: c.extractedAt,
          created_at: c.extractedAt,
          updated_at: c.extractedAt,
        });
      }

      for (const l of res.claimEvidenceLinks) {
        allLinks.push({
          id: l.id,
          claim_id: l.claimId,
          evidence_id: l.evidenceId,
          relationship_type: l.relationshipType,
          relevance_score: l.relevanceScore,
          created_at: l.createdAt,
        });
      }
    }

    const savedEvidence = await researchRepository.saveEvidence(allEvidence);
    const savedClaims = await researchRepository.saveClaims(allClaims);
    const savedLinks = await researchRepository.saveClaimEvidenceLinks(allLinks);

    await researchRepository.updateProjectStatus(projectId, "completed");

    return NextResponse.json({
      success: true,
      projectId,
      sourcesProcessed: extractionResults.length,
      evidencePassagesCount: savedEvidence.length,
      claimsCount: savedClaims.length,
      linksCount: savedLinks.length,
      claims: savedClaims,
      evidence: savedEvidence,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH EXTRACT API ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal research extraction failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
