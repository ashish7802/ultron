/**
 * @file lib/research/planningEngine.ts
 * @description Module 01: Research Planning Engine for the ULTRON Co-Founder System.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Planning, Scope & Strategy Generation.
 *
 * Key Responsibilities:
 * - Detects research intent across 11 distinct categories (technical, product, comparison, etc.).
 * - Analyzes user topics, problem statements, expected outcomes, and intended business/technical decisions.
 * - Formulates strict research scopes, distinguishing explicit founder requirements from AI-inferred assumptions.
 * - Decomposes high-level inquiries into orthogonal, independently researchable sub-questions with dependency graphs.
 * - Identifies required empirical evidence types (official docs, specs, source code, benchmarks, papers).
 * - Calibrates research depth (quick, standard, deep, comprehensive) to scale resource budgets and discovery breadth.
 * - Produces an executable search strategy with primary queries, alternative variants, official domains, and date ranges.
 * - Establishes verifiable completion criteria to prevent silent scope creep.
 *
 * Architectural Role & Interactions:
 * - Upstream: Consumes user research inquiries from `app/api/research/*` or the Cognitive Orchestrator.
 * - Downstream: Outputs structured `ResearchPlan` directly consumed by Module 02 (`lib/research/discoveryEngine.ts`).
 * - Storage: Persists generated plans into `lib/research/repository.ts` under transactional UUIDs.
 *
 * Safety / Security Guarantees:
 * - Purely analytical and advisory planning: Executes zero external network requests or shell commands.
 * - Prevents blind web crawling by enforcing structured intent boundaries before any discovery begins.
 * - Strict cost constraints: Guarantees zero paid API dependencies by default.
 */

import crypto from "crypto";
import type {
  ResearchPlan,
  ResearchPlanRequest,
  ResearchIntentCategory,
  ResearchDepth,
  ResearchPriority,
  ResearchScope,
  SubQuestion,
  EvidenceRequirement,
  EvidenceRequirementType,
  SearchStrategyItem,
  ResearchResourceLimits,
} from "./types.ts";

/**
 * Domain registry mapping well-known technology keywords to their authoritative primary domains.
 */
const KNOWN_OFFICIAL_DOMAINS: Record<string, string[]> = {
  python: ["docs.python.org", "pypi.org"],
  typescript: ["typescriptlang.org"],
  javascript: ["developer.mozilla.org", "tc39.es"],
  react: ["react.dev", "github.com/facebook/react"],
  next: ["nextjs.org", "github.com/vercel/next.js"],
  nextjs: ["nextjs.org", "github.com/vercel/next.js"],
  node: ["nodejs.org", "nodejs.org/api"],
  nodejs: ["nodejs.org"],
  postgresql: ["postgresql.org", "postgresql.org/docs"],
  postgres: ["postgresql.org"],
  sqlite: ["sqlite.org"],
  mongodb: ["mongodb.com/docs"],
  redis: ["redis.io/docs"],
  electron: ["electronjs.org"],
  ollama: ["ollama.com", "github.com/ollama/ollama"],
  docker: ["docs.docker.com"],
  kubernetes: ["kubernetes.io/docs"],
  webrtc: ["webrtc.org", "w3.org/TR/webrtc"],
  mediapipe: ["developers.google.com/mediapipe"],
  tensorflow: ["tensorflow.org"],
  pytorch: ["pytorch.org"],
  tailwind: ["tailwindcss.com"],
};

/**
 * Depth configurations specifying resource ceilings.
 */
const DEPTH_LIMITS: Record<ResearchDepth, ResearchResourceLimits> = {
  quick: {
    maxSubQuestions: 3,
    maxDiscoveryQueries: 3,
    maxSourcesPerQuery: 3,
    maxTotalSources: 9,
    timeoutSeconds: 20,
    zeroCostEnforced: true,
  },
  standard: {
    maxSubQuestions: 6,
    maxDiscoveryQueries: 6,
    maxSourcesPerQuery: 5,
    maxTotalSources: 25,
    timeoutSeconds: 45,
    zeroCostEnforced: true,
  },
  deep: {
    maxSubQuestions: 10,
    maxDiscoveryQueries: 10,
    maxSourcesPerQuery: 8,
    maxTotalSources: 50,
    timeoutSeconds: 90,
    zeroCostEnforced: true,
  },
  comprehensive: {
    maxSubQuestions: 14,
    maxDiscoveryQueries: 14,
    maxSourcesPerQuery: 10,
    maxTotalSources: 80,
    timeoutSeconds: 150,
    zeroCostEnforced: true,
  },
};

export class ResearchPlanningEngine {
  /**
   * Generates a complete, structured Research Plan from a user request.
   *
   * @param request - Input research query and optional parameters.
   * @returns Fully specified, machine-readable ResearchPlan.
   */
  public generatePlan(request: ResearchPlanRequest): ResearchPlan {
    const rawQuery = (request.query || "").trim();
    if (!rawQuery) {
      throw new Error("Research planning requires a non-empty inquiry string.");
    }

    const researchId = request.projectId || crypto.randomUUID();
    const depth = request.depth || this.inferOptimalDepth(rawQuery);
    const intent = request.intentHint || this.detectIntent(rawQuery);
    const limits = { ...DEPTH_LIMITS[depth] };

    // Apply custom exclusions if provided
    if (request.exclusions && request.exclusions.length > 0) {
      limits.excludedDomains = request.exclusions;
    }

    // 1. Extract Topic, Problem, and Expected Outcomes
    const topic = this.extractMainTopic(rawQuery);
    const title = this.formatPlanTitle(topic, intent);
    const problemStatement = this.formulateProblemStatement(rawQuery, intent, topic);
    const expectedOutcome = this.defineExpectedOutcome(intent, topic);
    const intendedDecision = this.identifyIntendedDecision(rawQuery, intent);

    // 2. Separate Explicit Requirements from Inferred Assumptions
    const { explicit, inferred } = this.separateRequirementsAndAssumptions(rawQuery, request.constraints);

    // 3. Define Structured Research Scope
    const scope = this.defineScope(rawQuery, topic, intent, request.constraints, request.exclusions);

    // 4. Decompose Main Question into Sub-Questions
    const subQuestions = this.decomposeInquiry(rawQuery, topic, intent, depth, limits.maxSubQuestions);

    // 5. Aggregate Global Evidence Requirements
    const evidenceRequirements = this.aggregateEvidenceRequirements(subQuestions);

    // 6. Generate Executable Search Strategy
    const searchStrategy = subQuestions.map((sq) => sq.searchStrategy);

    // 7. Calculate Priority Map
    const priorities: Record<string, ResearchPriority> = {};
    for (const sq of subQuestions) {
      priorities[sq.id] = sq.priority;
    }

    // 8. Build Verifiable Completion Criteria
    const completionCriteria = this.buildCompletionCriteria(subQuestions, evidenceRequirements, scope);

    const now = new Date().toISOString();

    return {
      research_id: researchId,
      title,
      objective: `Investigate ${topic} to support ${intendedDecision || "evidence-backed technical execution"}.`,
      research_intent: intent,
      topic,
      problem_statement: problemStatement,
      expected_outcome: expectedOutcome,
      intended_decision: intendedDecision,
      explicit_requirements: explicit,
      inferred_assumptions: inferred,
      scope,
      exclusions: scope.excludedSubtopics,
      constraints: explicit.concat(scope.technicalConstraints),
      research_depth: depth,
      sub_questions: subQuestions,
      evidence_requirements: evidenceRequirements,
      search_strategy: searchStrategy,
      priorities,
      resource_limits: limits,
      completion_criteria: completionCriteria,
      created_at: now,
      updated_at: now,
    };
  }

  // ============================================================================
  // A. RESEARCH INTENT DETECTION
  // ============================================================================

  /**
   * Intelligently detects the underlying research intent across 11 categories.
   *
   * @param query - Raw user inquiry.
   * @returns Detected ResearchIntentCategory.
   */
  public detectIntent(query: string): ResearchIntentCategory {
    const lower = query.toLowerCase();

    // 1. Technology Comparison
    if (
      /\b(vs|versus|compare|comparison|difference between|pros and cons|which is better|alternative to)\b/i.test(lower)
    ) {
      return "technology_comparison";
    }

    // 2. Architecture Research
    if (
      /\b(architecture|memory architecture|system design|subsystem|pattern|microservices|distributed|monolith|dag|pipeline design)\b/i.test(lower)
    ) {
      return "architecture_research";
    }

    // 3. Documentation Research
    if (
      /\b(docs|documentation|api reference|endpoints|spec|specification|how to use|syntax|guide|changelog)\b/i.test(lower)
    ) {
      return "documentation_research";
    }

    // 4. Current Information Research
    if (
      /\b(latest|current|recent|newest|today|2026|breakthrough|news|announcement|release)\b/i.test(lower)
    ) {
      return "current_information_research";
    }

    // 5. Academic Research
    if (
      /\b(paper|arxiv|journal|peer-reviewed|study|algorithm|theoretical|proof|doi|researchers)\b/i.test(lower)
    ) {
      return "academic_research";
    }

    // 6. Problem Investigation
    if (
      /\b(bug|error|why does|issue|crash|bottleneck|leak|latency spike|failure|root cause|debugging)\b/i.test(lower)
    ) {
      return "problem_investigation";
    }

    // 7. Product Research
    if (
      /\b(pricing|saas|features of|tool for|solution for|vendor|commercial|enterprise)\b/i.test(lower)
    ) {
      return "product_research";
    }

    // 8. Business Decision Research
    if (
      /\b(should we build or buy|roi|cost analysis|business viability|market adoption|co-founder decision|strategy)\b/i.test(lower)
    ) {
      return "business_decision_research";
    }

    // 9. Market Research
    if (
      /\b(market size|tam|competitors|industry trends|valuation|customers|market share)\b/i.test(lower)
    ) {
      return "market_research";
    }

    // 10. Technical Research (Default deep inquiry)
    if (
      /\b(how does|implement|benchmarks|engine|vector search|database|performance|concurrency|encryption|security)\b/i.test(lower)
    ) {
      return "technical_research";
    }

    // 11. General Knowledge Research
    return "general_knowledge_research";
  }

  // ============================================================================
  // B. TOPIC & PROBLEM UNDERSTANDING
  // ============================================================================

  /**
   * Extracts the concise core subject topic from the inquiry.
   */
  private extractMainTopic(query: string): string {
    let cleaned = query
      .replace(/^(research|find out|investigate|search for|what is|tell me about|analyze|look into)\s+/i, "")
      .replace(/[?.!]+$/, "")
      .trim();

    if (!cleaned) cleaned = query;
    return cleaned;
  }

  /**
   * Formats a professional research dossier title.
   */
  private formatPlanTitle(topic: string, intent: ResearchIntentCategory): string {
    const formattedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
    switch (intent) {
      case "technology_comparison":
        return `Comparative Evaluation: ${formattedTopic}`;
      case "architecture_research":
        return `Architectural Investigation: ${formattedTopic}`;
      case "problem_investigation":
        return `Root-Cause Investigation: ${formattedTopic}`;
      case "academic_research":
        return `Academic & Empirical Synthesis: ${formattedTopic}`;
      case "current_information_research":
        return `Current Intelligence Briefing: ${formattedTopic}`;
      default:
        return `Technical Research: ${formattedTopic}`;
    }
  }

  /**
   * Formulates an explicit problem statement answering "Why is this being investigated?".
   */
  private formulateProblemStatement(query: string, intent: ResearchIntentCategory, topic: string): string {
    switch (intent) {
      case "technology_comparison":
        return `The founder must evaluate trade-offs between options in "${topic}" to select the optimal solution adhering to performance, cost, and reliability boundaries.`;
      case "architecture_research":
        return `Investigating structural design patterns and components for "${topic}" to ensure scalability, security, and low-latency local execution.`;
      case "problem_investigation":
        return `Determining the technical mechanisms, trigger conditions, and resolution paths for the issues observed in "${topic}".`;
      case "documentation_research":
        return `Extracting verified API schemas, configuration parameters, and version compatibility constraints for "${topic}".`;
      default:
        return `Gathering authoritative facts, empirical specifications, and verifiable implementation details regarding "${topic}".`;
    }
  }

  /**
   * Defines the tangible expected deliverable.
   */
  private defineExpectedOutcome(intent: ResearchIntentCategory, topic: string): string {
    switch (intent) {
      case "technology_comparison":
        return `A dimensional comparison matrix detailing capabilities, performance benchmarks, and architectural constraints across ${topic}.`;
      case "architecture_research":
        return `A concrete subsystem specification with recommended data models, component boundaries, and integration mechanics for ${topic}.`;
      case "problem_investigation":
        return `A documented root-cause breakdown with verified remediation steps and regression prevention strategies.`;
      default:
        return `A citation-backed technical briefing with verified source passages, version numbers, and actionable findings for ${topic}.`;
    }
  }

  /**
   * Extracts the intended business or technical decision.
   */
  private identifyIntendedDecision(query: string, intent: ResearchIntentCategory): string | undefined {
    const lower = query.toLowerCase();
    if (lower.includes("best memory architecture")) {
      return "Selection and design of ULTRON's long-term memory architecture.";
    }
    if (lower.includes("database") || lower.includes("db")) {
      return "Selection of persistence engine and schema design.";
    }
    if (intent === "technology_comparison") {
      return "Selecting the primary framework/technology stack.";
    }
    if (intent === "business_decision_research") {
      return "Determining resource allocation and strategic direction.";
    }
    return undefined;
  }

  /**
   * Separates founder's explicit requirements from AI-inferred assumptions.
   */
  private separateRequirementsAndAssumptions(
    query: string,
    providedConstraints?: string[]
  ): { explicit: string[]; inferred: string[] } {
    const explicit: string[] = [];
    const inferred: string[] = [];

    // Explicit from request constraints
    if (providedConstraints) {
      explicit.push(...providedConstraints);
    }

    const lower = query.toLowerCase();

    // Check for negative constraints in query
    const noPaidMatch = lower.match(/\b(no paid|zero cost|free only|no cloud|local only|offline)\b/);
    if (noPaidMatch) {
      explicit.push(`Explicit rule: ${noPaidMatch[0]}`);
    } else {
      inferred.push("Inferred: Prefer local-first, zero-cost solutions unless external cloud is strictly necessary.");
    }

    if (lower.includes("ultron")) {
      inferred.push("Inferred: Target architecture must integrate seamlessly with ULTRON Next.js/Electron/Python stack.");
    }

    inferred.push("Inferred: Findings must be grounded in primary documentation rather than anecdotal forum opinions.");

    return { explicit, inferred };
  }

  // ============================================================================
  // C. RESEARCH SCOPE DEFINITION
  // ============================================================================

  /**
   * Defines explicit boundaries, included facets, and excluded domains.
   */
  private defineScope(
    query: string,
    topic: string,
    intent: ResearchIntentCategory,
    constraints?: string[],
    exclusions?: string[]
  ): ResearchScope {
    const includedSubtopics: string[] = [];
    const excludedSubtopics: string[] = exclusions ? [...exclusions] : [];
    const technicalConstraints: string[] = [];
    const businessConstraints: string[] = [];

    const lower = topic.toLowerCase();

    // Context-sensitive topic inclusion
    if (lower.includes("memory") || lower.includes("architecture")) {
      includedSubtopics.push(
        "Database persistence architecture",
        "Vector search & indexing",
        "Knowledge graphs & associative recall",
        "Retrieval strategies & latency",
        "Memory consolidation & retention",
        "Scalability & security boundaries"
      );
      excludedSubtopics.push("Third-party hosted SaaS memory services requiring paid enterprise licenses");
    } else if (intent === "technology_comparison") {
      includedSubtopics.push("Feature matrix", "Benchmark performance", "Ecosystem maturity", "Integration complexity");
    } else {
      includedSubtopics.push("Core concepts & mechanism", "Official specifications", "Known limitations & edge cases");
    }

    technicalConstraints.push("Must run on Windows 10/11 x64 architecture");
    technicalConstraints.push("Must respect read-only sandbox boundaries during discovery");

    businessConstraints.push("Zero API subscription costs for research infrastructure");

    return {
      primaryTopic: topic,
      includedSubtopics,
      excludedSubtopics,
      timePeriod: lower.includes("2026") || lower.includes("latest") ? "2024 - 2026" : undefined,
      technicalConstraints,
      businessConstraints,
      requiredDetailLevel: "Production-grade technical depth with exact citations",
      researchBoundaries: [
        "Read-only exploration of public sources",
        "No execution of external write commands",
        "Strict verification of domain authority",
      ],
    };
  }

  // ============================================================================
  // D & E. SUB-QUESTION GENERATION & DECOMPOSITION
  // ============================================================================

  /**
   * Decomposes the research question into an orthogonal sub-question graph.
   */
  private decomposeInquiry(
    query: string,
    topic: string,
    intent: ResearchIntentCategory,
    depth: ResearchDepth,
    maxQuestions: number
  ): SubQuestion[] {
    const subQuestions: SubQuestion[] = [];
    const lower = topic.toLowerCase();

    // Archetype 1: Memory Architecture for ULTRON (as highlighted in blueprint)
    if (lower.includes("memory architecture") || (lower.includes("memory") && lower.includes("ultron"))) {
      const memoryArchetypes = [
        {
          q: "What database architecture provides optimal local persistence for AI co-founder episodic memory?",
          obj: "Evaluate SQLite, PostgreSQL, DuckDB, and embedded KV stores for local memory persistence.",
          prio: "CRITICAL" as ResearchPriority,
          dep: [],
          expected: "Latency figures, transactional safety, zero-dependency local embedding capabilities.",
          current: false,
          official: true,
          evidence: ["official_documentation" as EvidenceRequirementType, "technical_benchmark" as EvidenceRequirementType],
          domains: ["sqlite.org", "postgresql.org"],
        },
        {
          q: "What local vector search engines provide the lowest retrieval latency and memory footprint?",
          obj: "Investigate HNSWlib, FAISS, sqlite-vec, and Chroma for local embedding search.",
          prio: "CRITICAL" as ResearchPriority,
          dep: [],
          expected: "Recall rate, query latency under 100k vectors, memory usage, Node.js/Python bindings.",
          current: true,
          official: true,
          evidence: ["github_source_code" as EvidenceRequirementType, "technical_benchmark" as EvidenceRequirementType],
          domains: ["github.com"],
        },
        {
          q: "How can knowledge graphs be integrated with episodic memory for associative reasoning?",
          obj: "Analyze graph data models linking entities, user preferences, and historical decisions.",
          prio: "HIGH" as ResearchPriority,
          dep: [],
          expected: "Graph traversal complexity, local storage format, entity resolution strategies.",
          current: false,
          official: false,
          evidence: ["research_paper" as EvidenceRequirementType, "technical_specification" as EvidenceRequirementType],
          domains: ["arxiv.org"],
        },
        {
          q: "What are the most effective memory retrieval and ranking strategies for multi-turn conversational agents?",
          obj: "Synthesize hybrid BM25 + dense vector ranking and recency decay mechanisms.",
          prio: "HIGH" as ResearchPriority,
          dep: [],
          expected: "Ranking formulas, scoring thresholds, context window compression techniques.",
          current: true,
          official: false,
          evidence: ["research_paper" as EvidenceRequirementType, "independent_technical_analysis" as EvidenceRequirementType],
          domains: ["arxiv.org"],
        },
        {
          q: "What memory consolidation algorithms effectively distill raw chats into long-term user facts?",
          obj: "Study sleep-cycle/offline memory consolidation pipelines that deduplicate and resolve contradictions.",
          prio: "MEDIUM" as ResearchPriority,
          dep: [],
          expected: "Batch summarization algorithms, contradiction resolution rules, forgetting curves.",
          current: false,
          official: false,
          evidence: ["research_paper" as EvidenceRequirementType],
          domains: ["arxiv.org"],
        },
        {
          q: "What cryptographic security patterns protect local AI memory databases from unauthorized inspection?",
          obj: "Identify authenticated encryption (AES-256-GCM) and key management practices for memory at rest.",
          prio: "CRITICAL" as ResearchPriority,
          dep: [],
          expected: "Key derivation standards (PBKDF2/Argon2), non-plaintext DB guarantees, OS keychain integration.",
          current: false,
          official: true,
          evidence: ["technical_specification" as EvidenceRequirementType, "official_documentation" as EvidenceRequirementType],
          domains: ["csrc.nist.gov", "developer.mozilla.org"],
        },
      ];

      for (let i = 0; i < Math.min(memoryArchetypes.length, maxQuestions); i++) {
        const item = memoryArchetypes[i];
        const id = `sq_${i + 1}`;
        const searchStrategy: SearchStrategyItem = {
          subQuestionId: id,
          searchObjective: item.obj,
          primaryQuery: `${topic} ${item.domains[0] ? item.domains[0] : ""} ${item.q}`.trim(),
          alternativeQueries: [
            `${item.obj} specifications`,
            `${topic} best practices benchmarks`,
          ],
          preferredSourceTypes: ["official_documentation", "technical_specification", "github_repository"],
          officialDomains: item.domains,
          relevantRepositories: ["github.com"],
          requiredDateRange: item.current ? { startYear: 2024, endYear: 2026, mustBeRecent: true } : undefined,
          expectedEvidence: item.evidence,
          priority: item.prio,
        };

        subQuestions.push({
          id,
          question: item.q,
          searchObjective: item.obj,
          priority: item.prio,
          dependencies: item.dep,
          expectedInformation: item.expected,
          requiresCurrentInfo: item.current,
          requiresOfficialDocs: item.official,
          evidenceRequirements: item.evidence.map((t) => ({
            type: t,
            description: `Requires verifiable ${t} addressing ${item.obj}`,
            mandatory: item.prio === "CRITICAL",
            preferredDomains: item.domains,
          })),
          searchStrategy,
        });
      }

      return subQuestions;
    }

    // Archetype 2: General / Technical Comparison / Architecture Decomposition
    const baseVectors = [
      {
        aspect: "Architectural Foundations & Core Specifications",
        priority: "CRITICAL" as ResearchPriority,
        official: true,
        current: false,
        evidence: ["official_documentation" as EvidenceRequirementType, "technical_specification" as EvidenceRequirementType],
      },
      {
        aspect: "Current Release Details, Versions & Deprecations",
        priority: "HIGH" as ResearchPriority,
        official: true,
        current: true,
        evidence: ["release_notes" as EvidenceRequirementType, "api_specification" as EvidenceRequirementType],
      },
      {
        aspect: "Empirical Performance Benchmarks & Resource Limits",
        priority: "HIGH" as ResearchPriority,
        official: false,
        current: true,
        evidence: ["technical_benchmark" as EvidenceRequirementType, "independent_technical_analysis" as EvidenceRequirementType],
      },
      {
        aspect: "Implementation Code Patterns & Production Pitfalls",
        priority: "MEDIUM" as ResearchPriority,
        official: false,
        current: false,
        evidence: ["github_source_code" as EvidenceRequirementType, "official_documentation" as EvidenceRequirementType],
      },
      {
        aspect: "Security Guarantees, Vulnerabilities & Sandboxing",
        priority: "CRITICAL" as ResearchPriority,
        official: true,
        current: true,
        evidence: ["technical_specification" as EvidenceRequirementType, "independent_technical_analysis" as EvidenceRequirementType],
      },
      {
        aspect: "Ecosystem Compatibility & Integration Overhead",
        priority: "MEDIUM" as ResearchPriority,
        official: false,
        current: false,
        evidence: ["product_documentation" as EvidenceRequirementType],
      },
    ];

    const targetCount = Math.min(baseVectors.length, maxQuestions);
    const identifiedDomains = this.resolveOfficialDomains(topic);

    for (let i = 0; i < targetCount; i++) {
      const vec = baseVectors[i];
      const id = `sq_${i + 1}`;
      const q = `What are the ${vec.aspect.toLowerCase()} of ${topic}?`;
      const searchObjective = `Investigate ${vec.aspect} for ${topic}.`;

      const searchStrategy: SearchStrategyItem = {
        subQuestionId: id,
        searchObjective,
        primaryQuery: `${topic} ${vec.aspect}`,
        alternativeQueries: [
          `${topic} official documentation ${vec.aspect}`,
          `${topic} technical specifications`,
        ],
        preferredSourceTypes: vec.official
          ? ["official_documentation", "technical_specification"]
          : ["reputable_publication", "independent_analysis", "github_repository"],
        officialDomains: identifiedDomains,
        relevantRepositories: ["github.com"],
        requiredDateRange: vec.current ? { startYear: 2024, endYear: 2026, mustBeRecent: true } : undefined,
        expectedEvidence: vec.evidence,
        priority: vec.priority,
      };

      subQuestions.push({
        id,
        question: q,
        searchObjective,
        priority: vec.priority,
        dependencies: i > 0 && vec.priority !== "CRITICAL" ? ["sq_1"] : [],
        expectedInformation: `Empirical data and official source statements covering ${vec.aspect}.`,
        requiresCurrentInfo: vec.current,
        requiresOfficialDocs: vec.official,
        evidenceRequirements: vec.evidence.map((evType) => ({
          type: evType,
          description: `Empirical evidence required for ${vec.aspect}`,
          mandatory: vec.priority === "CRITICAL",
          preferredDomains: identifiedDomains,
        })),
        searchStrategy,
      });
    }

    return subQuestions;
  }

  // ============================================================================
  // F, G, H, I, J. EVIDENCE, DEPTH, STRATEGY, COMPLETION CRITERIA
  // ============================================================================

  /**
   * Resolves official primary domains from the inquiry topic using the curated registry.
   */
  private resolveOfficialDomains(topic: string): string[] {
    const lower = topic.toLowerCase();
    const matched: string[] = [];

    for (const [key, domains] of Object.entries(KNOWN_OFFICIAL_DOMAINS)) {
      if (lower.includes(key)) {
        matched.push(...domains);
      }
    }

    return Array.from(new Set(matched));
  }

  /**
   * Infers the optimal research depth based on inquiry complexity.
   */
  private inferOptimalDepth(query: string): ResearchDepth {
    const lower = query.toLowerCase();
    if (lower.includes("quick") || lower.includes("brief") || lower.includes("summary")) {
      return "quick";
    }
    if (lower.includes("comprehensive") || lower.includes("exhaustive") || lower.includes("deep dive")) {
      return "comprehensive";
    }
    if (lower.includes("architecture") || lower.includes("comparison") || lower.includes("evaluate")) {
      return "deep";
    }
    return "standard";
  }

  /**
   * Aggregates and deduplicates global evidence requirements across sub-questions.
   */
  private aggregateEvidenceRequirements(subQuestions: SubQuestion[]): EvidenceRequirement[] {
    const map = new Map<EvidenceRequirementType, EvidenceRequirement>();
    for (const sq of subQuestions) {
      for (const req of sq.evidenceRequirements) {
        if (!map.has(req.type)) {
          map.set(req.type, req);
        } else if (req.mandatory) {
          map.get(req.type)!.mandatory = true;
        }
      }
    }
    return Array.from(map.values());
  }

  /**
   * Builds unambiguous, verifiable completion criteria for the research plan.
   */
  private buildCompletionCriteria(
    subQuestions: SubQuestion[],
    evidenceRequirements: EvidenceRequirement[],
    scope: ResearchScope
  ): string[] {
    const criteria: string[] = [];

    const criticalCount = subQuestions.filter((sq) => sq.priority === "CRITICAL").length;
    criteria.push(
      `All ${criticalCount} CRITICAL sub-questions must be thoroughly investigated with primary source evidence.`
    );
    criteria.push(
      `At least ${Math.min(3, subQuestions.length)} distinct sub-questions must have direct citation-backed evidence.`
    );

    const mandatoryEvidence = evidenceRequirements.filter((er) => er.mandatory).map((er) => er.type);
    if (mandatoryEvidence.length > 0) {
      criteria.push(`Mandatory evidence types satisfied: ${mandatoryEvidence.join(", ")}.`);
    }

    criteria.push(`No research execution may breach defined exclusions: [${scope.excludedSubtopics.join(", ") || "none"}].`);
    criteria.push("Every extracted claim must be mapped to an exact verbatim supporting passage.");
    criteria.push("Any unresolved technical ambiguities or information gaps must be explicitly documented.");

    return criteria;
  }
}

/** Global singleton instance */
export const researchPlanningEngine = new ResearchPlanningEngine();
