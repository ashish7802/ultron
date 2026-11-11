/**
 * ============================================================================
 * Module Name: Research Report API Route (Module 09)
 * Subsystem: ULTRON Research & Verification Engine - Batch 03
 * File: app/api/research/report/route.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * API Endpoint for Module 09: Research Report Generator.
 * Transforms verified research intelligence into executive dossiers, technical
 * deep-dives, comparative tradeoff matrices, and verbatim-cited reports across
 * Markdown, JSON, and semantic HTML formats.
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - POST: Generates customized research reports based on requested archetype
 *   (Executive Briefing, Comprehensive Dossier, Technical Dossier, Technology
 *   Comparison, Architecture Recommendation, Business Decision, Gap Report,
 *   Source Audit, Drift Report) and format (Markdown, JSON, HTML).
 * - Preserves deterministic citations linking every claim back to exact evidence passages.
 * - Supports report versioning with traceable change summaries.
 * - GET: Retrieves saved reports and verbatim citation registries.
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Zero hallucinated citations: Citations are constructed solely from verified evidence passages.
 * - Local vault encryption: All reports are persisted in the AES-256-GCM encrypted vault.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { researchReportGenerator } from "@/lib/research/reportGenerator";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type {
  ReportType,
  ReportFormat,
  ReportCustomizationOptions,
  ResearchReportRecord,
  ResearchReportCitationRecord,
  ResearchAnalysisResult,
  FreshnessEngineResult,
} from "@/lib/research/types";

/**
 * POST handler to generate a customized research report or create a new version.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: {
      projectId?: string;
      reportId?: string;
      action?: "generate" | "version";
      options?: ReportCustomizationOptions;
      newContent?: string;
      changeSummary?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    // Action 1: Create a new report version
    if (body.action === "version") {
      if (!body.reportId || !body.newContent || !body.changeSummary) {
        return NextResponse.json(
          { error: "reportId, newContent, and changeSummary are required for report versioning" },
          { status: 400 }
        );
      }

      const existingReportRecord = await researchRepository.getReport(body.reportId);
      if (!existingReportRecord) {
        return NextResponse.json({ error: `Report ${body.reportId} not found` }, { status: 404 });
      }

      const existingCitations = await researchRepository.getReportCitations(body.reportId);

      const currentReport = {
        id: existingReportRecord.id,
        projectId: existingReportRecord.project_id,
        title: existingReportRecord.title,
        reportType: existingReportRecord.report_type as ReportType,
        format: existingReportRecord.format as ReportFormat,
        contentRaw: existingReportRecord.content_raw,
        contentStructured: existingReportRecord.content_structured,
        summaryBrief: existingReportRecord.summary_brief,
        version: existingReportRecord.version,
        citations: existingCitations.map((c) => ({
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
        citationsCount: existingReportRecord.citations_count,
        generatedAt: existingReportRecord.updated_at,
      };

      const { updatedReport, versionRecord } = researchReportGenerator.createReportVersion(
        currentReport,
        body.newContent,
        existingReportRecord.content_structured,
        body.changeSummary
      );

      // Persist version and update report in repository
      await researchRepository.saveReportVersion({
        id: versionRecord.id,
        report_id: versionRecord.reportId,
        version: versionRecord.version,
        content_raw: versionRecord.contentRaw,
        content_structured: versionRecord.contentStructured,
        change_summary: versionRecord.changeSummary,
        created_at: versionRecord.createdAt,
      });

      await researchRepository.saveReport({
        ...existingReportRecord,
        version: updatedReport.version,
        content_raw: updatedReport.contentRaw,
        updated_at: updatedReport.generatedAt,
      });

      return NextResponse.json({
        success: true,
        action: "version",
        report: updatedReport,
        version: versionRecord,
      });
    }

    // Action 2: Generate New Report
    const projectId = body.projectId;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "A valid projectId string is required" }, { status: 400 });
    }

    const project = await researchRepository.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Research project ${projectId} not found` }, { status: 404 });
    }

    // Collect prerequisite records
    const sources = await researchRepository.getSources(projectId);
    const evidence = await researchRepository.getEvidence(projectId);
    const claims = await researchRepository.getClaims(projectId);
    const reliabilities = await researchRepository.getQualityAssessments(projectId);
    const verifications = await researchRepository.getClaimVerifications(projectId);
    const contradictions = await researchRepository.getContradictions(projectId);
    const analysisRecord = await researchRepository.getAnalysis(projectId);
    const findings = await researchRepository.getFindings(projectId);
    const recommendations = await researchRepository.getRecommendations(projectId);
    const gaps = await researchRepository.getGaps(projectId);
    const alternatives = await researchRepository.getAlternatives(projectId);
    const sourceFreshness = await researchRepository.getSourceFreshness(projectId);
    const jobs = await researchRepository.getRevalidationJobs(projectId);
    const logs = await researchRepository.getRevalidationLogs(projectId);

    // Format analysis context if present
    let analysisContext: ResearchAnalysisResult | undefined;
    if (analysisRecord) {
      analysisContext = {
        id: analysisRecord.id,
        projectId,
        executiveSummary: analysisRecord.executive_summary,
        evidenceBasedConclusions: analysisRecord.evidence_based_conclusions,
        findings: findings.map((f) => ({
          id: f.id,
          projectId: f.project_id,
          subQuestionId: f.sub_question_id,
          findingTitle: f.finding_title,
          findingStatement: f.finding_statement,
          findingType: f.finding_type as "technical" | "architectural" | "operational" | "comparative",
          supportingClaimIds: f.supporting_claim_ids || [],
          supportingEvidenceIds: f.supporting_evidence_ids || [],
          confidenceLevel: f.confidence_level as "HIGH" | "MODERATE" | "PROVISIONAL" | "LOW",
          isConsensusFact: f.is_consensus_fact,
          createdAt: f.created_at,
        })),
        recommendations: recommendations.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          recommendationText: r.recommendation_text,
          reasoning: r.reasoning,
          supportingClaimIds: r.supporting_claim_ids || [],
          supportingEvidenceIds: r.supporting_evidence_ids || [],
          advantages: r.advantages || [],
          tradeOffs: r.trade_offs || [],
          risks: r.risks || [],
          assumptions: r.assumptions || [],
          confidenceScore: r.confidence_score || 0.85,
          conditionalTriggers: r.conditional_triggers || [],
          createdAt: r.created_at,
        })),
        gaps: gaps.map((g) => ({
          id: g.id,
          projectId: g.project_id,
          gapTitle: g.gap_title,
          gapDescription: g.gap_description,
          subQuestionId: g.sub_question_id,
          severity: g.severity,
          impactAnalysis: g.impact_analysis,
          recommendedRemedy: g.recommended_remedy,
          createdAt: g.created_at,
        })),
        alternatives: alternatives.map((a) => ({
          id: a.id,
          projectId: a.project_id,
          name: a.name,
          description: a.description,
          advantages: a.advantages || [],
          disadvantages: a.disadvantages || [],
          dependencies: a.dependencies || [],
          technicalRequirements: a.technical_requirements || [],
          operationalLimitations: a.operational_limitations || [],
          risks: a.risks || [],
          unresolvedQuestions: a.unresolved_questions || [],
          supportingEvidenceIds: a.supporting_evidence_ids || [],
          createdAt: a.created_at,
        })),
        comparativeAnalysis: analysisRecord.comparative_analysis,
        architecturalImplications: analysisRecord.architectural_implications,
        uncertaintyProfile: analysisRecord.uncertainty_profile,
        decisionFramework: analysisRecord.decision_framework,
        analyzedAt: analysisRecord.updated_at,
      };
    }

    // Format freshness context if present
    let freshnessContext: FreshnessEngineResult | undefined;
    if (sourceFreshness.length > 0) {
      freshnessContext = {
        projectId,
        sourceFreshness: sourceFreshness.map((sf) => ({
          id: sf.id,
          projectId: sf.project_id,
          sourceId: sf.source_id,
          freshnessState: sf.freshness_state,
          lastVerifiedAt: sf.last_verified_at,
          nextRevalidationDue: sf.next_revalidation_due,
          stalenessReasons: sf.staleness_reasons || [],
          versionObserved: sf.version_observed,
          contentHashObserved: sf.content_hash_observed,
        })),
        scheduledJobs: jobs.map((j) => ({
          id: j.id,
          projectId: j.project_id,
          sourceId: j.source_id,
          status: j.status,
          scheduledFor: j.scheduled_for,
          startedAt: j.started_at,
          completedAt: j.completed_at,
          retryCount: j.retry_count,
          errorMessage: j.error_message,
          createdAt: j.created_at,
        })),
        detectedChanges: [],
        revalidationLogs: logs.map((l) => ({
          id: l.id,
          projectId: l.project_id,
          sourceId: l.source_id,
          changeDescription: l.change_description,
          previousContentHash: l.previous_content_hash,
          newContentHash: l.new_content_hash,
          previousVersion: l.previous_version,
          newVersion: l.new_version,
          impactedClaimIds: l.impacted_claim_ids || [],
          impactedEvidenceIds: l.impacted_evidence_ids || [],
          impactedRecommendationIds: l.impacted_recommendation_ids || [],
          detectedAt: l.detected_at,
        })),
        overallProjectFreshness: sourceFreshness.some((sf) => sf.freshness_state === "EXPIRED")
          ? "EXPIRED"
          : sourceFreshness.some((sf) => sf.freshness_state === "STALE")
          ? "STALE"
          : sourceFreshness.some((sf) => sf.freshness_state === "AGING")
          ? "AGING"
          : "CURRENT",
        assessedAt: new Date().toISOString(),
      };
    }

    // Generate Report via Module 09 Engine
    const report = researchReportGenerator.generateReport({
      project,
      sources,
      evidence,
      claims,
      reliabilities,
      verifications,
      contradictions,
      analysis: analysisContext,
      freshness: freshnessContext,
      options: body.options,
    });

    // Save report to repository
    const repRecord: ResearchReportRecord = {
      id: report.id,
      project_id: projectId,
      title: report.title,
      report_type: report.reportType,
      format: report.format,
      content_raw: report.contentRaw,
      content_structured: report.contentStructured,
      summary_brief: report.summaryBrief,
      version: report.version,
      citations_count: report.citationsCount,
      generated_at: report.generatedAt,
      updated_at: report.generatedAt,
    };
    await researchRepository.saveReport(repRecord);

    // Save citations to repository
    const citRecords: ResearchReportCitationRecord[] = report.citations.map((c) => ({
      id: c.id,
      report_id: report.id,
      citation_index: c.citationIndex,
      citation_marker: c.citationMarker,
      source_id: c.sourceId,
      evidence_id: c.evidenceId,
      claim_id: c.claimId,
      source_title: c.sourceTitle,
      source_url: c.sourceUrl,
      publisher: c.publisher,
      publication_date: c.publicationDate,
      exact_passage_excerpt: c.exactPassageExcerpt,
      created_at: report.generatedAt,
    }));
    await researchRepository.saveReportCitations(citRecords);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error("[RESEARCH_REPORT_API_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to generate research report", details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET handler to retrieve a specific report or all reports for a project.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  const { searchParams } = new URL(req.url);
  const reportId = searchParams.get("reportId");
  const projectId = searchParams.get("projectId");

  if (reportId) {
    const report = await researchRepository.getReport(reportId);
    if (!report) {
      return NextResponse.json({ error: `Report ${reportId} not found` }, { status: 404 });
    }
    const citations = await researchRepository.getReportCitations(reportId);
    return NextResponse.json({ success: true, report, citations });
  }

  if (projectId) {
    const reports = await researchRepository.getReportsForProject(projectId);
    return NextResponse.json({ success: true, projectId, reports });
  }

  return NextResponse.json(
    { error: "Either reportId or projectId parameter is required" },
    { status: 400 }
  );
}
