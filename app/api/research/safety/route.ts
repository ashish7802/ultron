/**
 * ============================================================================
 * Module Name: Research Safety & Integrity API Route (Module 11)
 * Subsystem: ULTRON Research & Verification Engine - Batch 04
 * File: app/api/research/safety/route.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * API Endpoint for Module 11: Research Safety & Integrity Engine.
 * Provides on-demand content sanitization, prompt injection scanning, URL safety
 * inspection, citation integrity verification, and security audit log retrieval.
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - POST:
 *   - `action: "scan"`: Sanitizes external text/HTML, stripping malicious scripts,
 *     neutralizing prompt injection attempts, and masking leaked credentials.
 *   - `action: "inspect_url"`: Pre-discovery safety inspection preventing SSRF.
 *   - `action: "verify_citations"`: Runs citation integrity firewall on research reports.
 * - GET:
 *   - Retrieves security events (`ResearchSecurityEventRecord`) and source audit logs
 *     for a project or system-wide.
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Authenticated session validation.
 * - Does not expose raw passwords or sensitive credentials in response bodies.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { researchSafetyEngine } from "@/lib/research/safetyEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type { ReportType, ReportFormat } from "@/lib/research/types";

/**
 * POST handler to scan content, inspect URLs, or verify citation integrity.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: {
      action?: "scan" | "inspect_url" | "verify_citations";
      content?: string;
      url?: string;
      projectId?: string;
      sourceId?: string;
      reportId?: string;
      provider?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    const action = body.action || "scan";

    // Action 1: In-Flight Content Sanitization & Prompt Injection Detection
    if (action === "scan") {
      const content = body.content;
      if (typeof content !== "string") {
        return NextResponse.json({ error: "A valid content string is required for scanning" }, { status: 400 });
      }

      const scanResult = await researchSafetyEngine.sanitizeContent(
        content,
        body.sourceId,
        body.projectId
      );

      return NextResponse.json({
        success: true,
        action: "scan",
        scanResult,
      });
    }

    // Action 2: URL Safety Inspection (SSRF and Trust Tier)
    if (action === "inspect_url") {
      const { url, sourceId, projectId, provider = "external" } = body;
      if (!url || !sourceId || !projectId) {
        return NextResponse.json(
          { error: "url, sourceId, and projectId are required for URL safety inspection" },
          { status: 400 }
        );
      }

      const inspection = await researchSafetyEngine.inspectSourceUrl(url, sourceId, projectId, provider);
      return NextResponse.json({
        success: true,
        action: "inspect_url",
        inspection,
      });
    }

    // Action 3: Citation Integrity Audit
    if (action === "verify_citations") {
      const { reportId, projectId } = body;
      if (!reportId || !projectId) {
        return NextResponse.json(
          { error: "reportId and projectId are required for citation integrity verification" },
          { status: 400 }
        );
      }

      const reportRecord = await researchRepository.getReport(reportId);
      if (!reportRecord) {
        return NextResponse.json({ error: `Report ${reportId} not found` }, { status: 404 });
      }

      const citationRecords = await researchRepository.getReportCitations(reportId);

      const reconstructedReport = {
        id: reportRecord.id,
        projectId: reportRecord.project_id,
        title: reportRecord.title,
        reportType: reportRecord.report_type as ReportType,
        format: reportRecord.format as ReportFormat,
        contentRaw: reportRecord.content_raw,
        contentStructured: reportRecord.content_structured,
        summaryBrief: reportRecord.summary_brief,
        version: reportRecord.version,
        citations: citationRecords.map((c) => ({
          id: c.id,
          reportId: c.report_id,
          citationIndex: c.citation_index,
          citationMarker: c.citation_marker,
          sourceId: c.source_id,
          evidenceId: c.evidence_id,
          claimId: c.claim_id,
          sourceTitle: c.source_title,
          sourceUrl: c.source_url,
          publisher: c.publisher,
          publicationDate: c.publication_date,
          exactPassageExcerpt: c.exact_passage_excerpt,
        })),
        citationsCount: reportRecord.citations_count,
        generatedAt: reportRecord.generated_at,
      };

      const audit = await researchSafetyEngine.verifyCitationIntegrity(reconstructedReport, projectId);
      return NextResponse.json({
        success: true,
        action: "verify_citations",
        audit,
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[RESEARCH_SAFETY_API_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to execute research safety operation", details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET handler to retrieve security events and source audit logs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") || undefined;

  const securityEvents = await researchRepository.getSecurityEvents(projectId);
  const sourceAuditLogs = projectId ? await researchRepository.getSourceAuditLogs(projectId) : [];

  return NextResponse.json({
    success: true,
    projectId,
    securityEventsCount: securityEvents.length,
    securityEvents,
    sourceAuditLogsCount: sourceAuditLogs.length,
    sourceAuditLogs,
  });
}
