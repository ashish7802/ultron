/**
 * @file lib/cognitive/planningEngine.ts
 * @description Component 06: Planning Intelligence Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Structured Execution Planning Layer.
 *
 * Key Responsibilities:
 * - Decomposes high-level strategic/technical goals into actionable, bounded tasks.
 * - Constructs a Directed Acyclic Graph (DAG) of task dependencies and identifies critical paths.
 * - Computes valid topological execution sequences using Kahn's algorithm with cycle detection.
 * - Formulates milestones, deliverables, and measurable completion criteria.
 * - Detects unrealistic, impossible, or contradictory plan constraints (e.g. impossible deadlines, cycles).
 * - Generates alternative fallback roadmaps when critical prerequisite dependencies fail (replanning).
 * - Distinguishes measured facts from estimates and unverified assumptions.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` during analytical planning turns.
 * - Interfaces with `ParsedContext`, `AdvancedReasoningResult`, and `DecisionIntelligenceResult`.
 *
 * Safety / Security Guarantees:
 * - Strictly advisory (`isAdvisoryOnly: true`). Never invokes child processes, modifies files, or executes commands.
 * - Preserves human-in-the-loop authorization principles.
 */

import type {
  ParsedContext,
  AdvancedReasoningResult,
  DecisionIntelligenceResult,
  PlanTask,
  PlanMilestone,
  PlanRisk,
  PlanningIntelligenceResult,
} from "./types.ts";

/**
 * Checks for impossible, contradictory, or conflicting planning constraints.
 *
 * @param context - Parsed context.
 * @returns Array of detected contradiction descriptions.
 */
function detectContradictions(context: ParsedContext): string[] {
  const query = context.cleanedQuery.toLowerCase();
  const contradictions: string[] = [];

  // 1. Impossible / Unrealistic Timeframe
  const urgentMatch = query.match(
    /\b(?:in\s+([0-9]+)\s*(?:minutes?|mins?|seconds?|secs?|hours?)|by\s+tonight|in\s+one\s+hour|immediately\s+without\s+testing)\b/i
  );
  if (
    urgentMatch &&
    (query.includes("rewrite") ||
      query.includes("architecture") ||
      query.includes("full system") ||
      query.includes("entire project") ||
      query.includes("migrate"))
  ) {
    contradictions.push(
      `Unrealistic Deadline Contradiction: A multi-phase architectural migration or system rewrite ` +
      `cannot be reliably implemented, audited, and verified within "${urgentMatch[0]}".`
    );
  }

  // 2. Conflicting Non-Negotiables (e.g. Zero-cost vs Paid Cloud)
  if (
    (query.includes("zero cost") || query.includes("offline") || query.includes("free")) &&
    (query.includes("pinecone") || query.includes("aws") || query.includes("paid cloud") || query.includes("saas subscription"))
  ) {
    contradictions.push(
      "Direct Constraint Conflict: Request simultaneously demands zero-cost/offline execution and paid cloud-hosted services."
    );
  }

  // 3. Skip Testing while Demanding Zero Bugs
  if (
    (query.includes("skip tests") || query.includes("delete tests") || query.includes("without tests")) &&
    (query.includes("zero bugs") || query.includes("100% reliable") || query.includes("production grade"))
  ) {
    contradictions.push(
      "Quality Invariant Contradiction: Demanding zero bugs or production reliability while explicitly skipping automated verification is impossible."
    );
  }

  return contradictions;
}

/**
 * Generates tasks from user goal and context.
 *
 * @param context - Parsed context.
 * @returns Array of structured PlanTask models.
 */
function generateTasks(context: ParsedContext): PlanTask[] {
  const query = context.cleanedQuery.toLowerCase();
  const tasks: PlanTask[] = [];

  const isBusinessGoal =
    /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(query);

  const isPersonalGoal =
    /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn\s+(?:spanish|french|german|japanese|chinese|hindi|english)|habit|habits|study|studying|exam|reading|meditation|sleep)\b/i.test(query);

  if (isPersonalGoal) {
    const isRunning = /\b(marathon|running|run|mileage)\b/i.test(query);
    const isFitness = /\b(fitness|workout|exercise|gym|training|diet|weight loss|strength|bodyweight)\b/i.test(query);
    const isLanguage = /\b(language|learn\s+|spanish|french|german|japanese|chinese|hindi|english|vocabulary)\b/i.test(query);
    const isHabit = /\b(habit|habits|routine|sleep|meditation)\b/i.test(query);
    const isStudy = /\b(study|studying|exam|reading|curriculum|syllabus)\b/i.test(query);

    tasks.push({
      id: "task_01_preflight",
      title: isRunning
        ? "Baseline Fitness & Heart-Rate Assessment"
        : isFitness
        ? "Baseline Fitness & Movement Mobility Assessment"
        : isLanguage
        ? "Language Diagnostic & Daily Immersion Schedule Setup"
        : isHabit
        ? "Habit Trigger Mapping & Environmental Cue Setup"
        : isStudy
        ? "Syllabus Diagnostic & Study Timetable Setup"
        : "Personal Baseline Assessment & Routine Setup",
      description: isRunning
        ? "Assess baseline aerobic threshold, acquire ergonomic running gear, and schedule 4 dedicated weekly workout windows."
        : isFitness
        ? "Assess initial strength capacity, mobility limits, workout equipment availability, and reserve weekly workout times."
        : isLanguage
        ? "Audit current CEFR vocabulary level, install offline spaced-repetition tools, and block 45 minutes daily."
        : isHabit
        ? "Identify contextual triggers, eliminate habit friction points, and configure an offline streak tracker."
        : isStudy
        ? "Audit curriculum knowledge gaps, gather active-recall reference materials, and reserve daily deep-work time blocks."
        : "Conduct baseline self-assessment, determine target milestone metrics, and reserve recurring calendar blocks.",
      dependencies: [],
      priority: "CRITICAL",
      estimatedEffort: "3-5 days",
      effortClassification: "ESTIMATE",
      completionCriteria: "Baseline metrics documented and weekly recurring schedule locked in calendar.",
      assignedPhase: "Phase 1: Baseline Assessment & Setup",
    });

    tasks.push({
      id: "task_02_implementation",
      title: isRunning
        ? "Progressive Aerobic Mileage & Strength Conditioning"
        : isFitness
        ? "Progressive Strength Conditioning & Workout Execution"
        : isLanguage
        ? "Core Vocabulary Acquisition & Spaced Repetition"
        : isHabit
        ? "21-Day Habit Execution & Friction Elimination"
        : isStudy
        ? "Active Recall Cycles & Conceptual Deep Work"
        : "Core Routine Execution & Progressive Skill Building",
      description: isRunning
        ? "Execute periodized weekly running volume with 10% gradual mileage increments and active recovery intervals."
        : isFitness
        ? "Execute periodized strength and conditioning workouts with progressive overload and scheduled rest days."
        : isLanguage
        ? "Master top 1,000 frequent lemmas using spaced repetition and comprehensible input audio drills."
        : isHabit
        ? "Execute target habit daily with immediate positive reinforcement; adhere strictly to the 'never miss twice' rule."
        : isStudy
        ? "Work through primary problem sets using active recall and Feynman technique explanations for difficult modules."
        : "Execute daily structured practice sessions with systematic incremental progression.",
      dependencies: ["task_01_preflight"],
      priority: "HIGH",
      estimatedEffort: "4-8 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Over 85% session adherence achieved across scheduled practice blocks.",
      assignedPhase: "Phase 2: Progressive Foundation",
    });

    tasks.push({
      id: "task_03_integration",
      title: isRunning
        ? "Simulated Long-Run Endurance & Race Pacing Calibration"
        : isFitness
        ? "High-Load Endurance & Peak Strength Testing"
        : isLanguage
        ? "Conversational Immersion & Native Dialogue Practice"
        : isHabit
        ? "Stress Resilience & Schedule Disruption Testing"
        : isStudy
        ? "Timed Mock Exam Simulations & Synthesis Review"
        : "Applied Simulation & High-Load Performance Testing",
      description: isRunning
        ? "Execute 20+ mile dress-rehearsal run under target race conditions; validate hydration and nutrition protocols."
        : isFitness
        ? "Conduct peak load workout tests, evaluate joint recovery and muscular adaptations, and calibrate volume."
        : isLanguage
        ? "Conduct conversational immersion sessions with native speakers and consume authentic untranslated media."
        : isHabit
        ? "Sustain habit adherence during travel or stressful days using minimum viable 2-minute emergency routines."
        : isStudy
        ? "Complete full-length timed mock exams under simulated examination conditions and review error logs."
        : "Conduct full-scale simulated endurance checkpoint under realistic conditions.",
      dependencies: ["task_02_implementation"],
      priority: "HIGH",
      estimatedEffort: "2-4 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Full simulation successfully completed meeting target benchmark standards.",
      assignedPhase: "Phase 3: Simulation & Immersion",
    });

    tasks.push({
      id: "task_04_verification",
      title: isRunning
        ? "Tapering, Event Execution & Sustainable Recovery"
        : isFitness
        ? "Target Fitness Benchmark Evaluation & Sustainable Maintenance"
        : isLanguage
        ? "Target Fluency Evaluation & Long-Term Practice Habit"
        : isHabit
        ? "Automaticity Certification & Long-Term Habit Locking"
        : isStudy
        ? "Target Exam Execution & Knowledge Retention Archive"
        : "Final Milestone Execution & Sustainable Maintenance",
      description: isRunning
        ? "Execute planned 2-week tapering protocol, complete marathon event, and follow a 2-week structured active recovery."
        : isFitness
        ? "Perform formal fitness benchmarking assessment and establish ongoing weekly maintenance workout routine."
        : isLanguage
        ? "Complete formal conversational assessment or certification, and transition to passive immersion routine."
        : isHabit
        ? "Verify behavioral automaticity via Self-Report Habit Index, establishing quarterly maintenance audits."
        : isStudy
        ? "Sit for final exam and organize consolidated permanent reference summary."
        : "Execute target goal and transition into sustainable long-term maintenance protocol.",
      dependencies: ["task_03_integration"],
      priority: "CRITICAL",
      estimatedEffort: "1-2 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Target event or evaluation successfully completed with ongoing maintenance protocol active.",
      assignedPhase: "Phase 4: Execution & Long-Term Maintenance",
    });

    return tasks;
  }

  if (isBusinessGoal) {
    tasks.push({
      id: "task_01_preflight",
      title: "Market Feasibility & Regulatory Invariant Audit",
      description: "Analyze target demographics, competitor density, zoning laws, commercial permitting, and initial capital runway.",
      dependencies: [],
      priority: "CRITICAL",
      estimatedEffort: "1-2 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Feasibility study completed with zoning compliance confirmed.",
      assignedPhase: "Phase 1: Discovery & Regulatory Audit",
    });

    tasks.push({
      id: "task_02_implementation",
      title: "Commercial Setup, Permitting & Lease Execution",
      description: "Negotiate commercial lease agreement, complete architectural layout, and secure operational health/business licenses.",
      dependencies: ["task_01_preflight"],
      priority: "HIGH",
      estimatedEffort: "3-4 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Commercial premises leased and municipal licenses approved.",
      assignedPhase: "Phase 2: Operations & Setup",
    });

    tasks.push({
      id: "task_03_integration",
      title: "Supply Chain Binding & Staffing Onboarding",
      description: "Establish wholesale supplier contracts, recruit and train service personnel, and configure point-of-sale inventory tracking.",
      dependencies: ["task_02_implementation"],
      priority: "HIGH",
      estimatedEffort: "2 weeks",
      effortClassification: "ESTIMATE",
      completionCriteria: "Staff trained and inventory pipeline fully operational.",
      assignedPhase: "Phase 3: Integration & Staffing",
    });

    tasks.push({
      id: "task_04_verification",
      title: "Soft Launch & Customer Validation Testing",
      description: "Execute invite-only pilot soft launch to validate throughput, customer satisfaction, and unit economics under realistic load.",
      dependencies: ["task_03_integration"],
      priority: "CRITICAL",
      estimatedEffort: "1 week",
      effortClassification: "ESTIMATE",
      completionCriteria: "Positive unit economics confirmed during pilot service with zero regulatory violations.",
      assignedPhase: "Phase 4: Launch & Verification",
    });

    return tasks;
  }

  // Task 1: Environment & Pre-Flight Invariant Audit
  tasks.push({
    id: "task_01_preflight",
    title: "Environment & Architectural Invariants Audit",
    description: "Verify baseline local dependencies, security boundaries, and operational constraints prior to code modifications.",
    dependencies: [],
    priority: "CRITICAL",
    estimatedEffort: "15 minutes",
    effortClassification: "ESTIMATE",
    completionCriteria: "Pre-flight environment audit complete with all security gates verified.",
    assignedPhase: "Phase 1: Pre-Flight & Discovery",
  });

  // Task 2: Core Subsystem Implementation / Remediation
  const isDatabase = query.includes("sqlite") || query.includes("database") || query.includes("concurrency");
  const isAudio = query.includes("voice") || query.includes("audio") || query.includes("tts") || query.includes("transcribe");

  if (isDatabase) {
    tasks.push({
      id: "task_02_implementation",
      title: "Configure Database Concurrency & Connection Pooling",
      description: "Implement PRAGMA journal_mode=WAL and busy_timeout=5000 in database initialization, backed by serialized write queues.",
      dependencies: ["task_01_preflight"],
      priority: "HIGH",
      estimatedEffort: "30 minutes",
      effortClassification: "ESTIMATE",
      completionCriteria: "WAL pragmas executed and verified via sqlite3 PRAGMA query in local runtime.",
      assignedPhase: "Phase 2: Core Implementation",
    });
  } else if (isAudio) {
    tasks.push({
      id: "task_02_implementation",
      title: "Audio Pipeline Synchronization & Process Lifecycle",
      description: "Coordinate child process lifecycle between Python voice engine and Next.js API endpoints with readiness probes.",
      dependencies: ["task_01_preflight"],
      priority: "HIGH",
      estimatedEffort: "1 hour",
      effortClassification: "ESTIMATE",
      completionCriteria: "Python engine signals port readiness before Next.js accepts voice turns.",
      assignedPhase: "Phase 2: Core Implementation",
    });
  } else {
    tasks.push({
      id: "task_02_implementation",
      title: `Targeted Technical Implementation for "${context.primaryGoal.slice(0, 50)}"`,
      description: "Develop targeted modular components adhering to local-first TypeScript/Python boundaries.",
      dependencies: ["task_01_preflight"],
      priority: "HIGH",
      effortClassification: context.ambiguityScore > 0.3 ? "UNVERIFIED_ASSUMPTION" : "ESTIMATE",
      estimatedEffort: context.ambiguityScore > 0.3 ? undefined : "1-2 hours",
      completionCriteria: "Modular code delivered with explicit type signatures and docstrings.",
      assignedPhase: "Phase 2: Core Implementation",
    });
  }

  // Task 3: Integration & Dependency Binding
  tasks.push({
    id: "task_03_integration",
    title: "Integration & EventBus Wire-up",
    description: "Wire implemented module into central orchestrator or EventBus without circular coupling.",
    dependencies: ["task_02_implementation"],
    priority: "HIGH",
    estimatedEffort: "30 minutes",
    effortClassification: "ESTIMATE",
    completionCriteria: "Orchestrator invokes new capability with zero unhandled promise rejections.",
    assignedPhase: "Phase 3: Integration",
  });

  // Task 4: Automated Verification & Regression Testing
  tasks.push({
    id: "task_04_verification",
    title: "Automated Regression, Security & Build Verification",
    description: "Execute unit test suites, security gates, TypeScript compiler, ESLint, and production build checks.",
    dependencies: ["task_03_integration"],
    priority: "CRITICAL",
    estimatedEffort: "20 minutes",
    effortClassification: "ESTIMATE",
    completionCriteria: "100% test pass rate, npx tsc exit code 0, npm run build exit code 0.",
    assignedPhase: "Phase 4: Verification",
  });

  return tasks;
}

/**
 * Computes execution sequence using Kahn's algorithm, detecting circular dependencies.
 *
 * @param tasks - Array of PlanTask models.
 * @returns Object with ordered sequence, cycle detection flag, and detected cycle descriptions.
 */
export function computeTaskExecutionSequence(
  tasks: PlanTask[]
): { sequence: string[]; hasCircularDependency: boolean; circularDetails?: string } {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    graph.set(t.id, []);
  }

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (graph.has(dep)) {
        graph.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sequence: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sequence.push(node);
    for (const neighbor of graph.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // If sequence length does not match total tasks, a cycle exists
  const hasCircularDependency = sequence.length < tasks.length;
  let circularDetails: string | undefined;

  if (hasCircularDependency) {
    const unvisited = tasks.filter((t) => !sequence.includes(t.id)).map((t) => t.id);
    circularDetails = `Circular task dependency detected among tasks: [${unvisited.join(" <-> ")}]. Deadlock broken by sequential fallback.`;
    // Append remaining tasks sequentially to produce a usable fallback sequence
    for (const id of unvisited) sequence.push(id);
  }

  return { sequence, hasCircularDependency, circularDetails };
}

/**
 * Constructs milestones tied to task completion criteria.
 *
 * @param tasks - Array of tasks.
 * @returns Array of PlanMilestone objects.
 */
function buildMilestones(tasks: PlanTask[], context?: ParsedContext): PlanMilestone[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  const query = (context?.cleanedQuery || "").toLowerCase();
  const isBusinessGoal =
    /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(query);

  const isPersonalGoal =
    /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn\s+(?:spanish|french|german|japanese|chinese|hindi|english)|habit|habits|study|studying|exam|reading|meditation|sleep)\b/i.test(query);

  if (isPersonalGoal) {
    const isRunning = /\b(marathon|running|run|mileage)\b/i.test(query);
    const isFitness = /\b(fitness|workout|exercise|gym|training|diet|weight loss|strength|bodyweight)\b/i.test(query);
    const isLanguage = /\b(language|learn\s+|spanish|french|german|japanese|chinese|hindi|english|vocabulary)\b/i.test(query);
    const isHabit = /\b(habit|habits|routine|sleep|meditation)\b/i.test(query);
    const isStudy = /\b(study|studying|exam|reading|curriculum|syllabus)\b/i.test(query);

    return [
      {
        id: "ms_01_preflight",
        title: isRunning
          ? "Milestone 1: Aerobic Base Logged & Schedule Reserved"
          : isFitness
          ? "Milestone 1: Baseline Fitness Metrics Logged & Workout Windows Reserved"
          : isLanguage
          ? "Milestone 1: Language Diagnostic & Curriculum Set"
          : isHabit
          ? "Milestone 1: Habit Triggers Mapped & Cues Set"
          : isStudy
          ? "Milestone 1: Syllabus Diagnostic & Dedicated Study Blocks Reserved"
          : "Milestone 1: Personal Baseline & Timetable Established",
        prerequisiteTaskIds: ["task_01_preflight"].filter((id) => taskIds.has(id)),
        successCriteria: "Initial baseline metrics documented and weekly dedicated windows reserved.",
        deliverable: "Baseline assessment log & committed weekly timetable.",
      },
      {
        id: "ms_02_feature_complete",
        title: isRunning
          ? "Milestone 2: Volume Milestones & Aerobic Base Established"
          : isFitness
          ? "Milestone 2: Strength Capacity Target & Workout Consistency Established"
          : isLanguage
          ? "Milestone 2: Core Vocabulary & Grammar Mastered"
          : isHabit
          ? "Milestone 2: 21-Day Habit Consistency Streak"
          : isStudy
          ? "Milestone 2: Active Recall Modules & Core Topics Mastered"
          : "Milestone 2: Mid-Cycle Capacity Target Achieved",
        prerequisiteTaskIds: ["task_02_implementation"].filter((id) => taskIds.has(id)),
        successCriteria: "Over 85% session adherence achieved across training/practice cycle.",
        deliverable: "Consistent practice log & intermediate performance metrics.",
      },
      {
        id: "ms_03_production_certified",
        title: isRunning
          ? "Milestone 3: Target Race Executed & Recovery System"
          : isFitness
          ? "Milestone 3: Final Fitness Benchmark Certified & Maintenance Protocol"
          : isLanguage
          ? "Milestone 3: Target Conversational Fluency Certified"
          : isHabit
          ? "Milestone 3: Behavioral Automaticity & Long-Term Habit Locked"
          : isStudy
          ? "Milestone 3: Mock Exam Certified & Exam Performance Executed"
          : "Milestone 3: Final Goal Performance & Sustainable Maintenance",
        prerequisiteTaskIds: ["task_03_integration", "task_04_verification"].filter((id) => taskIds.has(id)),
        successCriteria: "Target performance goal achieved with sustainable ongoing maintenance routine.",
        deliverable: "Target achievement result & long-term maintenance protocol.",
      },
    ];
  }

  if (isBusinessGoal) {
    return [
      {
        id: "ms_01_preflight",
        title: "Milestone 1: Market & Regulatory Viability Validated",
        prerequisiteTaskIds: ["task_01_preflight"].filter((id) => taskIds.has(id)),
        successCriteria: "Zoning laws cleared, competitor density audited, and lease budget approved.",
        deliverable: "Commercial feasibility study & zoning clearance documentation.",
      },
      {
        id: "ms_02_feature_complete",
        title: "Milestone 2: Operational Premise & Infrastructure Ready",
        prerequisiteTaskIds: ["task_02_implementation"].filter((id) => taskIds.has(id)),
        successCriteria: "Commercial premises leased and operational licenses approved.",
        deliverable: "Executed lease contract and municipal business permits.",
      },
      {
        id: "ms_03_production_certified",
        title: "Milestone 3: Soft Launch & Unit Economics Certified",
        prerequisiteTaskIds: ["task_03_integration", "task_04_verification"].filter((id) => taskIds.has(id)),
        successCriteria: "Point of sale operational, staff trained, and soft launch customer approval > 85%.",
        deliverable: "Pilot revenue metrics & operational validation audit.",
      },
    ];
  }

  return [
    {
      id: "ms_01_preflight",
      title: "Milestone 1: Environment & Baseline Validated",
      prerequisiteTaskIds: ["task_01_preflight"].filter((id) => taskIds.has(id)),
      successCriteria: "Pre-flight checks pass; DPAPI vault and local SQLite connection confirmed.",
      deliverable: "Environment audit verification report.",
    },
    {
      id: "ms_02_feature_complete",
      title: "Milestone 2: Modular Implementation Ready",
      prerequisiteTaskIds: ["task_02_implementation"].filter((id) => taskIds.has(id)),
      successCriteria: "Core code written with type safety and zero paid API dependencies.",
      deliverable: "Tested module files under lib/ or app/.",
    },
    {
      id: "ms_03_production_certified",
      title: "Milestone 3: Full Integration & Production Certification",
      prerequisiteTaskIds: ["task_03_integration", "task_04_verification"].filter((id) => taskIds.has(id)),
      successCriteria: "All test suites passing, TypeScript clean, npm run build exit code 0.",
      deliverable: "Certified production build artifact in release/.",
    },
  ];
}

/**
 * Identifies project risks and formulates actionable contingency strategies.
 *
 * @param context - Parsed context.
 * @returns Array of PlanRisk models.
 */
function identifyPlanRisks(context: ParsedContext): PlanRisk[] {
  const query = context.cleanedQuery.toLowerCase();
  const isPersonalGoal =
    /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn\s+(?:spanish|french|german|japanese|chinese|hindi|english)|habit|habits|study|studying|exam|reading|meditation|sleep)\b/i.test(query);
  const isBusinessGoal =
    /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(query);

  const risks: PlanRisk[] = [];

  if (isPersonalGoal) {
    risks.push({
      risk: "Overtraining, physical fatigue, or cognitive burnout from excessive initial volume",
      severity: "HIGH",
      triggerCondition: "Increasing session duration or intensity faster than 10% per week without adequate recovery",
      contingencyStrategy: "Enforce scheduled deload weeks, minimum 1-2 rest days per week, and sleep optimization.",
    });

    risks.push({
      risk: "Routine disruption and habit abandonment caused by unpredictable schedule conflicts",
      severity: "MEDIUM",
      triggerCondition: "Missed practice sessions leading to broken momentum and diminished habit automaticity",
      contingencyStrategy: "Implement the 'never miss twice' rule and fallback to a 5-minute minimum viable session.",
    });

    return risks;
  }

  if (isBusinessGoal) {
    risks.push({
      risk: "Municipal permitting or commercial zoning inspection delays pushing back opening timeline",
      severity: "HIGH",
      triggerCondition: "Health department or fire marshal scheduling backlog exceeding standard turnaround",
      contingencyStrategy: "Submit early permit applications with pre-audit consultation and maintain a 4-week float buffer.",
    });

    risks.push({
      risk: "Working capital depletion prior to reaching break-even customer throughput",
      severity: "CRITICAL",
      triggerCondition: "Opening overhead exceeding cash reserves before monthly gross margins stabilize",
      contingencyStrategy: "Maintain a 6-month operating runway buffer and launch promotional pre-orders prior to grand opening.",
    });

    return risks;
  }

  risks.push({
    risk: "Concurrency contention on shared local resources during multi-engine turns",
    severity: "HIGH",
    triggerCondition: "Simultaneous read/write operations on SQLite or shared EventBus under peak load",
    contingencyStrategy: "Enforce serialized async write queues and configure SQLite WAL mode with busy_timeout=5000.",
  });

  risks.push({
    risk: "Subsystem startup race condition leading to client request timeout",
    severity: "MEDIUM",
    triggerCondition: "Next.js API routes receiving user requests before Python voice child process signals readiness",
    contingencyStrategy: "Implement explicit asynchronous readiness healthcheck polling before enabling UI communication.",
  });

  if (query.includes("rewrite") || query.includes("migrate")) {
    risks.push({
      risk: "Regression across established security and authentication gates",
      severity: "CRITICAL",
      triggerCondition: "Modifying core protocol handlers or API routes without running regression suites",
      contingencyStrategy: "Execute tests_remediation_security.test.mjs immediately after every incremental change.",
    });
  }

  return risks;
}

/**
 * Generates an alternative fallback roadmap in the event that a critical dependency fails (Replanning).
 *
 * @param tasks - Primary task list.
 * @param context - Parsed context for domain adaptation.
 * @returns Formatted alternative roadmap string.
 */
function generateAlternativePlan(tasks: PlanTask[], context?: ParsedContext): string {
  const query = (context?.cleanedQuery || "").toLowerCase();
  const isPersonalGoal =
    /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn\s+(?:spanish|french|german|japanese|chinese|hindi|english)|habit|habits|study|studying|exam|reading|meditation|sleep)\b/i.test(query);
  const isBusinessGoal =
    /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(query);

  const primaryImplTask = tasks.find((t) => t.id === "task_02_implementation");

  if (isPersonalGoal) {
    return (
      `Contingency Fallback Roadmap (Personal Progression Protocol):\n` +
      `1. If "${primaryImplTask?.title || 'core training/practice'}" encounters fatigue, plateau, or schedule disruption,\n` +
      `   immediately reduce daily volume by 50% while preserving session frequency to maintain habit momentum.\n` +
      `2. Insert an active recovery or consolidation week focusing on low-intensity review / cross-training.\n` +
      `3. Utilize minimum viable practice routines (e.g. 5-10 minutes) on high-friction days to protect consistency.\n` +
      `4. Re-evaluate progression metrics before resuming scheduled volume increases.`
    );
  }

  if (isBusinessGoal) {
    return (
      `Contingency Fallback Roadmap (Commercial Contingency Protocol):\n` +
      `1. If commercial leasing or municipal permitting encounters unexpected regulatory delays,\n` +
      `   pivot immediately to pop-up operations, delivery partnerships, or catering pilots to validate customer demand.\n` +
      `2. Freeze non-essential fixed overhead expenses to conserve capital runway.\n` +
      `3. Secure alternative vendor agreements to mitigate supply chain bottlenecks.\n` +
      `4. Resume full build-out timeline once municipal approvals clear.`
    );
  }

  return (
    `Contingency Fallback Roadmap (Replanning Protocol):\n` +
    `1. If "${primaryImplTask?.title || 'core implementation'}" encounters unresolvable runtime friction or library incompatibility,\n` +
    `   immediately halt progression and freeze active branch state.\n` +
    `2. Revert to the last verified stable checkpoint on 'remediation/security-and-reliability'.\n` +
    `3. Deploy targeted in-process defensive validation guards (Complexity: 1, Impact: 4, Reversibility: EASILY_REVERSIBLE)\n` +
    `   as an intermediate bridge, preserving 100% backward compatibility while isolating the bottleneck.\n` +
    `4. Re-run verification suite ('node tests_cognitive_phase2.test.mjs; npx tsc --noEmit') before resuming.`
  );
}

/**
 * Main execution entry point for Component 06: Planning Intelligence Engine.
 *
 * @param context - Parsed context.
 * @param _reasoning - Optional results from Advanced Reasoning Engine.
 * @param _decision - Optional results from Decision Intelligence Engine.
 * @returns PlanningIntelligenceResult with DAG tasks, topological sequence, milestones, and contingency.
 */
export function performPlanningAnalysis(
  context: ParsedContext,
  reasoning?: AdvancedReasoningResult,
  decision?: DecisionIntelligenceResult
): PlanningIntelligenceResult {
  const contradictions = detectContradictions(context);
  const tasks = generateTasks(context);

  // If a recommended decision option exists, annotate the implementation task with its selection
  if (decision?.recommendedOption) {
    const implTask = tasks.find((t) => t.id === "task_02_implementation");
    if (implTask) {
      implTask.description += ` (Guided by Decision: "${decision.recommendedOption.name}")`;
    }
  }

  // If reasoning invariants exist, add them to completion criteria
  if (reasoning?.decomposedSubProblems) {
    const preflight = tasks.find((t) => t.id === "task_01_preflight");
    if (preflight) {
      const invCount = reasoning.decomposedSubProblems.flatMap((p) => p.invariants || []).length;
      preflight.description += ` [Auditing ${invCount} architectural invariants]`;
    }
  }

  const { sequence, hasCircularDependency, circularDetails } = computeTaskExecutionSequence(tasks);

  if (hasCircularDependency && circularDetails) {
    contradictions.push(circularDetails);
  }

  const milestones = buildMilestones(tasks, context);
  const risks = identifyPlanRisks(context);
  const alternativeFallbackPlan = generateAlternativePlan(tasks, context);

  const isPersonalGoal =
    /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn\s+(?:spanish|french|german|japanese|chinese|hindi|english)|habit|habits|study|studying|exam|reading|meditation|sleep)\b/i.test(context.cleanedQuery);
  const isBusinessGoal =
    /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(context.cleanedQuery);

  let successMetrics: string[];
  if (isPersonalGoal) {
    successMetrics = [
      "Consistent session adherence rate > 85% across scheduled training/study blocks.",
      "Measurable progression on target performance metrics without overtraining or burnout.",
      "Zero unmitigated injuries or routine drop-outs through structured rest periods.",
      "Successful completion of target milestone evaluation within scheduled timeframe.",
    ];
  } else if (isBusinessGoal) {
    successMetrics = [
      "Full municipal regulatory compliance and commercial permitting approved.",
      "Positive unit economics and operating margin demonstrated during soft launch.",
      "Core operational staffing and supplier fulfillment agreements secured.",
      "Customer satisfaction score > 85% during initial pilot operations.",
    ];
  } else {
    successMetrics = [
      "Zero regressions across existing 15 test suites.",
      "Clean TypeScript compilation ('npx tsc --noEmit' exit code 0).",
      "Production build certification ('npm run build' exit code 0).",
      "Adherence to 100% offline local execution with zero paid cloud APIs.",
    ];
  }

  return {
    goal: context.primaryGoal,
    tasks,
    executionSequence: sequence,
    milestones,
    criticalPath: sequence,
    risks,
    alternativeFallbackPlan,
    hasContradictions: contradictions.length > 0,
    contradictions,
    successMetrics,
    isAdvisoryOnly: true,
  };
}
