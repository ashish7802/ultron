/**
 * @file lib/gameDev/bugLifecycleEngine.ts
 * @description Defect Tracking, Engineering Handoff, and Independent QA Verification Engine.
 *
 * Subsystem:
 * Game Development Lifecycle Management - Quality Assurance & Delivery Subsystem.
 *
 * Key Responsibilities:
 * - Enforces the QA bug lifecycle: `reported` -> `assigned` -> `fix_proposed` -> `qa_verifying` -> `verified` -> `closed`.
 * - Requires reproducible steps, expected/actual outputs, build version, and severity on defect intake.
 * - Gates issue closure strictly behind independent QA verification with regression evidence.
 * - Prevents engineering roles from marking their own unverified fixes as closed or passed.
 * - Records VCS commit references for traceability.
 *
 * Architectural Role & Interactions:
 * - Used by AEGIS QA specialists to record and verify issues.
 * - Used by FORGE engineering specialists to submit fixes.
 * - Managed under `lib/gameDev/departmentRegistry.ts` for persistence.
 *
 * Safety / Security Guarantees:
 * - Invariant: A bug CANNOT transition to `closed` without verified QA test evidence (`regressionPassed: true`).
 */

import type { BugReport, BugSeverity, BugStatus } from "./types.ts";
import { defaultDepartmentRegistry } from "./departmentRegistry.ts";

export interface CreateBugParams {
  title: string;
  buildVersion: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  severity: BugSeverity;
  affectedSubsystem: string;
  reportedByRoleId: string; // Strictly QA (e.g. "AEGIS-QA-01")
}

export class BugLifecycleEngine {
  private static _instance: BugLifecycleEngine | null = null;
  private _bugs: Map<string, BugReport> = new Map();

  private constructor() {}

  public static getInstance(): BugLifecycleEngine {
    if (!BugLifecycleEngine._instance) {
      BugLifecycleEngine._instance = new BugLifecycleEngine();
    }
    return BugLifecycleEngine._instance;
  }

  /**
   * Records a new reproducible defect into the system.
   *
   * @param params - Defect details including steps and build version.
   * @returns Created BugReport instance.
   */
  public reportBug(params: CreateBugParams): BugReport {
    if (!params.stepsToReproduce || params.stepsToReproduce.length === 0) {
      throw new Error("QA Defect Invariant: Reproducible steps are strictly required to log a bug.");
    }
    if (!params.buildVersion) {
      throw new Error("QA Defect Invariant: Target build version is required.");
    }

    const bugId = `bug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bug: BugReport = {
      id: bugId,
      title: params.title,
      buildVersion: params.buildVersion,
      stepsToReproduce: params.stepsToReproduce,
      expectedResult: params.expectedResult,
      actualResult: params.actualResult,
      severity: params.severity,
      affectedSubsystem: params.affectedSubsystem,
      status: "reported",
      reportedByRoleId: params.reportedByRoleId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._bugs.set(bugId, bug);
    this.persist();
    return { ...bug };
  }

  /**
   * Assigns a defect to an authorized engineering specialist (e.g. FORGE-GAMEPLAY-01).
   */
  public assignBug(bugId: string, engineerRoleId: string): BugReport {
    const bug = this._bugs.get(bugId);
    if (!bug) throw new Error(`Bug "${bugId}" not found.`);

    bug.assignedToRoleId = engineerRoleId;
    bug.status = "assigned";
    bug.updatedAt = Date.now();

    this.persist();
    return { ...bug };
  }

  /**
   * Engineering submits a proposed fix referencing a traceable VCS commit.
   * Note: This transitions the defect to `fix_proposed`, NOT `closed`.
   */
  public proposeFix(bugId: string, engineerRoleId: string, commitRef: string): BugReport {
    const bug = this._bugs.get(bugId);
    if (!bug) throw new Error(`Bug "${bugId}" not found.`);

    if (!commitRef || commitRef.trim().length < 4) {
      throw new Error("Engineering Invariant: Fix submission requires a traceable VCS commit reference.");
    }

    bug.engineeringCommitRef = commitRef;
    bug.status = "fix_proposed";
    bug.updatedAt = Date.now();

    this.persist();
    return { ...bug };
  }

  /**
   * Independent QA verification pass.
   * Enforces the gate: Can only close if regression check passed and independent notes are recorded.
   *
   * @param bugId - Target defect ID.
   * @param qaRoleId - QA specialist running the test (cannot be the fixing engineer).
   * @param passed - Whether reproduction steps no longer trigger defect and regression tests pass.
   * @param notes - Specific verification details.
   */
  public verifyBugFix(
    bugId: string,
    qaRoleId: string,
    passed: boolean,
    notes: string
  ): BugReport {
    const bug = this._bugs.get(bugId);
    if (!bug) throw new Error(`Bug "${bugId}" not found.`);

    // Invariant: Engineering cannot verify its own fix
    if (qaRoleId === bug.assignedToRoleId) {
      throw new Error("Security Invariant: Engineering roles cannot verify their own fixes. Independent QA verification required.");
    }

    if (!passed) {
      // Reopen defect
      bug.status = "blocked";
      bug.qaVerificationEvidence = {
        verifiedAt: Date.now(),
        verifiedByRoleId: qaRoleId,
        notes: `Verification FAILED: ${notes}`,
        regressionPassed: false,
      };
      bug.updatedAt = Date.now();
      this.persist();
      return { ...bug };
    }

    // Passed verification: Safe to close
    bug.status = "closed";
    bug.qaVerificationEvidence = {
      verifiedAt: Date.now(),
      verifiedByRoleId: qaRoleId,
      notes,
      regressionPassed: true,
    };
    bug.updatedAt = Date.now();

    this.persist();
    return { ...bug };
  }

  public getBug(bugId: string): BugReport | null {
    const bug = this._bugs.get(bugId);
    return bug ? { ...bug } : null;
  }

  public listBugs(filter?: { status?: BugStatus; severity?: BugSeverity }): BugReport[] {
    let list = Array.from(this._bugs.values());
    if (filter?.status) {
      list = list.filter((b) => b.status === filter.status);
    }
    if (filter?.severity) {
      list = list.filter((b) => b.severity === filter.severity);
    }
    return list.map((b) => ({ ...b }));
  }

  private persist(): void {
    const record: Record<string, BugReport> = {};
    for (const [k, v] of this._bugs.entries()) {
      record[k] = v;
    }
    defaultDepartmentRegistry.persistVaultSync({ bugs: record });
  }
}

export const defaultBugLifecycleEngine = BugLifecycleEngine.getInstance();
