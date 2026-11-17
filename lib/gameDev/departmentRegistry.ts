/**
 * @file lib/gameDev/departmentRegistry.ts
 * @description Central Registry and Lifecycle Manager for Game Development Departments and Role Profiles.
 *
 * Subsystem:
 * Game Development Lifecycle Management - Lean Organization Engine.
 *
 * Key Responsibilities:
 * - Maintains definitions for the 4 persistent departments and their combined leader profiles.
 * - Seeds and manages the 6 persistent specialist profiles (total 10 permanent reusable profiles).
 * - Manages on-demand role templates (ATLAS, TERRA, ECHO, SENTINEL) that activate only when work is assigned.
 * - Provides non-destructive lifecycle transitions: `active` <-> `inactive` <-> `archived`.
 * - Preserves complete history, prior tasks, logs, and approved artifacts across all state transitions.
 * - Persists state lazily to `ultron_gamedev_vault.json` via atomic rename.
 *
 * Architectural Role & Interactions:
 * - Consulted by `resourceQueueEngine.ts` for role lookups and permissions.
 * - Consumed by Next.js `/api/gamedev` route to expose team topology and lifecycle management.
 *
 * Safety / Security Guarantees:
 * - Roles have narrow scoped permissions; cannot overwrite core ULTRON system files or credentials.
 * - Deactivating or archiving a role never deletes historical records or approved outputs.
 */

import fs from "fs";
import { defaultAppPathService } from "../security/appPathService.ts";
import type {
  Department,
  DepartmentSlug,
  RoleProfile,
  GameVision,
  GameDevVaultData,
} from "./types.ts";

// ── Baseline Approved Vision Seed ──────────────────────────────────────────
export const DEFAULT_GAME_VISION: GameVision = {
  id: "vision_prime",
  title: "Project Metropolis: Open-World Urban Sandbox",
  pitch: "A resource-conscious, story-driven open-world sandbox featuring modular urban mechanics, realistic NPC AI, and interactive narrative systems.",
  targetPlatform: "PC / Desktop (Windows)",
  targetHardwareBaseline: "Intel Core i5-8365U, 8GB RAM, Intel UHD 620",
  approvedCanon: [
    "Setting: Neo-Kalyan metropolitan district, 2035.",
    "Tone: Grounded neo-noir with tactical realism.",
    "Protagonist: Ex-tactical operator turning private investigator.",
    "Scale: Focused high-density district sandbox over unmanageable empty maps.",
  ],
  visualDirection: "Stylized photorealism with optimized deferred lighting and baked ambient occlusion for integrated GPUs.",
  scopeBoundaries: [
    "Single-player narrative campaign with dynamic radiant events.",
    "Maximum 3 concurrent vehicle physics simulations in active player cell.",
    "No MMO netcode or multi-server synchronization in Phase 1.",
  ],
  lastApprovedBy: "Founder",
  approvedAt: 1794895000000,
  version: 1,
};

// ── 4 Persistent Departments ────────────────────────────────────────────────
export const DEFAULT_DEPARTMENTS: Record<DepartmentSlug, Department> = {
  "production-coordination": {
    slug: "production-coordination",
    name: "Production Coordination",
    description: "Owns approved game vision, roadmap priorities, cross-functional handoffs, dependency tracking, and founder reports.",
    leaderProfileId: "NEXUS-01",
    isPersistent: true,
    allowedTaskTypes: ["roadmap", "coordination", "dependency_check", "vision_audit", "founder_report"],
    responsibilities: [
      "Translates founder vision into scoped milestones.",
      "Routes tasks and balances specialist workload.",
      "Enforces single-inference queue policy.",
      "Escalates scope/canon deviations to the founder.",
    ],
    dependencies: [],
    status: "operational",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "game-development": {
    slug: "game-development",
    name: "Game Development",
    description: "Combined FORGE & PULSE department owning gameplay architecture, player controller, physics, NPC behaviors, and bug fixes.",
    leaderProfileId: "FORGE-PULSE-01",
    isPersistent: true,
    allowedTaskTypes: ["gameplay_code", "npc_ai", "character_controller", "physics", "bug_fix"],
    responsibilities: [
      "Builds robust player movement, camera, and interaction mechanics.",
      "Implements state-machine and behavior-tree NPC logic.",
      "Engineers bug fixes referenced to QA reproduction steps.",
    ],
    dependencies: ["production-coordination"],
    status: "operational",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "quality-delivery": {
    slug: "quality-delivery",
    name: "Quality & Delivery",
    description: "Combined AEGIS & VELOCITY department owning defect reproduction, regression testing, build packaging, and release verification.",
    leaderProfileId: "AEGIS-VELOCITY-01",
    isPersistent: true,
    allowedTaskTypes: ["qa_repro", "bug_verification", "perf_audit", "release_build", "regression_test"],
    responsibilities: [
      "Discovers and documents reproducible defects with steps and logs.",
      "Independently validates engineering bug fixes before closing.",
      "Audits frame times and memory consumption on the i5 baseline.",
    ],
    dependencies: ["game-development"],
    status: "operational",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "marketing-media": {
    slug: "marketing-media",
    name: "Marketing & Media",
    description: "ORBIT department producing verified development logs, YouTube/Instagram video edits, devlogs, and rights-cleared promotion.",
    leaderProfileId: "ORBIT-01",
    isPersistent: true,
    allowedTaskTypes: ["devlog_draft", "video_script", "video_edit", "social_caption", "rights_audit"],
    responsibilities: [
      "Converts verified gameplay milestones into devlogs and teasers.",
      "Edits platform-ready YouTube and Instagram clips from approved captures.",
      "Verifies commercial rights for all music and voice assets.",
      "Submits all promotional publications for founder authorization.",
    ],
    dependencies: ["quality-delivery"],
    status: "operational",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "creative-direction": {
    slug: "creative-direction",
    name: "Creative & Character Direction",
    description: "On-demand department for game design architecture, character concept art briefs, and visual guidelines.",
    leaderProfileId: "ATLAS-A01",
    isPersistent: false,
    allowedTaskTypes: ["character_design", "art_direction", "design_document"],
    responsibilities: ["Defines visual bible and aesthetic constraints."],
    dependencies: ["production-coordination"],
    status: "standby",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "world-design": {
    slug: "world-design",
    name: "World & Level Design",
    description: "On-demand department for terrain structuring, environmental storytelling, and playable level layouts.",
    leaderProfileId: "TERRA-W01",
    isPersistent: false,
    allowedTaskTypes: ["level_layout", "environment_plan", "world_blockout"],
    responsibilities: ["Architects urban layouts and mission encounter zones."],
    dependencies: ["production-coordination"],
    status: "standby",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "narrative-audio": {
    slug: "narrative-audio",
    name: "Narrative & Audio",
    description: "On-demand department for dialogue trees, quest stories, ambient foley, and score briefs.",
    leaderProfileId: "ECHO-N01",
    isPersistent: false,
    allowedTaskTypes: ["dialogue_tree", "mission_narrative", "audio_brief"],
    responsibilities: ["Scripts dialogue and specifies sound implementation."],
    dependencies: ["production-coordination"],
    status: "standby",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
  "security-ops": {
    slug: "security-ops",
    name: "Security & Operations",
    description: "On-demand department for dependency audits, network sandbox verification, and release integrity gates.",
    leaderProfileId: "SENTINEL-SEC01",
    isPersistent: false,
    allowedTaskTypes: ["security_audit", "dependency_check", "release_gate"],
    responsibilities: ["Enforces integrity checkpoints and audits build artifacts."],
    dependencies: ["quality-delivery"],
    status: "standby",
    version: 1,
    createdAt: 1794895000000,
    updatedAt: 1794895000000,
  },
};

// ── 10 Reusable Profiles (4 Leaders + 6 Persistent Specialists) + 4 On-Demand Templates ──
export const DEFAULT_ROLE_PROFILES: Record<string, RoleProfile> = {
  // ── 4 Leader Profiles ──
  "NEXUS-01": {
    id: "NEXUS-01",
    departmentSlug: "production-coordination",
    name: "NEXUS Core",
    roleTitle: "Production Coordinator & Vision Custodian",
    isLeader: true,
    isOnDemandTemplate: false,
    mission: "Coordinate team priorities, route tasks, maintain vision fidelity, and provide founder digests without spinning up redundant sub-agents.",
    instructions: "Evaluate incoming requests against the approved GameVision document. Route to the leanest active specialist. Queue all local inference through the central resource manager.",
    skills: ["Milestone Planning", "Dependency Graphing", "Vision Alignment", "Resource Auditing"],
    requiredInputs: ["Founder Prompt or Feature Request", "GameVision Baseline"],
    deliverables: ["Scoped Task Specifications", "Prioritized Workwaves", "Weekly Dev Digests"],
    acceptanceCriteria: ["Zero deviation from approved canon without founder approval", "No un-queued model inference dispatched"],
    allowedTools: ["task_router", "vision_checker", "dependency_analyzer"],
    escalationRules: ["Escalate scope changes to Founder immediately", "Escalate hardware resource pressure to Quality & Delivery"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "FORGE-PULSE-01": {
    id: "FORGE-PULSE-01",
    departmentSlug: "game-development",
    name: "FORGE + PULSE Lead",
    roleTitle: "Lead Gameplay & Systems Architect",
    isLeader: true,
    isOnDemandTemplate: false,
    mission: "Oversee gameplay code, core physics loops, AI behavior systems, and technical implementation hygiene.",
    instructions: "Ensure code adheres to low-overhead design suited for integrated GPUs. Review specialist PRs and verify architectural isolation.",
    skills: ["C# / TypeScript Architecture", "Physics Optimization", "NPC State Machines", "Memory Profiling"],
    requiredInputs: ["Feature Brief from NEXUS", "Approved Visual/Mechanical Constraints"],
    deliverables: ["Engine Systems Architecture", "Approved Gameplay Patches", "Code Review Verdicts"],
    acceptanceCriteria: ["Target 30+ FPS baseline on UHD 620", "Clean compile with zero memory leaks"],
    allowedTools: ["code_analyzer", "git_vcs", "profiler_stub"],
    escalationRules: ["Escalate severe performance drops to NEXUS", "Escalate blocked dependencies to Quality"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "AEGIS-VELOCITY-01": {
    id: "AEGIS-VELOCITY-01",
    departmentSlug: "quality-delivery",
    name: "AEGIS + VELOCITY Lead",
    roleTitle: "Lead Quality, Release & Performance Architect",
    isLeader: true,
    isOnDemandTemplate: false,
    mission: "Own regression testing, bug verification gates, release packaging, and automated performance validation.",
    instructions: "Never sign off on an engineering fix without verifiable test evidence. Guard the release branch against untested commits.",
    skills: ["Defect Triage", "Performance Benchmarking", "CI/CD Gatekeeping", "Regression Analysis"],
    requiredInputs: ["Engineering Commits", "Bug Reproduction Specs"],
    deliverables: ["QA Verification Reports", "Build Release Candidate", "Performance Telemetry Log"],
    acceptanceCriteria: ["100% of reported bugs independently verified before closure", "Zero unverified marketing claims"],
    allowedTools: ["test_runner", "telemetry_collector", "build_packager"],
    escalationRules: ["Block release if critical bug remains open", "Escalate recurring regressions to FORGE Lead"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "ORBIT-01": {
    id: "ORBIT-01",
    departmentSlug: "marketing-media",
    name: "ORBIT Director",
    roleTitle: "Lead Marketing & Media Strategist",
    isLeader: true,
    isOnDemandTemplate: false,
    mission: "Steer development marketing by translating verified engineering milestones into steady, low-cost community updates.",
    instructions: "Ensure marketing content strictly reflects verified features. All publication schedules require founder authorization.",
    skills: ["Devlog Strategy", "Audience Engagement", "Content Calendar", "Copyright Compliance"],
    requiredInputs: ["Verified Milestone Reports from AEGIS", "Gameplay Recording Vault"],
    deliverables: ["Monthly Content Calendars", "Publication Approval Requests", "Engagement Analytics"],
    acceptanceCriteria: ["Zero unverified feature claims", "Zero publication without explicit founder approval token"],
    allowedTools: ["content_planner", "rights_auditor", "approval_coordinator"],
    escalationRules: ["Escalate unverified marketing claims to AEGIS", "Escalate all release publications to Founder"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },

  // ── 6 Persistent Specialist Profiles ──
  "FORGE-GAMEPLAY-01": {
    id: "FORGE-GAMEPLAY-01",
    departmentSlug: "game-development",
    name: "Gameplay Engineer",
    roleTitle: "Core Gameplay & Mechanics Specialist",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Implement player controllers, vehicle handling, weapon mechanics, and physics interactions.",
    instructions: "Write lean, modular mechanics code with deterministic state updates.",
    skills: ["Player Controller", "Camera Systems", "Vehicle Physics", "Collision Tuning"],
    requiredInputs: ["Gameplay Specification", "Physics Constraints"],
    deliverables: ["Script Modules", "Unit Tests", "Fix Commits"],
    acceptanceCriteria: ["Responsive controls with under 16ms frame budget overhead"],
    allowedTools: ["code_editor", "git_vcs"],
    escalationRules: ["Escalate physics glitches affecting balance to FORGE Lead"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "FORGE-NPC-01": {
    id: "FORGE-NPC-01",
    departmentSlug: "game-development",
    name: "NPC & Mission Specialist",
    roleTitle: "NPC AI & Mission Systems Engineer",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Develop pedestrian and enemy AI behaviors, traffic density management, and quest logic.",
    instructions: "Use efficient hierarchical finite-state machines. Limit active high-fidelity NPC updates to the player's immediate radius.",
    skills: ["Behavior Trees", "Pathfinding (NavMesh)", "Traffic AI", "Quest State Machines"],
    requiredInputs: ["Mission Outline", "NPC Design Archetypes"],
    deliverables: ["AI Controller Scripts", "Quest Logic Trees"],
    acceptanceCriteria: ["AI does not stall or drop frame rate below 30 FPS with 20 active NPCs"],
    allowedTools: ["code_editor", "git_vcs"],
    escalationRules: ["Escalate pathfinding memory bloat to Performance Specialist"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "AEGIS-QA-01": {
    id: "AEGIS-QA-01",
    departmentSlug: "quality-delivery",
    name: "QA & Bug Investigator",
    roleTitle: "Defect Reproduction & Verification Specialist",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Record clear, reproducible bug reports with steps, logs, and severity, then verify fixes independently.",
    instructions: "Write deterministic repro steps. Never close a defect without validating the exact steps against the fix build.",
    skills: ["Defect Documentation", "Exploratory Testing", "Log Analysis", "Regression Verification"],
    requiredInputs: ["Playtest Logs", "Engine Build", "Engineering Patch"],
    deliverables: ["BugReport Records", "QA Verification Passes"],
    acceptanceCriteria: ["Clear steps to reproduce", "Every closed bug contains verified commit reference and test notes"],
    allowedTools: ["bug_tracker", "log_viewer", "test_harness"],
    escalationRules: ["Escalate game-breaking crashes to FORGE Lead and NEXUS immediately"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "AEGIS-PERF-01": {
    id: "AEGIS-PERF-01",
    departmentSlug: "quality-delivery",
    name: "Performance & Release Specialist",
    roleTitle: "Hardware Benchmarking & Release Engineer",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Monitor resource consumption against the Intel i5-8365U baseline and package clean builds.",
    instructions: "Benchmark draw calls, RAM allocation, and shader complexity. Flag any commit exceeding 6GB RAM in development.",
    skills: ["Hardware Profiling", "Build Packaging", "Draw Call Budgeting", "Crash Dump Analysis"],
    requiredInputs: ["Master Branch Commits", "Target Hardware Specs"],
    deliverables: ["Performance Scorecards", "Release Build Packages"],
    acceptanceCriteria: ["Build runs stably within 8GB system RAM limit"],
    allowedTools: ["profiler", "build_packager", "telemetry"],
    escalationRules: ["Escalate hardware bottlenecks to NEXUS and FORGE Leads"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "ORBIT-MKT-01": {
    id: "ORBIT-MKT-01",
    departmentSlug: "marketing-media",
    name: "Marketing Content Producer",
    roleTitle: "Devlog Scriptwriter & Community Copywriter",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Write punchy, authentic devlog scripts, YouTube titles/descriptions, and Instagram captions based solely on verified features.",
    instructions: "Anchor every post to a verified milestone from QA. Never hype unbuilt or speculative mechanics.",
    skills: ["Video Scriptwriting", "Copywriting", "SEO & Tagging", "Community Tone"],
    requiredInputs: ["Verified QA Milestone Notes", "Video Asset Specs"],
    deliverables: ["Video Scripts", "Social Post Drafts", "SEO Descriptions"],
    acceptanceCriteria: ["All claims mapped 1:1 to verified feature status"],
    allowedTools: ["script_editor", "fact_checker"],
    escalationRules: ["Escalate feature claim ambiguities to QA Lead"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },
  "ORBIT-VIDEO-01": {
    id: "ORBIT-VIDEO-01",
    departmentSlug: "marketing-media",
    name: "Video Editor",
    roleTitle: "Gameplay Capture & Short-Form Video Editor",
    isLeader: false,
    isOnDemandTemplate: false,
    mission: "Produce platform-optimized gameplay videos for YouTube (16:9) and Instagram (9:16) using approved captures.",
    instructions: "Keep video renders separate from model inference or game engine compiles. Verify music and voice permissions.",
    skills: ["Gameplay Video Editing", "Aspect Ratio Optimization", "Audio Leveling", "Thumbnail Creation"],
    requiredInputs: ["Approved Gameplay Screen Recordings", "Script from Content Producer"],
    deliverables: ["YouTube Devlog Cut (1080p)", "Instagram Reels / Shorts Cut", "Thumbnail Art"],
    acceptanceCriteria: ["Exported video strictly uses approved footage and documented rights-cleared audio"],
    allowedTools: ["video_export_coordinator", "rights_validator"],
    escalationRules: ["Escalate missing audio license to ORBIT Director"],
    sharedRuntimeRef: "ollama-local",
    status: "active",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "Initial organization bootstrap", actor: "System" }],
  },

  // ── 4 On-Demand Role Templates (Inactive by default) ──
  "ATLAS-A01": {
    id: "ATLAS-A01",
    departmentSlug: "creative-direction",
    name: "Creative & Character Architect",
    roleTitle: "Lead Character & Game Design Template",
    isLeader: true,
    isOnDemandTemplate: true,
    mission: "Establish visual guides, character background profiles, and high-level design specifications on demand.",
    instructions: "Activate for specific character design phases. Complete approved character deliverables, then archive until next revision.",
    skills: ["Character Design", "Aesthetic Art Direction", "GDD Authoring"],
    requiredInputs: ["Vision Brief from NEXUS"],
    deliverables: ["Character Bio Dossiers", "Visual Style Bible", "Design Document"],
    acceptanceCriteria: ["Character design fits neo-noir 2035 canon"],
    allowedTools: ["doc_authoring"],
    escalationRules: ["Escalate canon clashes to NEXUS Lead"],
    sharedRuntimeRef: "ollama-local",
    status: "inactive",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "On-demand template registered", actor: "System" }],
  },
  "TERRA-W01": {
    id: "TERRA-W01",
    departmentSlug: "world-design",
    name: "World & Level Architect",
    roleTitle: "Urban Layout & Level Design Template",
    isLeader: true,
    isOnDemandTemplate: true,
    mission: "Design urban district blockouts, mission encounter spaces, and environmental layouts on demand.",
    instructions: "Produce lightweight blockouts that respect integrated GPU occlusion culling. Archive when layout is approved.",
    skills: ["Level Blockout", "Urban Geography", "Occlusion Planning"],
    requiredInputs: ["District Theme Brief", "Encounter Requirements"],
    deliverables: ["Level Layout Schematics", "Blockout Models", "Art Asset Handoff Lists"],
    acceptanceCriteria: ["Sightlines structured to maintain low draw call count"],
    allowedTools: ["level_planner"],
    escalationRules: ["Escalate geometry complexity to Performance Specialist"],
    sharedRuntimeRef: "ollama-local",
    status: "inactive",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "On-demand template registered", actor: "System" }],
  },
  "ECHO-N01": {
    id: "ECHO-N01",
    departmentSlug: "narrative-audio",
    name: "Narrative & Audio Specialist",
    roleTitle: "Dialogue & Sound Design Template",
    isLeader: true,
    isOnDemandTemplate: true,
    mission: "Draft branching dialogue trees, quest scripts, and audio implementation briefs on demand.",
    instructions: "Keep dialogue concise and voice-ready. Specify spatial audio cues. Archive when quest audio brief is delivered.",
    skills: ["Branching Narrative", "Dialogue Scripting", "Sound Design Cue Sheets"],
    requiredInputs: ["Mission Outline", "Character Dossiers"],
    deliverables: ["Dialogue Trees (JSON/Yarn)", "Foley Sound Cue Lists"],
    acceptanceCriteria: ["Fits neo-noir tone and character voice rules"],
    allowedTools: ["narrative_editor"],
    escalationRules: ["Escalate narrative inconsistencies to NEXUS Lead"],
    sharedRuntimeRef: "ollama-local",
    status: "inactive",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "On-demand template registered", actor: "System" }],
  },
  "SENTINEL-SEC01": {
    id: "SENTINEL-SEC01",
    departmentSlug: "security-ops",
    name: "Security Operations Specialist",
    roleTitle: "Game Security & Release Gate Template",
    isLeader: true,
    isOnDemandTemplate: true,
    mission: "Conduct security audits, dependency checks, and release integrity validations on demand at release gates.",
    instructions: "Activate during pre-release gates. Verify sandbox boundaries and file integrity, then archive.",
    skills: ["Vulnerability Auditing", "Dependency Scanning", "Checksum Verification"],
    requiredInputs: ["Release Candidate Build", "Package Manifest"],
    deliverables: ["Security Gate Audit Report", "SHA-256 Release Manifest"],
    acceptanceCriteria: ["Zero critical CVEs; package manifest hashes match physical build"],
    allowedTools: ["security_scanner", "hash_verifier"],
    escalationRules: ["Block release immediately if critical tamper or malware signature is detected"],
    sharedRuntimeRef: "ollama-local",
    status: "inactive",
    version: 1,
    history: [{ timestamp: 1794895000000, action: "created", reason: "On-demand template registered", actor: "System" }],
  },
};

/**
 * Singleton Registry for Game Development Departments and Role Profiles.
 */
export class DepartmentRegistry {
  private static _instance: DepartmentRegistry | null = null;
  private _departments: Record<DepartmentSlug, Department>;
  private _roles: Record<string, RoleProfile>;
  private _vision: GameVision;
  private _isLoaded: boolean = false;

  private constructor() {
    this._departments = { ...DEFAULT_DEPARTMENTS };
    this._roles = { ...DEFAULT_ROLE_PROFILES };
    this._vision = { ...DEFAULT_GAME_VISION };
  }

  public static getInstance(): DepartmentRegistry {
    if (!DepartmentRegistry._instance) {
      DepartmentRegistry._instance = new DepartmentRegistry();
      DepartmentRegistry._instance.loadFromVaultSync();
    }
    return DepartmentRegistry._instance;
  }

  /**
   * Lazily loads the registry from disk if available, otherwise initializes defaults without writing.
   */
  public loadFromVaultSync(): void {
    if (this._isLoaded) return;
    try {
      const vaultPath = defaultAppPathService.getGameDevVaultPath();
      if (fs.existsSync(vaultPath)) {
        const raw = fs.readFileSync(vaultPath, "utf8");
        const parsed: GameDevVaultData = JSON.parse(raw);
        if (parsed && parsed.departments && parsed.roles && parsed.vision) {
          this._departments = parsed.departments;
          this._roles = parsed.roles;
          this._vision = parsed.vision;
        }
      }
    } catch (err) {
      console.warn("[GAME DEV REGISTRY] Failed to load saved vault, retaining default in-memory state:", err);
    } finally {
      this._isLoaded = true;
    }
  }

  /**
   * Atomically saves registry and domain data to disk.
   */
  public persistVaultSync(additionalData?: Partial<GameDevVaultData>): void {
    const vaultPath = defaultAppPathService.getGameDevVaultPath();
    const payload: GameDevVaultData = {
      version: 1,
      lastUpdated: Date.now(),
      vision: this._vision,
      departments: this._departments,
      roles: this._roles,
      tasks: additionalData?.tasks || {},
      bugs: additionalData?.bugs || {},
      marketingDrafts: additionalData?.marketingDrafts || {},
      jobs: additionalData?.jobs || {},
    };

    const tempPath = `${vaultPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tempPath, vaultPath);
    } catch {
      try {
        fs.copyFileSync(tempPath, vaultPath);
        fs.unlinkSync(tempPath);
      } catch (err) {
        console.error("[GAME DEV REGISTRY] Failed to atomically save game dev vault:", err);
      }
    }
  }

  // ── Query Methods ──
  public getVision(): GameVision {
    return { ...this._vision };
  }

  public updateVision(patch: Partial<GameVision>, author: string): GameVision {
    this._vision = {
      ...this._vision,
      ...patch,
      lastApprovedBy: author,
      approvedAt: Date.now(),
      version: this._vision.version + 1,
    };
    this.persistVaultSync();
    return { ...this._vision };
  }

  public getDepartments(): Department[] {
    return Object.values(this._departments);
  }

  public getDepartment(slug: DepartmentSlug): Department | null {
    return this._departments[slug] ? { ...this._departments[slug] } : null;
  }

  public getRoleProfiles(filter?: { departmentSlug?: DepartmentSlug; status?: RoleProfile["status"] }): RoleProfile[] {
    let list = Object.values(this._roles);
    if (filter?.departmentSlug) {
      list = list.filter((r) => r.departmentSlug === filter.departmentSlug);
    }
    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status);
    }
    return list.map((r) => ({ ...r }));
  }

  public getRoleProfile(id: string): RoleProfile | null {
    return this._roles[id] ? { ...this._roles[id] } : null;
  }

  // ── Role Lifecycle Transitions ──

  /**
   * Activates an inactive or archived role profile for task execution.
   */
  public activateProfile(id: string, reason: string, actor: string): RoleProfile {
    const role = this._roles[id];
    if (!role) throw new Error(`Role profile "${id}" not found.`);

    role.status = "active";
    role.history.push({
      timestamp: Date.now(),
      action: "activated",
      reason,
      actor,
    });
    this.persistVaultSync();
    return { ...role };
  }

  /**
   * Deactivates a role profile when not actively engaged in tasks, keeping it ready for quick wake-up.
   */
  public deactivateProfile(id: string, reason: string, actor: string): RoleProfile {
    const role = this._roles[id];
    if (!role) throw new Error(`Role profile "${id}" not found.`);

    role.status = "inactive";
    role.history.push({
      timestamp: Date.now(),
      action: "deactivated",
      reason,
      actor,
    });
    this.persistVaultSync();
    return { ...role };
  }

  /**
   * Archives a completed on-demand role profile. Never deletes prior tasks, decisions, or outputs.
   */
  public archiveProfile(id: string, reason: string, actor: string): RoleProfile {
    const role = this._roles[id];
    if (!role) throw new Error(`Role profile "${id}" not found.`);

    role.status = "archived";
    role.history.push({
      timestamp: Date.now(),
      action: "archived",
      reason,
      actor,
    });
    this.persistVaultSync();
    return { ...role };
  }
}

export const defaultDepartmentRegistry = DepartmentRegistry.getInstance();
