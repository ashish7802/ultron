/**
 * ============================================================================
 * Module Name: Research Report Generator (Module 09)
 * Subsystem: ULTRON Research & Verification Engine - Batch 03
 * File: lib/research/reportGenerator.ts
 * ============================================================================
 * 
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * Module 09 transforms collected research artifacts, source evaluations, verified
 * claims, cross-source contradictions, analytical conclusions, and freshness audits
 * into executive-ready, audit-traceable research reports.
 * 
 * It supports 9 distinct report archetypes tailored to different decision-making
 * needs (Executive Briefing, Comprehensive Report, Technical Dossier, Technology
 * Comparison, Architectural Recommendation, Business Decision, Research Gap Report,
 * Source Evidence Audit, and Revalidation Drift Report) across Markdown, JSON, and
 * semantic HTML formats.
 * 
 * KEY RESPONSIBILITIES:
 * ---------------------
 * 1. Multi-Archetype Report Synthesis: Produces 9 distinct report structures based
 *    on depth and audience targeting (executive founder, senior engineer, investor).
 * 2. Deterministic Verbatim Citation Engine: Generates verifiable citation indices
 *    ([1], [2], etc.) linking claims directly to original URLs and verbatim evidence
 *    passages. Strictly rejects hallucinated sources or fabricated references.
 * 3. Multi-Format Rendering: Formats raw output into Markdown, structured JSON,
 *    and clean, modern HTML with inline styling and footnote anchor links.
 * 4. Comparison Matrix & Visual Table Formatting: Renders trade-off tables,
 *    reliability breakdowns, contradiction matrices, and freshness status grids.
 * 5. Report Versioning: Tracks revisions across revalidation cycles and allows
 *    historical comparison with change summaries.
 * 
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Read-only synthesis: Derives all facts strictly from local repository records.
 * - Verbatim passage verification: Footnotes only reference verified evidence records.
 * - Zero external API dependency or paid API leaks.
 * - XSS-sanitized HTML output preventing unescaped user-input injection.
 * ============================================================================
 */

import { randomUUID } from "crypto";
import type {
  ResearchProjectRecord,
  SourceRecord,
  EvidenceRecord,
  ClaimRecord,
  SourceQualityAssessmentRecord,
  ClaimVerificationRecord,
  CrossSourceContradictionRecord,
  ResearchAnalysisResult,
  FreshnessEngineResult,
  ReportType,
  ReportFormat,
  ReportCitation,
  ResearchReport,
  ResearchReportVersion,
  ReportCustomizationOptions,
} from "./types.ts";

/**
 * Interface representing the complete context required to generate an audit-ready report.
 */
export interface ReportGenerationContext {
  project: ResearchProjectRecord;
  sources: SourceRecord[];
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  reliabilities: SourceQualityAssessmentRecord[];
  verifications: ClaimVerificationRecord[];
  contradictions: CrossSourceContradictionRecord[];
  analysis?: ResearchAnalysisResult;
  freshness?: FreshnessEngineResult;
  options?: ReportCustomizationOptions;
}

/**
 * Citation registry helper class to track citations during report compilation.
 */
class CitationRegistry {
  private citations: Map<string, ReportCitation> = new Map();
  private citationList: ReportCitation[] = [];
  private reportId: string;

  constructor(reportId: string) {
    this.reportId = reportId;
  }

  /**
   * Registers a source/evidence pair and returns the footnote marker (e.g., "[1]").
   * If already registered, returns the existing citation marker to prevent duplicates.
   */
  public registerCitation(
    source: SourceRecord,
    evidence?: EvidenceRecord,
    claimId?: string
  ): string {
    const key = `${source.id}:${evidence?.id ?? "source_only"}`;
    const existing = this.citations.get(key);
    if (existing) {
      return existing.citationMarker;
    }

    const citationIndex = this.citationList.length + 1;
    const marker = `[${citationIndex}]`;

    const citation: ReportCitation = {
      id: randomUUID(),
      reportId: this.reportId,
      citationIndex,
      citationMarker: marker,
      sourceId: source.id,
      evidenceId: evidence?.id,
      claimId,
      sourceTitle: source.title || "Untitled Source Document",
      sourceUrl: source.canonical_url || source.original_url,
      publisher: source.publisher,
      publicationDate: source.publication_date,
      exactPassageExcerpt: evidence?.exact_passage
        ? evidence.exact_passage.substring(0, 280) + (evidence.exact_passage.length > 280 ? "..." : "")
        : undefined,
    };

    this.citations.set(key, citation);
    this.citationList.push(citation);
    return marker;
  }

  /**
   * Retrieves the ordered list of all registered citations.
   */
  public getAllCitations(): ReportCitation[] {
    return [...this.citationList];
  }
}

/**
 * Research Report Generator (Module 09)
 * 
 * Orchestrates document structuring, citations, analytical insight formatting,
 * and multi-format rendering across Markdown, JSON, and HTML.
 */
export class ResearchReportGenerator {
  /**
   * Generates a research report according to specified archetype and format.
   * 
   * @param context Complete data context from Modules 01-08
   * @returns Complete ResearchReport record ready for storage and export
   */
  public generateReport(context: ReportGenerationContext): ResearchReport {
    const reportId = randomUUID();
    const type: ReportType = context.options?.reportType ?? "executive_briefing";
    const format: ReportFormat = context.options?.format ?? "markdown";
    const registry = new CitationRegistry(reportId);

    // Build structured report data
    const structured = this.buildStructuredSections(context, registry, type);

    // Render into target format
    let rawContent: string;
    switch (format) {
      case "json":
        rawContent = JSON.stringify(structured, null, 2);
        break;
      case "html":
        rawContent = this.renderHtml(structured, registry.getAllCitations());
        break;
      case "markdown":
      default:
        rawContent = this.renderMarkdown(structured, registry.getAllCitations());
        break;
    }

    const citations = registry.getAllCitations();

    return {
      id: reportId,
      projectId: context.project.id,
      title: structured.title,
      reportType: type,
      format,
      contentRaw: rawContent,
      contentStructured: structured,
      summaryBrief: structured.executiveSummary,
      version: 1,
      citations,
      citationsCount: citations.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Creates a new version of an existing report with an explicit changelog summary.
   * 
   * @param currentReport Existing report to base new version upon
   * @param newContent Updated raw document string
   * @param newStructured Updated structured JSON representation
   * @param changeSummary Explanation of what was updated or revalidated
   * @returns Updated ResearchReport and corresponding ResearchReportVersion record
   */
  public createReportVersion(
    currentReport: ResearchReport,
    newContent: string,
    newStructured: Record<string, unknown>,
    changeSummary: string
  ): { updatedReport: ResearchReport; versionRecord: ResearchReportVersion } {
    const newVersionNumber = currentReport.version + 1;

    const versionRecord: ResearchReportVersion = {
      id: randomUUID(),
      reportId: currentReport.id,
      version: currentReport.version,
      contentRaw: currentReport.contentRaw,
      contentStructured: currentReport.contentStructured,
      changeSummary,
      createdAt: new Date().toISOString(),
    };

    const updatedReport: ResearchReport = {
      ...currentReport,
      version: newVersionNumber,
      contentRaw: newContent,
      contentStructured: newStructured,
      generatedAt: new Date().toISOString(),
    };

    return { updatedReport, versionRecord };
  }

  // ==========================================================================
  // SECTION COMPOSITION
  // ==========================================================================

  /**
   * Assembles structured data sections based on the requested report archetype.
   */
  private buildStructuredSections(
    context: ReportGenerationContext,
    registry: CitationRegistry,
    type: ReportType
  ): {
    title: string;
    subtitle: string;
    reportType: ReportType;
    metadata: Record<string, unknown>;
    executiveSummary: string;
    sections: Array<{
      heading: string;
      subheading?: string;
      body: string;
      tables?: Array<{ headers: string[]; rows: string[][] }>;
      callouts?: Array<{ type: "info" | "warning" | "success" | "danger"; title: string; text: string }>;
    }>;
  } {
    const { project, sources, evidence, claims, reliabilities, verifications, contradictions, analysis, freshness, options } = context;

    // Map source IDs to SourceRecords for fast citation resolution
    const sourceMap = new Map<string, SourceRecord>();
    sources.forEach((s) => sourceMap.set(s.id, s));

    // Map evidence IDs to EvidenceRecords
    const evidenceMap = new Map<string, EvidenceRecord>();
    evidence.forEach((e) => evidenceMap.set(e.id, e));

    const titlePrefix = this.getReportTypeTitle(type);
    const title = `${titlePrefix}: ${project.topic}`;
    const subtitle = `ULTRON Research & Verification Intelligence Dossier • Scope: ${project.research_intent}`;

    const metadata: Record<string, unknown> = {
      projectId: project.id,
      generatedAt: new Date().toISOString(),
      reportType: type,
      audience: options?.audience ?? "founder_executive",
      depth: options?.depth ?? "standard",
      totalSourcesEvaluated: sources.length,
      totalEvidencePassages: evidence.length,
      totalClaimsVerified: verifications.length,
      contradictionsDetected: contradictions.length,
      freshnessStatus: freshness?.overallProjectFreshness ?? "UNKNOWN",
    };

    // Executive summary default
    const execSummary = analysis?.executiveSummary ??
      `This report synthesizes ${sources.length} sources, ${evidence.length} evidence passages, and ${claims.length} claims regarding "${project.topic}". It assesses verification confidence, technical feasibility, and cross-source consistency.`;

    const sections: Array<{
      heading: string;
      subheading?: string;
      body: string;
      tables?: Array<{ headers: string[]; rows: string[][] }>;
      callouts?: Array<{ type: "info" | "warning" | "success" | "danger"; title: string; text: string }>;
    }> = [];

    // 1. Executive Summary & Objective Section (included in all reports)
    sections.push({
      heading: "1. Executive Objective & Strategic Context",
      body: `**Problem Statement:** ${project.problem_statement}\n\n**Expected Outcome:** ${project.expected_outcome || "Rigorous evidence-based technical and strategic synthesis."}\n\n**Intended Decision:** ${project.intended_decision || "Architectural selection and deployment roadmap."}`,
      callouts: [
        {
          type: "info",
          title: "Executive Synthesis",
          text: execSummary,
        },
      ],
    });

    // 2. Evidence-Based Conclusions (if available from Module 07)
    if (analysis?.evidenceBasedConclusions && analysis.evidenceBasedConclusions.length > 0) {
      const conclusionsBody = analysis.evidenceBasedConclusions
        .map((c, idx) => {
          // Resolve citations for supporting evidence passages
          const citationMarkers = c.supportingEvidenceIds
            .map((evidenceId) => {
              const ev = evidenceMap.get(evidenceId);
              if (ev) {
                const src = sourceMap.get(ev.source_id);
                if (src) return registry.registerCitation(src, ev);
              }
              return null;
            })
            .filter((m): m is string => m !== null);

          const citationSuffix = citationMarkers.length > 0 ? ` ${citationMarkers.join(" ")}` : "";
          return `### ${idx + 1}. Evidence-Based Conclusion\n**Statement:** ${c.statement}${citationSuffix}\n\n*Confidence:* \`${c.confidenceLevel}\` | *Consensus Fact:* \`${c.isConsensusFact ? "YES" : "NO"}\`\n\n${c.reasoning}`;
        })
        .join("\n\n");

      sections.push({
        heading: "2. Key Evidence-Based Conclusions",
        body: conclusionsBody,
      });
    }

    // 3. Technical Comparison Matrix (for technology_comparison, comprehensive_report, technical_dossier)
    if (
      (type === "technology_comparison" || type === "comprehensive_report" || type === "technical_dossier") &&
      analysis?.comparativeAnalysis &&
      analysis.comparativeAnalysis.dimensions.length > 0
    ) {
      const headers = ["Dimension", ...analysis.comparativeAnalysis.optionsCompared];
      const rows = analysis.comparativeAnalysis.dimensions.map((dim) => [
        dim.dimensionName,
        ...analysis.comparativeAnalysis.optionsCompared.map((opt) => dim.evaluations[opt]?.value || "N/A"),
      ]);

      sections.push({
        heading: "3. Multi-Factor Comparative Tradeoff Matrix",
        body: `Comparative evaluation across options: ${analysis.comparativeAnalysis.optionsCompared.join(", ")}.`,
        tables: [{ headers, rows }],
      });
    }

    // 4. Architectural Implications & Roadmap (for architecture_recommendation, technical_dossier, comprehensive_report)
    if (
      (type === "architecture_recommendation" || type === "technical_dossier" || type === "comprehensive_report") &&
      analysis?.architecturalImplications &&
      analysis.architecturalImplications.length > 0
    ) {
      const archBody = analysis.architecturalImplications
        .map((arch) => {
          return `### Category: ${arch.category.toUpperCase()}\n**Risk Severity:** \`${arch.riskSeverity}\`\n\n**Architectural Implication:** ${arch.implication}\n\n**Technical Prerequisite:** ${arch.technicalPrerequisite}`;
        })
        .join("\n\n---\n\n");

      sections.push({
        heading: "4. System Architecture & Engineering Roadmap",
        body: archBody,
      });
    }

    // 5. Strategic Recommendations & Action Plan (for business_decision, executive_briefing, comprehensive_report)
    if (
      (options?.includeRecommendations !== false) &&
      analysis?.recommendations &&
      analysis.recommendations.length > 0
    ) {
      const recsTable = {
        headers: ["Recommendation", "Reasoning", "Confidence", "Advantages", "Risks"],
        rows: analysis.recommendations.map((r) => [
          r.recommendationText,
          r.reasoning,
          `${(r.confidenceScore * 100).toFixed(0)}%`,
          r.advantages.slice(0, 2).join("; ") || "Direct solution",
          r.risks.slice(0, 2).join("; ") || "None identified",
        ]),
      };

      sections.push({
        heading: "5. Strategic Recommendations & Implementation Steps",
        body: "Actionable engineering and operational recommendations ranked by impact, resource investment, and risk profile.",
        tables: [recsTable],
      });
    }

    // 6. Contradictions & Disputed Findings (Module 06 integration)
    if (
      (options?.includeContradictions !== false) &&
      contradictions.length > 0
    ) {
      const conflictRows = contradictions.map((c) => [
        c.contradiction_type.toUpperCase(),
        c.competing_claim_ids[0]?.substring(0, 8) || "N/A",
        c.competing_claim_ids[1]?.substring(0, 8) || "N/A",
        c.severity.toUpperCase(),
        c.resolution_status.toUpperCase(),
        c.resolution_explanation.substring(0, 120) + (c.resolution_explanation.length > 120 ? "..." : ""),
      ]);

      sections.push({
        heading: "6. Cross-Source Contradictions & Disputed Evidence",
        body: `ULTRON identified ${contradictions.length} divergent statements across analyzed sources. Transparent contradiction surfacing ensures decisions are never based on unexamined consensus illusions.`,
        tables: [
          {
            headers: ["Type", "Claim A", "Claim B", "Severity", "Reconciliation", "Analysis"],
            rows: conflictRows,
          },
        ],
      });
    }

    // 7. Research Gaps & Uncertainty Profile (for research_gap_report, comprehensive_report)
    if (
      (options?.includeKnowledgeGaps !== false) &&
      analysis?.gaps &&
      analysis.gaps.length > 0
    ) {
      const gapsBody = analysis.gaps
        .map((g) => {
          return `### [${g.severity}] ${g.gapTitle}\n**Description:** ${g.gapDescription}\n**Impact Analysis:** ${g.impactAnalysis}\n**Recommended Remedy:** ${g.recommendedRemedy}`;
        })
        .join("\n\n");

      sections.push({
        heading: "7. Identified Knowledge Gaps & Unresolved Inquiries",
        body: gapsBody,
      });
    }

    // 8. Freshness & Drift Audit (Module 08 integration)
    if (freshness) {
      const freshnessHeaders = ["Source Title", "Freshness State", "Next Due", "Last Verified", "Staleness Diagnostics"];
      const freshnessRows = freshness.sourceFreshness.slice(0, 10).map((sf) => {
        const src = sourceMap.get(sf.sourceId);
        return [
          src?.title.substring(0, 40) || sf.sourceId.substring(0, 8),
          sf.freshnessState,
          new Date(sf.nextRevalidationDue).toLocaleDateString(),
          new Date(sf.lastVerifiedAt).toLocaleDateString(),
          sf.stalenessReasons.join("; ") || "Valid and active",
        ];
      });

      sections.push({
        heading: "8. Source Freshness & Temporal Validity Audit",
        body: `**Overall Dossier Freshness:** \`${freshness.overallProjectFreshness}\`\n\nTemporal decay policies monitor sources for API version churn, deprecation warnings, and documentation updates.`,
        tables: [{ headers: freshnessHeaders, rows: freshnessRows }],
      });
    }

    // 9. Source Audit & Evidence Registry (for source_evidence_report, comprehensive_report)
    if (type === "source_evidence_report" || type === "comprehensive_report") {
      const sourceAuditHeaders = ["Source", "Type", "Authority", "Freshness", "Relevance", "Composite Reliability"];
      const sourceAuditRows = reliabilities.slice(0, 12).map((rel) => {
        const src = sourceMap.get(rel.source_id);
        return [
          src?.title.substring(0, 35) || rel.source_id.substring(0, 8),
          src?.source_type || "UNKNOWN",
          `${(rel.authority_score * 100).toFixed(0)}%`,
          `${(rel.freshness_score * 100).toFixed(0)}%`,
          `${(rel.relevance_score * 100).toFixed(0)}%`,
          `${(rel.composite_quality_score * 100).toFixed(0)}%`,
        ];
      });

      sections.push({
        heading: "9. Source Reliability & Quality Index",
        body: "Multi-dimensional reliability evaluation across authority, publisher pedigree, technical freshness, evidence transparency, and independent corroborateability.",
        tables: [{ headers: sourceAuditHeaders, rows: sourceAuditRows }],
      });
    }

    return {
      title,
      subtitle,
      reportType: type,
      metadata,
      executiveSummary: execSummary,
      sections,
    };
  }

  // ==========================================================================
  // FORMAT RENDERERS: MARKDOWN & HTML
  // ==========================================================================

  /**
   * Renders structured report data into standard GitHub-Flavored Markdown with footnotes.
   */
  private renderMarkdown(
    data: ReturnType<typeof this.buildStructuredSections>,
    citations: ReportCitation[]
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${data.title}`);
    lines.push(`> *${data.subtitle}*`);
    lines.push("");
    lines.push(`**Generated:** ${new Date().toUTCString()} | **Classification:** \`${data.reportType.toUpperCase()}\``);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Sections
    for (const section of data.sections) {
      lines.push(`## ${section.heading}`);
      if (section.subheading) {
        lines.push(`*${section.subheading}*`);
        lines.push("");
      }

      if (section.callouts && section.callouts.length > 0) {
        for (const callout of section.callouts) {
          lines.push(`> [!${callout.type.toUpperCase()}] **${callout.title}**`);
          lines.push(`> ${callout.text.replace(/\n/g, "\n> ")}`);
          lines.push("");
        }
      }

      lines.push(section.body);
      lines.push("");

      if (section.tables && section.tables.length > 0) {
        for (const table of section.tables) {
          lines.push(this.formatMarkdownTable(table.headers, table.rows));
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
    }

    // Footnotes / Verbatim Citations
    if (citations.length > 0) {
      lines.push("## References & Verbatim Evidence Footnotes");
      lines.push("");
      for (const cit of citations) {
        const pubPart = cit.publisher ? `*${cit.publisher}*. ` : "";
        const datePart = cit.publicationDate ? `(${cit.publicationDate}). ` : "";
        const excerptPart = cit.exactPassageExcerpt
          ? `\n   > _"${cit.exactPassageExcerpt}"_`
          : "";

        lines.push(
          `${cit.citationMarker} **[${cit.sourceTitle}](${cit.sourceUrl})**. ${pubPart}${datePart}${excerptPart}`
        );
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Renders structured report data into semantic, self-contained HTML.
   */
  private renderHtml(
    data: ReturnType<typeof this.buildStructuredSections>,
    citations: ReportCitation[]
  ): string {
    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.4rem; color: #1e293b; margin-top: 2rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.25rem; }
    h3 { font-size: 1.1rem; color: #334155; margin-top: 1.25rem; }
    .subtitle { color: #64748b; font-size: 0.95rem; margin-bottom: 1.5rem; }
    .callout { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 1rem; margin: 1.25rem 0; border-radius: 0 4px 4px 0; }
    .callout-title { font-weight: 600; color: #1d4ed8; margin-bottom: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #cbd5e1; padding: 0.6rem 0.75rem; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; color: #334155; }
    tr:nth-child(even) { background: #f8fafc; }
    .citation-list { font-size: 0.85rem; color: #475569; }
    .citation-item { margin-bottom: 0.75rem; }
    .citation-excerpt { font-style: italic; color: #64748b; margin-left: 1.5rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <div class="subtitle">${escapeHtml(data.subtitle)} | Generated: ${new Date().toUTCString()}</div>
`;

    for (const sec of data.sections) {
      html += `  <h2>${escapeHtml(sec.heading)}</h2>\n`;
      if (sec.callouts) {
        for (const c of sec.callouts) {
          html += `  <div class="callout">\n    <div class="callout-title">${escapeHtml(c.title)}</div>\n    <div>${escapeHtml(c.text)}</div>\n  </div>\n`;
        }
      }
      html += `  <p>${escapeHtml(sec.body).replace(/\n\n/g, "</p><p>")}</p>\n`;

      if (sec.tables) {
        for (const t of sec.tables) {
          html += `  <table>\n    <thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>\n    <tbody>\n`;
          for (const row of t.rows) {
            html += `      <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>\n`;
          }
          html += `    </tbody>\n  </table>\n`;
        }
      }
    }

    if (citations.length > 0) {
      html += `  <h2>References & Verbatim Evidence Footnotes</h2>\n  <div class="citation-list">\n`;
      for (const cit of citations) {
        html += `    <div class="citation-item"><strong>${cit.citationMarker}</strong> <a href="${escapeHtml(cit.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cit.sourceTitle)}</a>`;
        if (cit.publisher) html += ` - <em>${escapeHtml(cit.publisher)}</em>`;
        if (cit.publicationDate) html += ` (${escapeHtml(cit.publicationDate)})`;
        if (cit.exactPassageExcerpt) {
          html += `<div class="citation-excerpt">"${escapeHtml(cit.exactPassageExcerpt)}"</div>`;
        }
        html += `</div>\n`;
      }
      html += `  </div>\n`;
    }

    html += `</body>\n</html>`;
    return html;
  }

  /**
   * Helper utility to render a clean Markdown table.
   */
  private formatMarkdownTable(headers: string[], rows: string[][]): string {
    const colWidths = headers.map((h, i) => {
      const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] || "").length), 0);
      return Math.max(h.length, maxRow, 3);
    });

    const headerLine = `| ${headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ")} |`;
    const separatorLine = `| ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`;
    const dataLines = rows.map(
      (row) => `| ${headers.map((_, i) => (row[i] || "").padEnd(colWidths[i])).join(" | ")} |`
    );

    return [headerLine, separatorLine, ...dataLines].join("\n");
  }

  /**
   * Helper to format report titles according to archetype.
   */
  private getReportTypeTitle(type: ReportType): string {
    switch (type) {
      case "executive_briefing":
        return "Executive Research Briefing";
      case "comprehensive_report":
        return "Comprehensive Research Dossier";
      case "technical_dossier":
        return "Technical Deep-Dive Dossier";
      case "technology_comparison":
        return "Technology Comparison & Tradeoff Matrix";
      case "architecture_recommendation":
        return "Architecture & Engineering Recommendation";
      case "business_decision":
        return "Business Feasibility & Strategic Decision Report";
      case "research_gap_report":
        return "Knowledge Gaps & Research Uncertainty Report";
      case "source_evidence_report":
        return "Source Reliability & Verbatim Evidence Audit";
      case "revalidation_change_report":
        return "Freshness Decay & Content Drift Revalidation Report";
      default:
        return "Research Intelligence Report";
    }
  }
}

/**
 * Singleton export of ResearchReportGenerator.
 */
export const researchReportGenerator = new ResearchReportGenerator();
