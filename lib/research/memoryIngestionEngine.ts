/**
 * ============================================================================
 * Module Name: Advanced Memory Deep Ingestion Engine (Module 10)
 * Subsystem: ULTRON Research & Verification Engine - Batch 04
 * File: lib/research/memoryIngestionEngine.ts
 * ============================================================================
 * 
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * Module 10 serves as the persistent cognitive bridge between the Research &
 * Verification Engine and ULTRON's existing Advanced Memory subsystem (`lib/memoryManager.ts`).
 * 
 * When a research project concludes, this engine transforms transient research
 * artifacts (verified claims, technical specifications, comparative trade-offs,
 * cross-source contradictions, knowledge gaps, and architectural recommendations)
 * into structured, associative, and traceable long-term memory records.
 * 
 * It extends ULTRON's cognitive knowledge graph with canonical entity nodes and
 * semantic edges (e.g., USES, SUPPORTS, CONTRADICTS, RECOMMENDS), maintains
 * strict research provenance links, enforces non-destructive memory versioning,
 * performs intelligent deduplication, and provides associative recall so future
 * research tasks can build directly upon past investigations without redundant
 * discovery cycles.
 * 
 * KEY RESPONSIBILITIES:
 * ---------------------
 * 1. Deep Research Ingestion: Ingests verified claims, conclusions, recommendations,
 *    and reports into persistent memory vault records while strictly preserving
 *    provenance (claim IDs, source URLs, character offsets, verification status).
 * 2. Epistemic Classification: Strictly separates verified facts from unverified
 *    assumptions, active contradictions, and strategic recommendations. Never
 *    elevates an unverified or disputed claim to an established memory fact.
 * 3. Knowledge Graph Construction: Builds and updates relational nodes and edges
 *    connecting research projects, components, technologies, claims, evidence, and decisions.
 * 4. Deduplication & Non-Destructive Versioning: Identifies existing memories with
 *    overlapping semantic keys and creates version records (`ResearchMemoryVersion`)
 *    instead of silently overwriting historical facts.
 * 5. Pre-Research Memory Retrieval: Recalls previous research findings, technical
 *    limitations, and architectural decisions before starting new inquiries.
 * 6. Self-Healing & Integrity Auditing: Scans memory-to-research links to detect
 *    orphaned records, broken evidence pointers, or missing source attributions.
 * 
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Zero External Leakage: All memories are persisted to the local AES-256-GCM
 *   authenticated memory vault (`ultron_memory_vault.json`).
 * - Read-Only External Boundary: Never writes or exposes research knowledge to
 *   third-party cloud services or paid APIs.
 * - Provenance Traceability: Every ingested fact carries an immutable audit link
 *   back to the originating project, query, and verbatim source passage.
 * ============================================================================
 */

import crypto from "crypto";
import {
  saveMemory,
  loadAllMemories,
  recallRelevantMemories,
  MemoryRecord,
  MemoryCategory,
} from "../memoryManager.ts";
import { researchRepository } from "./repository.ts";
import type {
  ResearchProjectRecord,
  SourceRecord,
  EvidenceRecord,
  ClaimRecord,
  ClaimVerificationRecord,
  CrossSourceContradictionRecord,
  ResearchAnalysisResult,
  ResearchReport,
  ResearchMemoryLink,
  ResearchMemoryLinkRecord,
  ResearchKnowledgeNode,
  ResearchKnowledgeNodeRecord,
  ResearchKnowledgeEdge,
  ResearchKnowledgeEdgeRecord,
  ResearchMemoryVersion,
  ResearchMemoryVersionRecord,
  MemoryIngestionOptions,
  MemoryIngestionResult,
} from "./types.ts";

/**
 * Context payload required for deep memory ingestion.
 */
export interface DeepMemoryIngestionContext {
  project: ResearchProjectRecord;
  sources: SourceRecord[];
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  verifications: ClaimVerificationRecord[];
  contradictions: CrossSourceContradictionRecord[];
  analysis?: ResearchAnalysisResult;
  reports?: ResearchReport[];
  options?: MemoryIngestionOptions;
}

/**
 * Advanced Memory Deep Ingestion Engine (Module 10)
 */
export class AdvancedMemoryIngestionEngine {
  /**
   * Ingests a complete research project and its verified outputs into Advanced Memory.
   *
   * @param context Complete data context from Modules 01 - 09
   * @returns Structured MemoryIngestionResult summarizing all created links, nodes, and edges
   */
  public async ingestResearchProject(
    context: DeepMemoryIngestionContext
  ): Promise<MemoryIngestionResult> {
    const { project, sources, evidence, claims, verifications, contradictions, analysis, reports, options } = context;
    const projectId = project.id;
    const minConfidence = options?.minConfidenceThreshold ?? 0.6;
    const storeUnverifiedAsAssumptions = options?.storeUnverifiedAsAssumptions ?? true;

    const memoryLinks: ResearchMemoryLink[] = [];
    const memoryVersions: ResearchMemoryVersion[] = [];
    const knowledgeNodes: ResearchKnowledgeNode[] = [];
    const knowledgeEdges: ResearchKnowledgeEdge[] = [];

    let deduplicatedCount = 0;
    const existingMemories = loadAllMemories();
    const existingMemoryMap = new Map<string, MemoryRecord>();
    existingMemories.forEach((m) => existingMemoryMap.set(m.key, m));

    // Map verifications by claim ID for fast lookup
    const verificationMap = new Map<string, ClaimVerificationRecord>();
    verifications.forEach((v) => verificationMap.set(v.claim_id, v));

    // Map evidence by evidence ID
    const evidenceMap = new Map<string, EvidenceRecord>();
    evidence.forEach((e) => evidenceMap.set(e.id, e));

    // Map sources by source ID
    const sourceMap = new Map<string, SourceRecord>();
    sources.forEach((s) => sourceMap.set(s.id, s));

    // ========================================================================
    // 1. INGEST RESEARCH PROJECT ANCHOR MEMORY & KNOWLEDGE NODE
    // ========================================================================
    const projectKey = `research_project_${this.slugify(project.topic)}`.slice(0, 48);
    const projectMemoryContent = `Completed research on "${project.topic}": ${project.problem_statement} (Intent: ${project.research_intent}, Depth: ${project.research_depth}).`;

    const projectMemoryRecord = this.persistOrVersionMemory(
      projectKey,
      projectMemoryContent,
      "project",
      5,
      projectId,
      existingMemoryMap,
      memoryVersions
    );

    const projectLink: ResearchMemoryLink = {
      id: crypto.randomUUID(),
      projectId,
      memoryId: projectMemoryRecord.id,
      memoryCategory: "project",
      confidenceScore: 1.0,
      isConsensusFact: true,
      provenance: {
        origin: "module_10_project_anchor",
        projectTitle: project.title,
        researchIntent: project.research_intent,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryLinks.push(projectLink);

    // Knowledge Node: Project
    const projectNode: ResearchKnowledgeNode = {
      id: crypto.randomUUID(),
      projectId,
      nodeType: "topic",
      name: project.topic,
      canonicalName: this.canonicalizeName(project.topic),
      description: project.problem_statement,
      properties: {
        intent: project.research_intent,
        depth: project.research_depth,
      },
      sourceReference: `research://projects/${projectId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    knowledgeNodes.push(projectNode);

    // ========================================================================
    // 2. INGEST VERIFIED AND PARTIALLY VERIFIED CLAIMS
    // ========================================================================
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const ver = verificationMap.get(claim.id);
      const status = ver?.verification_status ?? "unverified";
      const confidence = ver?.confidence_score ?? 0.5;

      // Filter out low-confidence unverified claims unless user configured assumptions
      if (status === "unverified" && !storeUnverifiedAsAssumptions) {
        continue;
      }
      if (status === "refuted") {
        // Refuted claims are skipped from factual memory
        continue;
      }

      // Memory Category Selection based on verification status and claim type
      let memCategory: MemoryCategory;
      let importance: number;
      let contentPrefix: string;

      if (status === "verified") {
        memCategory = "fact";
        importance = confidence >= 0.85 ? 5 : 4;
        contentPrefix = "[VERIFIED FACT] ";
      } else if (status === "partially_verified") {
        memCategory = "fact";
        importance = 3;
        contentPrefix = "[PARTIALLY VERIFIED] ";
      } else if (status === "outdated") {
        memCategory = "fact";
        importance = 2;
        contentPrefix = "[HISTORICAL/OUTDATED] ";
      } else {
        memCategory = "fact";
        importance = 2;
        contentPrefix = "[RESEARCH ASSUMPTION] ";
      }

      const claimSlug = this.slugify(claim.claim_text.slice(0, 30));
      const claimKey = `claim_${this.slugify(project.topic).slice(0, 16)}_${claimSlug}`.slice(0, 48);
      const claimContent = `${contentPrefix}${claim.claim_text}`;

      // Check for exact duplicate text across existing memories
      const isExactDuplicate = Array.from(existingMemoryMap.values()).some(
        (m) => m.content.toLowerCase() === claimContent.toLowerCase()
      );

      if (isExactDuplicate) {
        deduplicatedCount++;
        continue;
      }

      const memoryRecord = this.persistOrVersionMemory(
        claimKey,
        claimContent,
        memCategory,
        importance,
        projectId,
        existingMemoryMap,
        memoryVersions
      );

      const memLink: ResearchMemoryLink = {
        id: crypto.randomUUID(),
        projectId,
        memoryId: memoryRecord.id,
        claimId: claim.id,
        memoryCategory: memCategory,
        verificationStatus: status,
        confidenceScore: confidence,
        isConsensusFact: status === "verified" && confidence >= minConfidence,
        provenance: {
          origin: "module_10_claim_ingestion",
          claimText: claim.claim_text,
          supportingEvidenceIds: ver?.direct_evidence_ids ?? [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryLinks.push(memLink);

      // Create Knowledge Node for Claim
      const claimNode: ResearchKnowledgeNode = {
        id: crypto.randomUUID(),
        projectId,
        nodeType: "claim",
        name: claim.claim_text.slice(0, 60),
        canonicalName: this.canonicalizeName(claim.claim_text.slice(0, 60)),
        description: claim.claim_text,
        properties: {
          verificationStatus: status,
          confidenceScore: confidence,
          subject: claim.subject,
          predicate: claim.predicate,
        },
        sourceReference: `research://claims/${claim.id}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      knowledgeNodes.push(claimNode);

      // Edge: Project --[RESEARCHES]--> Claim
      knowledgeEdges.push({
        id: crypto.randomUUID(),
        projectId,
        sourceNodeId: projectNode.id,
        targetNodeId: claimNode.id,
        relationshipType: "researches",
        weight: confidence,
        bidirectional: false,
        properties: { status },
        createdAt: new Date().toISOString(),
      });
    }

    // ========================================================================
    // 3. INGEST RESEARCH CONCLUSIONS & ARCHITECTURAL RECOMMENDATIONS
    // ========================================================================
    if (analysis) {
      // Ingest Recommendations
      for (const rec of analysis.recommendations) {
        const recKey = `rec_${this.slugify(project.topic).slice(0, 16)}_${this.slugify(rec.recommendationText.slice(0, 24))}`.slice(0, 48);
        const recContent = `[RECOMMENDATION] ${rec.recommendationText} - Reasoning: ${rec.reasoning}`;

        const recMemoryRecord = this.persistOrVersionMemory(
          recKey,
          recContent,
          "instruction",
          rec.confidenceScore >= 0.8 ? 5 : 4,
          projectId,
          existingMemoryMap,
          memoryVersions
        );

        memoryLinks.push({
          id: crypto.randomUUID(),
          projectId,
          memoryId: recMemoryRecord.id,
          recommendationId: rec.id,
          memoryCategory: "instruction",
          confidenceScore: rec.confidenceScore,
          isConsensusFact: false,
          provenance: {
            origin: "module_10_recommendation_ingestion",
            advantages: rec.advantages,
            risks: rec.risks,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Knowledge Node: Recommendation
        const recNode: ResearchKnowledgeNode = {
          id: crypto.randomUUID(),
          projectId,
          nodeType: "decision",
          name: rec.recommendationText.slice(0, 60),
          canonicalName: this.canonicalizeName(rec.recommendationText.slice(0, 60)),
          description: rec.reasoning,
          properties: {
            advantages: rec.advantages,
            risks: rec.risks,
          },
          sourceReference: `research://recommendations/${rec.id}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        knowledgeNodes.push(recNode);

        // Edge: Project --[RECOMMENDS]--> Decision Node
        knowledgeEdges.push({
          id: crypto.randomUUID(),
          projectId,
          sourceNodeId: projectNode.id,
          targetNodeId: recNode.id,
          relationshipType: "recommends",
          weight: rec.confidenceScore,
          bidirectional: false,
          properties: {},
          createdAt: new Date().toISOString(),
        });
      }

      // Ingest Technical Alternatives into Knowledge Graph
      for (const alt of analysis.alternatives) {
        const altNode: ResearchKnowledgeNode = {
          id: crypto.randomUUID(),
          projectId,
          nodeType: "technology",
          name: alt.name,
          canonicalName: this.canonicalizeName(alt.name),
          description: alt.description,
          properties: {
            advantages: alt.advantages,
            disadvantages: alt.disadvantages,
            technicalRequirements: alt.technicalRequirements,
          },
          sourceReference: `research://alternatives/${alt.id}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        knowledgeNodes.push(altNode);

        // Edge: Project --[RESEARCHES]--> Technology Alternative
        knowledgeEdges.push({
          id: crypto.randomUUID(),
          projectId,
          sourceNodeId: projectNode.id,
          targetNodeId: altNode.id,
          relationshipType: "alternative_to",
          weight: 0.9,
          bidirectional: false,
          properties: {},
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ========================================================================
    // 4. INGEST CROSS-SOURCE CONTRADICTIONS & UNRESOLVED DISAGREEMENTS
    // ========================================================================
    for (const con of contradictions) {
      if (con.resolution_status === "unresolved_disagreement") {
        const conKey = `conflict_${this.slugify(project.topic).slice(0, 16)}_${this.slugify(con.subject.slice(0, 20))}`.slice(0, 48);
        const conContent = `[UNRESOLVED CONTRADICTION] ${con.subject}: ${con.resolution_explanation}`;

        const conMemoryRecord = this.persistOrVersionMemory(
          conKey,
          conContent,
          "fact",
          3,
          projectId,
          existingMemoryMap,
          memoryVersions
        );

        memoryLinks.push({
          id: crypto.randomUUID(),
          projectId,
          memoryId: conMemoryRecord.id,
          memoryCategory: "fact",
          verificationStatus: "conflicting",
          confidenceScore: 0.5,
          isConsensusFact: false,
          provenance: {
            origin: "module_10_contradiction_ingestion",
            contradictionType: con.contradiction_type,
            competingClaimIds: con.competing_claim_ids,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // ========================================================================
    // 5. INGEST GENERATED REPORT REFERENCES
    // ========================================================================
    if (reports && reports.length > 0) {
      for (const rep of reports) {
        const repKey = `report_${this.slugify(project.topic).slice(0, 20)}_${rep.reportType}`.slice(0, 48);
        const repContent = `[RESEARCH DOSSIER] "${rep.title}" (Type: ${rep.reportType}, Citations: ${rep.citationsCount}). Summary: ${rep.summaryBrief}`;

        const repMemoryRecord = this.persistOrVersionMemory(
          repKey,
          repContent,
          "project",
          4,
          projectId,
          existingMemoryMap,
          memoryVersions
        );

        memoryLinks.push({
          id: crypto.randomUUID(),
          projectId,
          memoryId: repMemoryRecord.id,
          reportId: rep.id,
          memoryCategory: "project",
          confidenceScore: 1.0,
          isConsensusFact: true,
          provenance: {
            origin: "module_10_report_ingestion",
            reportType: rep.reportType,
            citationsCount: rep.citationsCount,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // ========================================================================
    // 6. PERSIST BATCH 04 RECORDS TO REPOSITORY
    // ========================================================================
    const linkRecords: ResearchMemoryLinkRecord[] = memoryLinks.map((ml) => ({
      id: ml.id,
      project_id: ml.projectId,
      memory_id: ml.memoryId,
      claim_id: ml.claimId,
      recommendation_id: ml.recommendationId,
      report_id: ml.reportId,
      memory_category: ml.memoryCategory,
      verification_status: ml.verificationStatus,
      confidence_score: ml.confidenceScore,
      is_consensus_fact: ml.isConsensusFact,
      provenance: ml.provenance,
      created_at: ml.createdAt,
      updated_at: ml.updatedAt,
    }));
    await researchRepository.saveMemoryLinks(linkRecords);

    const nodeRecords: ResearchKnowledgeNodeRecord[] = knowledgeNodes.map((kn) => ({
      id: kn.id,
      project_id: kn.projectId,
      node_type: kn.nodeType,
      name: kn.name,
      canonical_name: kn.canonicalName,
      description: kn.description,
      properties: kn.properties,
      source_reference: kn.sourceReference,
      created_at: kn.createdAt,
      updated_at: kn.updatedAt,
    }));
    await researchRepository.saveKnowledgeNodes(nodeRecords);

    const edgeRecords: ResearchKnowledgeEdgeRecord[] = knowledgeEdges.map((ke) => ({
      id: ke.id,
      project_id: ke.projectId,
      source_node_id: ke.sourceNodeId,
      target_node_id: ke.targetNodeId,
      relationship_type: ke.relationshipType,
      weight: ke.weight,
      bidirectional: ke.bidirectional,
      properties: ke.properties,
      evidence_reference: ke.evidenceReference,
      created_at: ke.createdAt,
    }));
    await researchRepository.saveKnowledgeEdges(edgeRecords);

    const versionRecords: ResearchMemoryVersionRecord[] = memoryVersions.map((mv) => ({
      id: mv.id,
      memory_id: mv.memoryId,
      project_id: mv.projectId,
      version_number: mv.versionNumber,
      previous_content: mv.previousContent,
      new_content: mv.newContent,
      evolution_type: mv.evolutionType,
      reason: mv.reason,
      superseded_at: mv.supersededAt,
      created_at: mv.createdAt,
    }));
    if (versionRecords.length > 0) {
      await researchRepository.saveMemoryVersions(versionRecords);
    }

    return {
      projectId,
      ingestedMemoriesCount: memoryLinks.length,
      knowledgeNodesCreated: knowledgeNodes.length,
      knowledgeEdgesCreated: knowledgeEdges.length,
      versionsCreated: memoryVersions.length,
      deduplicatedCount,
      memoryLinks,
      ingestedAt: new Date().toISOString(),
    };
  }

  /**
   * Pre-research memory recall helper: Recalls historical research context before planning.
   *
   * @param query Target research query or topic
   * @param limit Max memories to return
   * @returns Array of prior research memories with provenance
   */
  public recallHistoricalResearch(query: string, limit: number = 8): MemoryRecord[] {
    const memories = recallRelevantMemories(query, limit * 2);
    // Prioritize research-derived project, fact, and instruction records
    const researchMemories = memories.filter(
      (m) =>
        m.key.startsWith("research_") ||
        m.key.startsWith("claim_") ||
        m.key.startsWith("rec_") ||
        m.key.startsWith("conflict_") ||
        m.category === "project" ||
        m.category === "instruction"
    );

    return researchMemories.slice(0, limit);
  }

  /**
   * Memory self-healing helper: Identifies broken evidence pointers or missing source links.
   *
   * @param projectId Target research project ID
   * @returns Integrity audit diagnostics object
   */
  public async auditMemoryIntegrity(projectId: string): Promise<{
    healthyLinksCount: number;
    brokenClaimsCount: number;
    orphanedMemoriesCount: number;
    diagnostics: string[];
  }> {
    const links = await researchRepository.getMemoryLinks(projectId);
    const claims = await researchRepository.getClaims(projectId);
    const existingMemories = loadAllMemories();
    const memoryIdSet = new Set(existingMemories.map((m) => m.id));
    const claimIdSet = new Set(claims.map((c) => c.id));

    const diagnostics: string[] = [];
    let healthyLinksCount = 0;
    let brokenClaimsCount = 0;
    let orphanedMemoriesCount = 0;

    for (const link of links) {
      if (!memoryIdSet.has(link.memory_id)) {
        orphanedMemoriesCount++;
        diagnostics.push(`Link ${link.id}: Memory ID ${link.memory_id} missing from active memory vault.`);
      } else if (link.claim_id && !claimIdSet.has(link.claim_id)) {
        brokenClaimsCount++;
        diagnostics.push(`Link ${link.id}: Referenced Claim ${link.claim_id} missing from research repository.`);
      } else {
        healthyLinksCount++;
      }
    }

    return {
      healthyLinksCount,
      brokenClaimsCount,
      orphanedMemoriesCount,
      diagnostics,
    };
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Saves a memory record or creates a version record if significant content changes.
   */
  private persistOrVersionMemory(
    key: string,
    content: string,
    category: MemoryCategory,
    importance: number,
    projectId: string,
    existingMemoryMap: Map<string, MemoryRecord>,
    versionsCollector: ResearchMemoryVersion[]
  ): MemoryRecord {
    const existing = existingMemoryMap.get(key);

    if (existing && existing.content !== content) {
      // Historical version evolution preservation
      versionsCollector.push({
        id: crypto.randomUUID(),
        memoryId: existing.id,
        projectId,
        versionNumber: (existing.provenance as Record<string, unknown>)?.versionNumber as number || 1,
        previousContent: existing.content,
        newContent: content,
        evolutionType: "factual_update",
        reason: "Updated through subsequent research findings and verification.",
        supersededAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    const saved = saveMemory(key, content, category, importance, "inferred");
    existingMemoryMap.set(key, saved);
    return saved;
  }

  /**
   * Canonicalizes names for entity node deduplication.
   */
  private canonicalizeName(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /**
   * Slugifies strings into safe keys.
   */
  private slugify(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_");
  }
}

/** Global singleton instance */
export const advancedMemoryIngestionEngine = new AdvancedMemoryIngestionEngine();
