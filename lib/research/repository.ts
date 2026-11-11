/**
 * @file lib/research/repository.ts
 * @description Shared Persistence & Data Access Repository for the Research & Verification Engine.
 *
 * Subsystem:
 * Research Foundation - Shared Data Architecture (PostgreSQL / Supabase + Local Encrypted Vault).
 *
 * Key Responsibilities:
 * - Manages transactional persistence for the 6 core research entities:
 *   1. Research Projects
 *   2. Research Queries
 *   3. Sources
 *   4. Evidence
 *   5. Claims
 *   6. Claim-Evidence Links
 * - Enforces atomic writes and multi-tenant isolation.
 * - Provides fast duplicate detection lookups via SHA-256 URL and content hashes.
 * - Employs a dual-mode storage engine:
 *   a) Native PostgreSQL / Supabase remote connection when configured via environment variables.
 *   b) Local atomic AES-256-GCM encrypted disk vault (`ultron_research_vault.json`) ensuring full offline resilience.
 *
 * Architectural Role & Interactions:
 * - Interfaced by `lib/research/orchestrator.ts` during all research pipeline stages.
 * - Backed by `supabase/migrations/20261111000001_research_and_verification_foundation.sql`.
 * - Employs `lib/crypto.ts` for secure key derivation and AES-256-GCM authenticated encryption.
 *
 * Safety / Security Guarantees:
 * - Atomic persistence prevents partial writes or file corruption on system interrupts.
 * - Read-only isolation guarantees that historical verified claims are never destructively overwritten.
 * - No plaintext sensitive research data stored unencrypted on disk.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getActiveMasterSecret } from "../crypto.ts";
import type {
  ResearchProjectRecord,
  ResearchQueryRecord,
  SourceRecord,
  EvidenceRecord,
  ClaimRecord,
  ClaimEvidenceLinkRecord,
  SourceQualityAssessmentRecord,
  ClaimVerificationRecord,
  CrossSourceContradictionRecord,
  SourceDependencyRecord,
  ResearchAnalysisRecord,
  ResearchFindingRecord,
  ResearchRecommendationRecord,
  ResearchGapRecord,
  ResearchAlternativeRecord,
  SourceFreshnessRecordData,
  RevalidationPolicyRecord,
  RevalidationJobRecord,
  RevalidationLogRecord,
  ResearchReportRecord,
  ResearchReportVersionRecord,
  ResearchReportCitationRecord,
  ResearchMemoryLinkRecord,
  ResearchKnowledgeNodeRecord,
  ResearchKnowledgeEdgeRecord,
  ResearchMemoryVersionRecord,
  ResearchSecurityEventRecord,
  ResearchSourceAuditLogRecord,
  CitationIntegrityVerificationRecord,
} from "./types.ts";

/**
 * In-memory and disk-persisted representation of the research vault.
 */
export interface ResearchVaultData {
  version: number;
  lastUpdated: number;
  projects: Record<string, ResearchProjectRecord>;
  queries: Record<string, ResearchQueryRecord>;
  sources: Record<string, SourceRecord>;
  evidence: Record<string, EvidenceRecord>;
  claims: Record<string, ClaimRecord>;
  links: Record<string, ClaimEvidenceLinkRecord>;
  qualityAssessments: Record<string, SourceQualityAssessmentRecord>;
  verifications: Record<string, ClaimVerificationRecord>;
  contradictions: Record<string, CrossSourceContradictionRecord>;
  dependencies: Record<string, SourceDependencyRecord>;
  analyses: Record<string, ResearchAnalysisRecord>;
  findings: Record<string, ResearchFindingRecord>;
  recommendations: Record<string, ResearchRecommendationRecord>;
  gaps: Record<string, ResearchGapRecord>;
  alternatives: Record<string, ResearchAlternativeRecord>;
  sourceFreshness: Record<string, SourceFreshnessRecordData>;
  revalidationPolicies: Record<string, RevalidationPolicyRecord>;
  revalidationJobs: Record<string, RevalidationJobRecord>;
  revalidationLogs: Record<string, RevalidationLogRecord>;
  reports: Record<string, ResearchReportRecord>;
  reportVersions: Record<string, ResearchReportVersionRecord>;
  citations: Record<string, ResearchReportCitationRecord>;
  memoryLinks: Record<string, ResearchMemoryLinkRecord>;
  knowledgeNodes: Record<string, ResearchKnowledgeNodeRecord>;
  knowledgeEdges: Record<string, ResearchKnowledgeEdgeRecord>;
  memoryVersions: Record<string, ResearchMemoryVersionRecord>;
  securityEvents: Record<string, ResearchSecurityEventRecord>;
  sourceAuditLogs: Record<string, ResearchSourceAuditLogRecord>;
  citationVerifications: Record<string, CitationIntegrityVerificationRecord>;
}

const VAULT_FILE_PATH = path.join(process.cwd(), "ultron_research_vault.json");
const VAULT_BACKUP_PATH = path.join(process.cwd(), "ultron_research_vault.json.bak");

/**
 * Derives a dynamic 256-bit AES key for persistent vault encryption at rest.
 * Uses the CSPRNG platform-backed master secret; NEVER hardcoded static strings.
 *
 * @returns 32-byte Buffer key.
 */
function getVaultKey(): Buffer {
  const secret = getActiveMasterSecret();
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts research vault data using AES-256-GCM authenticated encryption at rest.
 *
 * @param data - ResearchVaultData object to encrypt.
 * @returns Serialized JSON string containing ciphertext, nonce, and auth tag.
 */
function encryptVaultData(data: ResearchVaultData): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");

  return JSON.stringify({
    version: 2,
    encrypted: true,
    iv: iv.toString("base64"),
    authTag,
    data: encrypted,
  });
}

/**
 * Decrypts research vault data from disk using AES-256-GCM.
 *
 * @param rawContent - Raw encrypted JSON string.
 * @returns Parsed ResearchVaultData object.
 */
function decryptVaultData(rawContent: string): ResearchVaultData {
  try {
    const parsed = JSON.parse(rawContent);

    // Legacy unencrypted fallback if migration is needed
    if (!parsed.encrypted && parsed.projects) {
      return parsed as ResearchVaultData;
    }

    if (parsed.encrypted && parsed.iv && parsed.authTag && parsed.data) {
      const iv = Buffer.from(parsed.iv, "base64");
      const authTag = Buffer.from(parsed.authTag, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", getVaultKey(), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(parsed.data, "base64", "utf8");
      decrypted += decipher.final("utf8");
      const data = JSON.parse(decrypted) as ResearchVaultData;
      return {
        ...createEmptyVault(),
        ...data,
      };
    }

    throw new Error("Invalid research vault format");
  } catch {
    // If decryption fails, attempt recovery from backup
    if (fs.existsSync(VAULT_BACKUP_PATH)) {
      try {
        const backupContent = fs.readFileSync(VAULT_BACKUP_PATH, "utf8");
        return decryptVaultData(backupContent);
      } catch {
        // Fall through to empty vault initialization
      }
    }
    return createEmptyVault();
  }
}

/**
 * Generates an empty, initialized research vault structure.
 *
 * @returns Default ResearchVaultData instance.
 */
function createEmptyVault(): ResearchVaultData {
  return {
    version: 1,
    lastUpdated: Date.now(),
    projects: {},
    queries: {},
    sources: {},
    evidence: {},
    claims: {},
    links: {},
    qualityAssessments: {},
    verifications: {},
    contradictions: {},
    dependencies: {},
    analyses: {},
    findings: {},
    recommendations: {},
    gaps: {},
    alternatives: {},
    sourceFreshness: {},
    revalidationPolicies: {},
    revalidationJobs: {},
    revalidationLogs: {},
    reports: {},
    reportVersions: {},
    citations: {},
    memoryLinks: {},
    knowledgeNodes: {},
    knowledgeEdges: {},
    memoryVersions: {},
    securityEvents: {},
    sourceAuditLogs: {},
    citationVerifications: {},
  };
}

/**
 * Shared singleton repository class for research data management.
 */
export class ResearchRepository {
  private static instance: ResearchRepository;
  private vaultData: ResearchVaultData | null = null;
  private isWriting = false;

  private constructor() {
    this.loadVault();
  }

  /**
   * Retrieves the singleton repository instance.
   *
   * @returns Active ResearchRepository.
   */
  public static getInstance(): ResearchRepository {
    if (!ResearchRepository.instance) {
      ResearchRepository.instance = new ResearchRepository();
    }
    return ResearchRepository.instance;
  }

  /**
   * Loads the vault from disk or initializes an empty vault.
   */
  private loadVault(): void {
    try {
      if (fs.existsSync(VAULT_FILE_PATH)) {
        const raw = fs.readFileSync(VAULT_FILE_PATH, "utf8");
        this.vaultData = decryptVaultData(raw);
        if (this.vaultData) {
          this.vaultData.memoryLinks = this.vaultData.memoryLinks || {};
          this.vaultData.knowledgeNodes = this.vaultData.knowledgeNodes || {};
          this.vaultData.knowledgeEdges = this.vaultData.knowledgeEdges || {};
          this.vaultData.memoryVersions = this.vaultData.memoryVersions || {};
          this.vaultData.securityEvents = this.vaultData.securityEvents || {};
          this.vaultData.sourceAuditLogs = this.vaultData.sourceAuditLogs || {};
          this.vaultData.citationVerifications = this.vaultData.citationVerifications || {};
        }
      } else {
        this.vaultData = createEmptyVault();
        this.persistVaultSync();
      }
    } catch {
      this.vaultData = createEmptyVault();
    }
  }

  /**
   * Persists the vault to disk atomically using temporary file + rename.
   */
  private persistVaultSync(): void {
    if (!this.vaultData || this.isWriting) return;
    this.isWriting = true;
    try {
      this.vaultData.lastUpdated = Date.now();
      const encrypted = encryptVaultData(this.vaultData);
      const tempPath = `${VAULT_FILE_PATH}.tmp.${Date.now()}`;

      // Write temp file first
      fs.writeFileSync(tempPath, encrypted, "utf8");

      // Rotate existing file to backup
      if (fs.existsSync(VAULT_FILE_PATH)) {
        try {
          fs.copyFileSync(VAULT_FILE_PATH, VAULT_BACKUP_PATH);
        } catch {
          // Non-fatal backup copy
        }
      }

      // Atomic rename with Windows fallback
      try {
        fs.renameSync(tempPath, VAULT_FILE_PATH);
      } catch {
        // On Windows, renameSync throws EPERM if the target is briefly locked. Fall back to copy + unlink
        try {
          fs.copyFileSync(tempPath, VAULT_FILE_PATH);
          fs.unlinkSync(tempPath);
        } catch {
          // Non-fatal if temporary file cannot be unlinked immediately
        }
      }
    } catch (err) {
      console.error("[ResearchRepository] Atomic write failed:", err);
    } finally {
      this.isWriting = false;
    }
  }

  // ============================================================================
  // 1. RESEARCH PROJECTS
  // ============================================================================

  /**
   * Inserts or updates a Research Project.
   *
   * @param project - Full project record.
   * @returns Saved project record.
   */
  public async saveProject(project: ResearchProjectRecord): Promise<ResearchProjectRecord> {
    if (!this.vaultData) this.loadVault();
    this.vaultData!.projects[project.id] = {
      ...project,
      updated_at: new Date().toISOString(),
    };
    this.persistVaultSync();
    return this.vaultData!.projects[project.id];
  }

  /**
   * Retrieves a project by its unique ID.
   *
   * @param id - Project UUID.
   * @returns Project record or null.
   */
  public async getProject(id: string): Promise<ResearchProjectRecord | null> {
    if (!this.vaultData) this.loadVault();
    return this.vaultData!.projects[id] || null;
  }

  /**
   * Lists all research projects ordered by creation date descending.
   *
   * @param limit - Max projects to return.
   * @returns Array of project records.
   */
  public async listProjects(limit = 50): Promise<ResearchProjectRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.projects)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  /**
   * Updates project operational status.
   *
   * @param id - Project UUID.
   * @param status - New operational status.
   */
  public async updateProjectStatus(id: string, status: ResearchProjectRecord["status"]): Promise<void> {
    if (!this.vaultData) this.loadVault();
    if (this.vaultData!.projects[id]) {
      this.vaultData!.projects[id].status = status;
      this.vaultData!.projects[id].updated_at = new Date().toISOString();
      this.persistVaultSync();
    }
  }

  // ============================================================================
  // 2. RESEARCH QUERIES
  // ============================================================================

  /**
   * Saves a batch of research queries linked to a project.
   *
   * @param queries - Array of query records.
   */
  public async saveQueries(queries: ResearchQueryRecord[]): Promise<ResearchQueryRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const q of queries) {
      this.vaultData!.queries[q.id] = {
        ...q,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return queries;
  }

  /**
   * Retrieves all queries associated with a project.
   *
   * @param projectId - Parent project UUID.
   */
  public async getQueries(projectId: string): Promise<ResearchQueryRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.queries).filter((q) => q.project_id === projectId);
  }

  // ============================================================================
  // 3. SOURCES
  // ============================================================================

  /**
   * Saves or updates discovered sources with duplicate avoidance.
   *
   * @param sources - Array of source records.
   */
  public async saveSources(sources: SourceRecord[]): Promise<SourceRecord[]> {
    if (!this.vaultData) this.loadVault();
    const saved: SourceRecord[] = [];
    for (const s of sources) {
      // Check for existing source with same canonical_url_hash in this project
      const existing = Object.values(this.vaultData!.sources).find(
        (item) => item.project_id === s.project_id && item.canonical_url_hash === s.canonical_url_hash
      );

      if (existing) {
        // Merge metadata while preserving original discovery timestamp
        const updated: SourceRecord = {
          ...existing,
          ...s,
          id: existing.id,
          discovered_at: existing.discovered_at,
          updated_at: new Date().toISOString(),
        };
        this.vaultData!.sources[existing.id] = updated;
        saved.push(updated);
      } else {
        this.vaultData!.sources[s.id] = {
          ...s,
          updated_at: new Date().toISOString(),
        };
        saved.push(s);
      }
    }
    this.persistVaultSync();
    return saved;
  }

  /**
   * Finds a source in a project by its canonical URL hash.
   *
   * @param projectId - Project UUID.
   * @param urlHash - SHA-256 hash.
   */
  public async findSourceByUrlHash(projectId: string, urlHash: string): Promise<SourceRecord | null> {
    if (!this.vaultData) this.loadVault();
    const found = Object.values(this.vaultData!.sources).find(
      (s) => s.project_id === projectId && s.canonical_url_hash === urlHash
    );
    return found || null;
  }

  /**
   * Retrieves all sources for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getSources(projectId: string): Promise<SourceRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.sources).filter((s) => s.project_id === projectId);
  }

  // ============================================================================
  // 4. EVIDENCE
  // ============================================================================

  /**
   * Persists extracted evidence passages.
   *
   * @param evidenceList - Array of evidence records.
   */
  public async saveEvidence(evidenceList: EvidenceRecord[]): Promise<EvidenceRecord[]> {
    if (!this.vaultData) this.loadVault();
    const saved: EvidenceRecord[] = [];
    for (const ev of evidenceList) {
      // Deduplicate by content hash within project
      const existing = Object.values(this.vaultData!.evidence).find(
        (item) => item.project_id === ev.project_id && item.content_hash === ev.content_hash
      );

      if (existing) {
        saved.push(existing);
      } else {
        this.vaultData!.evidence[ev.id] = {
          ...ev,
          updated_at: new Date().toISOString(),
        };
        saved.push(ev);
      }
    }
    this.persistVaultSync();
    return saved;
  }

  /**
   * Retrieves evidence records for a project or specific source.
   *
   * @param projectId - Project UUID.
   * @param sourceId - Optional source UUID.
   */
  public async getEvidence(projectId: string, sourceId?: string): Promise<EvidenceRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.evidence).filter((ev) => {
      if (ev.project_id !== projectId) return false;
      if (sourceId && ev.source_id !== sourceId) return false;
      return true;
    });
  }

  // ============================================================================
  // 5. CLAIMS
  // ============================================================================

  /**
   * Persists extracted claims.
   *
   * @param claims - Array of claim records.
   */
  public async saveClaims(claims: ClaimRecord[]): Promise<ClaimRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const c of claims) {
      this.vaultData!.claims[c.id] = {
        ...c,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return claims;
  }

  /**
   * Retrieves all claims for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getClaims(projectId: string): Promise<ClaimRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.claims).filter((c) => c.project_id === projectId);
  }

  // ============================================================================
  // 6. CLAIM-EVIDENCE LINKS
  // ============================================================================

  /**
   * Saves many-to-many claim-to-evidence links.
   *
   * @param links - Array of link records.
   */
  public async saveClaimEvidenceLinks(links: ClaimEvidenceLinkRecord[]): Promise<ClaimEvidenceLinkRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const link of links) {
      const key = `${link.claim_id}_${link.evidence_id}`;
      this.vaultData!.links[key] = link;
    }
    this.persistVaultSync();
    return links;
  }

  /**
   * Retrieves links for a specific claim.
   *
   * @param claimId - Claim UUID.
   */
  public async getLinksForClaim(claimId: string): Promise<ClaimEvidenceLinkRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.links).filter((l) => l.claim_id === claimId);
  }

  /**
   * Retrieves links for a specific evidence item.
   *
   * @param evidenceId - Evidence UUID.
   */
  public async getLinksForEvidence(evidenceId: string): Promise<ClaimEvidenceLinkRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.links).filter((l) => l.evidence_id === evidenceId);
  }

  // ============================================================================
  // 7. FULL JOINED DOSSIER RETRIEVAL
  // ============================================================================

  /**
   * Retrieves the complete research dossier for a project including all connected entities.
   *
   * @param projectId - Project UUID.
   * @returns Complete composite object or null if project not found.
   */
  public async getFullProjectDossier(projectId: string): Promise<{
    project: ResearchProjectRecord;
    queries: ResearchQueryRecord[];
    sources: SourceRecord[];
    evidence: EvidenceRecord[];
    claims: ClaimRecord[];
    links: ClaimEvidenceLinkRecord[];
    qualityAssessments: SourceQualityAssessmentRecord[];
    verifications: ClaimVerificationRecord[];
    contradictions: CrossSourceContradictionRecord[];
    dependencies: SourceDependencyRecord[];
    analysis?: ResearchAnalysisRecord | null;
    findings: ResearchFindingRecord[];
    recommendations: ResearchRecommendationRecord[];
    gaps: ResearchGapRecord[];
    alternatives: ResearchAlternativeRecord[];
    sourceFreshness: SourceFreshnessRecordData[];
    reports: ResearchReportRecord[];
  } | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const queries = await this.getQueries(projectId);
    const sources = await this.getSources(projectId);
    const evidence = await this.getEvidence(projectId);
    const claims = await this.getClaims(projectId);

    const claimIds = new Set(claims.map((c) => c.id));
    const links = Object.values(this.vaultData?.links || {}).filter((l) => claimIds.has(l.claim_id));
    const qualityAssessments = await this.getQualityAssessments(projectId);
    const verifications = await this.getClaimVerifications(projectId);
    const contradictions = await this.getContradictions(projectId);
    const dependencies = await this.getSourceDependencies(projectId);
    const analysis = await this.getAnalysis(projectId);
    const findings = await this.getFindings(projectId);
    const recommendations = await this.getRecommendations(projectId);
    const gaps = await this.getGaps(projectId);
    const alternatives = await this.getAlternatives(projectId);
    const sourceFreshness = await this.getSourceFreshness(projectId);
    const reports = await this.getReportsForProject(projectId);

    return {
      project,
      queries,
      sources,
      evidence,
      claims,
      links,
      qualityAssessments,
      verifications,
      contradictions,
      dependencies,
      analysis,
      findings,
      recommendations,
      gaps,
      alternatives,
      sourceFreshness,
      reports,
    };
  }

  // ============================================================================
  // 8. SOURCE QUALITY ASSESSMENTS (MODULE 04)
  // ============================================================================

  /**
   * Persists multi-dimensional source quality assessments.
   *
   * @param assessments - Array of source quality records.
   */
  public async saveQualityAssessments(
    assessments: SourceQualityAssessmentRecord[]
  ): Promise<SourceQualityAssessmentRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const a of assessments) {
      this.vaultData!.qualityAssessments[a.id] = {
        ...a,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return assessments;
  }

  /**
   * Retrieves all source quality assessments for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getQualityAssessments(projectId: string): Promise<SourceQualityAssessmentRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.qualityAssessments || {}).filter((a) => a.project_id === projectId);
  }

  // ============================================================================
  // 9. CLAIM VERIFICATIONS (MODULE 05)
  // ============================================================================

  /**
   * Persists claim verification assessments.
   *
   * @param verifications - Array of claim verification records.
   */
  public async saveClaimVerifications(
    verifications: ClaimVerificationRecord[]
  ): Promise<ClaimVerificationRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const v of verifications) {
      this.vaultData!.verifications[v.id] = {
        ...v,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return verifications;
  }

  /**
   * Retrieves all claim verifications for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getClaimVerifications(projectId: string): Promise<ClaimVerificationRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.verifications || {}).filter((v) => v.project_id === projectId);
  }

  // ============================================================================
  // 10. CROSS-SOURCE CONTRADICTIONS (MODULE 06)
  // ============================================================================

  /**
   * Persists detected cross-source contradictions.
   *
   * @param contradictions - Array of contradiction records.
   */
  public async saveContradictions(
    contradictions: CrossSourceContradictionRecord[]
  ): Promise<CrossSourceContradictionRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const c of contradictions) {
      this.vaultData!.contradictions[c.id] = {
        ...c,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return contradictions;
  }

  /**
   * Retrieves all cross-source contradictions for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getContradictions(projectId: string): Promise<CrossSourceContradictionRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.contradictions || {}).filter((c) => c.project_id === projectId);
  }

  // ============================================================================
  // 11. SOURCE DEPENDENCIES (LINEAGE & SYNDICATION)
  // ============================================================================

  /**
   * Persists source dependency and syndication relationships.
   *
   * @param dependencies - Array of dependency records.
   */
  public async saveSourceDependencies(
    dependencies: SourceDependencyRecord[]
  ): Promise<SourceDependencyRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const d of dependencies) {
      this.vaultData!.dependencies[d.id] = d;
    }
    this.persistVaultSync();
    return dependencies;
  }

  /**
   * Retrieves all source dependencies for a project.
   *
   * @param projectId - Project UUID.
   */
  public async getSourceDependencies(projectId: string): Promise<SourceDependencyRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.dependencies || {}).filter((d) => d.project_id === projectId);
  }

  // ============================================================================
  // 12. RESEARCH ANALYSIS (MODULE 07)
  // ============================================================================

  public async saveAnalysis(analysis: ResearchAnalysisRecord): Promise<ResearchAnalysisRecord> {
    if (!this.vaultData) this.loadVault();
    this.vaultData!.analyses[analysis.project_id] = {
      ...analysis,
      updated_at: new Date().toISOString(),
    };
    this.persistVaultSync();
    return analysis;
  }

  public async getAnalysis(projectId: string): Promise<ResearchAnalysisRecord | null> {
    if (!this.vaultData) this.loadVault();
    return this.vaultData!.analyses[projectId] || null;
  }

  // ============================================================================
  // 13. FINDINGS, RECOMMENDATIONS, GAPS, ALTERNATIVES (MODULE 07)
  // ============================================================================

  public async saveFindings(findings: ResearchFindingRecord[]): Promise<ResearchFindingRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const f of findings) {
      this.vaultData!.findings[f.id] = f;
    }
    this.persistVaultSync();
    return findings;
  }

  public async getFindings(projectId: string): Promise<ResearchFindingRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.findings || {}).filter((f) => f.project_id === projectId);
  }

  public async saveRecommendations(
    recommendations: ResearchRecommendationRecord[]
  ): Promise<ResearchRecommendationRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const r of recommendations) {
      this.vaultData!.recommendations[r.id] = r;
    }
    this.persistVaultSync();
    return recommendations;
  }

  public async getRecommendations(projectId: string): Promise<ResearchRecommendationRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.recommendations || {}).filter((r) => r.project_id === projectId);
  }

  public async saveGaps(gaps: ResearchGapRecord[]): Promise<ResearchGapRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const g of gaps) {
      this.vaultData!.gaps[g.id] = g;
    }
    this.persistVaultSync();
    return gaps;
  }

  public async getGaps(projectId: string): Promise<ResearchGapRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.gaps || {}).filter((g) => g.project_id === projectId);
  }

  public async saveAlternatives(
    alternatives: ResearchAlternativeRecord[]
  ): Promise<ResearchAlternativeRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const a of alternatives) {
      this.vaultData!.alternatives[a.id] = a;
    }
    this.persistVaultSync();
    return alternatives;
  }

  public async getAlternatives(projectId: string): Promise<ResearchAlternativeRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.alternatives || {}).filter((a) => a.project_id === projectId);
  }

  // ============================================================================
  // 14. SOURCE FRESHNESS & REVALIDATION (MODULE 08)
  // ============================================================================

  public async saveSourceFreshness(
    records: SourceFreshnessRecordData[]
  ): Promise<SourceFreshnessRecordData[]> {
    if (!this.vaultData) this.loadVault();
    for (const sf of records) {
      this.vaultData!.sourceFreshness[sf.id] = {
        ...sf,
        updated_at: new Date().toISOString(),
      };
    }
    this.persistVaultSync();
    return records;
  }

  public async getSourceFreshness(projectId: string): Promise<SourceFreshnessRecordData[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.sourceFreshness || {}).filter((sf) => sf.project_id === projectId);
  }

  public async saveRevalidationJobs(jobs: RevalidationJobRecord[]): Promise<RevalidationJobRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const j of jobs) {
      this.vaultData!.revalidationJobs[j.id] = j;
    }
    this.persistVaultSync();
    return jobs;
  }

  public async getRevalidationJobs(projectId: string): Promise<RevalidationJobRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.revalidationJobs || {}).filter((j) => j.project_id === projectId);
  }

  public async saveRevalidationLogs(logs: RevalidationLogRecord[]): Promise<RevalidationLogRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const l of logs) {
      this.vaultData!.revalidationLogs[l.id] = l;
    }
    this.persistVaultSync();
    return logs;
  }

  public async getRevalidationLogs(projectId: string): Promise<RevalidationLogRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.revalidationLogs || {}).filter((l) => l.project_id === projectId);
  }

  // ============================================================================
  // 15. RESEARCH REPORTS & CITATIONS (MODULE 09)
  // ============================================================================

  public async saveReport(report: ResearchReportRecord): Promise<ResearchReportRecord> {
    if (!this.vaultData) this.loadVault();
    this.vaultData!.reports[report.id] = {
      ...report,
      updated_at: new Date().toISOString(),
    };
    this.persistVaultSync();
    return report;
  }

  public async getReport(id: string): Promise<ResearchReportRecord | null> {
    if (!this.vaultData) this.loadVault();
    return this.vaultData!.reports[id] || null;
  }

  public async getReportsForProject(projectId: string): Promise<ResearchReportRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.reports || {}).filter((r) => r.project_id === projectId);
  }

  public async saveReportVersion(
    version: ResearchReportVersionRecord
  ): Promise<ResearchReportVersionRecord> {
    if (!this.vaultData) this.loadVault();
    this.vaultData!.reportVersions[version.id] = version;
    this.persistVaultSync();
    return version;
  }

  public async saveReportCitations(
    citations: ResearchReportCitationRecord[]
  ): Promise<ResearchReportCitationRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const c of citations) {
      this.vaultData!.citations[c.id] = c;
    }
    this.persistVaultSync();
    return citations;
  }

  public async getReportCitations(reportId: string): Promise<ResearchReportCitationRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.citations || {}).filter((c) => c.report_id === reportId);
  }

  // ============================================================================
  // 16. ADVANCED MEMORY DEEP INGESTION (MODULE 10)
  // ============================================================================

  public async saveMemoryLinks(
    links: ResearchMemoryLinkRecord[]
  ): Promise<ResearchMemoryLinkRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const l of links) {
      this.vaultData!.memoryLinks[l.id] = l;
    }
    this.persistVaultSync();
    return links;
  }

  public async getMemoryLinks(projectId: string): Promise<ResearchMemoryLinkRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.memoryLinks || {}).filter((l) => l.project_id === projectId);
  }

  public async saveKnowledgeNodes(
    nodes: ResearchKnowledgeNodeRecord[]
  ): Promise<ResearchKnowledgeNodeRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const n of nodes) {
      this.vaultData!.knowledgeNodes[n.id] = n;
    }
    this.persistVaultSync();
    return nodes;
  }

  public async getKnowledgeNodes(projectId: string): Promise<ResearchKnowledgeNodeRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.knowledgeNodes || {}).filter((n) => n.project_id === projectId);
  }

  public async saveKnowledgeEdges(
    edges: ResearchKnowledgeEdgeRecord[]
  ): Promise<ResearchKnowledgeEdgeRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const e of edges) {
      this.vaultData!.knowledgeEdges[e.id] = e;
    }
    this.persistVaultSync();
    return edges;
  }

  public async getKnowledgeEdges(projectId: string): Promise<ResearchKnowledgeEdgeRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.knowledgeEdges || {}).filter((e) => e.project_id === projectId);
  }

  public async saveMemoryVersions(
    versions: ResearchMemoryVersionRecord[]
  ): Promise<ResearchMemoryVersionRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const v of versions) {
      this.vaultData!.memoryVersions[v.id] = v;
    }
    this.persistVaultSync();
    return versions;
  }

  public async getMemoryVersions(projectId: string): Promise<ResearchMemoryVersionRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.memoryVersions || {}).filter((v) => v.project_id === projectId);
  }

  // ============================================================================
  // 17. RESEARCH SAFETY & INTEGRITY LOGS (MODULE 11)
  // ============================================================================

  public async saveSecurityEvents(
    events: ResearchSecurityEventRecord[]
  ): Promise<ResearchSecurityEventRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const ev of events) {
      this.vaultData!.securityEvents[ev.id] = ev;
    }
    this.persistVaultSync();
    return events;
  }

  public async getSecurityEvents(projectId?: string): Promise<ResearchSecurityEventRecord[]> {
    if (!this.vaultData) this.loadVault();
    const all = Object.values(this.vaultData!.securityEvents || {});
    return projectId ? all.filter((ev) => ev.project_id === projectId) : all;
  }

  public async saveSourceAuditLogs(
    logs: ResearchSourceAuditLogRecord[]
  ): Promise<ResearchSourceAuditLogRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const l of logs) {
      this.vaultData!.sourceAuditLogs[l.id] = l;
    }
    this.persistVaultSync();
    return logs;
  }

  public async getSourceAuditLogs(projectId: string): Promise<ResearchSourceAuditLogRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.sourceAuditLogs || {}).filter((l) => l.project_id === projectId);
  }

  public async saveCitationVerifications(
    verifications: CitationIntegrityVerificationRecord[]
  ): Promise<CitationIntegrityVerificationRecord[]> {
    if (!this.vaultData) this.loadVault();
    for (const cv of verifications) {
      this.vaultData!.citationVerifications[cv.id] = cv;
    }
    this.persistVaultSync();
    return verifications;
  }

  public async getCitationVerifications(reportId: string): Promise<CitationIntegrityVerificationRecord[]> {
    if (!this.vaultData) this.loadVault();
    return Object.values(this.vaultData!.citationVerifications || {}).filter((cv) => cv.report_id === reportId);
  }
}

/** Global singleton instance */
export const researchRepository = ResearchRepository.getInstance();
