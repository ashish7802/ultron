/**
 * @file app/api/gamedev/route.ts
 * @description Next.js REST API Route for the Resource-Aware Game Development Team.
 *
 * Subsystem:
 * Game Development Lifecycle Management.
 *
 * Key Responsibilities:
 * - Exposes endpoints to inspect departments, active/inactive/archived role profiles, and hardware queue telemetry.
 * - Manages role profile lifecycle transitions (`activate`, `deactivate`, `archive`).
 * - Handles bug intake, engineering handoffs, and independent QA verification gates.
 * - Handles marketing video drafts, rights tracking, and founder publication approvals.
 * - Provides access to the approved GameVision anchor.
 *
 * Architectural Role & Safety Guarantees:
 * - Uses `validateDesktopSession` to gate API access.
 * - Enforces founder-level permission checks for vision modifications and publication approvals.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession } from "@/lib/sessionGate";
import {
  defaultDepartmentRegistry,
  defaultResourceQueueEngine,
  defaultBugLifecycleEngine,
  defaultMarketingEngine,
  type DepartmentSlug,
  type BugStatus,
  type BugSeverity,
} from "@/lib/gameDev";

export async function GET(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource") || "overview";

  try {
    switch (resource) {
      case "vision":
        return NextResponse.json({ ok: true, vision: defaultDepartmentRegistry.getVision() });

      case "departments":
        return NextResponse.json({ ok: true, departments: defaultDepartmentRegistry.getDepartments() });

      case "roles": {
        const dept = searchParams.get("dept") as DepartmentSlug | null;
        const status = searchParams.get("status") as "active" | "inactive" | "archived" | null;
        const roles = defaultDepartmentRegistry.getRoleProfiles({
          departmentSlug: dept || undefined,
          status: status || undefined,
        });
        return NextResponse.json({ ok: true, count: roles.length, roles });
      }

      case "queue":
        return NextResponse.json({ ok: true, queue: defaultResourceQueueEngine.getQueueStatus() });

      case "bugs": {
        const status = searchParams.get("status") as BugStatus | null;
        const severity = searchParams.get("severity") as BugSeverity | null;
        const bugs = defaultBugLifecycleEngine.listBugs({
          status: status || undefined,
          severity: severity || undefined,
        });
        return NextResponse.json({ ok: true, count: bugs.length, bugs });
      }

      case "marketing": {
        const drafts = defaultMarketingEngine.listDrafts();
        return NextResponse.json({ ok: true, count: drafts.length, drafts });
      }

      case "overview":
      default: {
        return NextResponse.json({
          ok: true,
          vision: defaultDepartmentRegistry.getVision(),
          departments: defaultDepartmentRegistry.getDepartments(),
          roles: defaultDepartmentRegistry.getRoleProfiles(),
          queue: defaultResourceQueueEngine.getQueueStatus(),
          bugsCount: defaultBugLifecycleEngine.listBugs().length,
          draftsCount: defaultMarketingEngine.listDrafts().length,
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const actorRole = auth.session?.userRole || "operator";

  try {
    const body = await req.json();
    const action = body.action;

    if (!action || typeof action !== "string") {
      return NextResponse.json({ ok: false, error: "Action is required." }, { status: 400 });
    }

    switch (action) {
      // ── Role Profile Lifecycle ──
      case "activate_profile": {
        const { roleId, reason } = body;
        if (!roleId) return NextResponse.json({ ok: false, error: "roleId is required" }, { status: 400 });
        const profile = defaultDepartmentRegistry.activateProfile(roleId, reason || "Task assigned", actorRole);
        return NextResponse.json({ ok: true, profile });
      }

      case "deactivate_profile": {
        const { roleId, reason } = body;
        if (!roleId) return NextResponse.json({ ok: false, error: "roleId is required" }, { status: 400 });
        const profile = defaultDepartmentRegistry.deactivateProfile(roleId, reason || "Idle", actorRole);
        return NextResponse.json({ ok: true, profile });
      }

      case "archive_profile": {
        const { roleId, reason } = body;
        if (!roleId) return NextResponse.json({ ok: false, error: "roleId is required" }, { status: 400 });
        const profile = defaultDepartmentRegistry.archiveProfile(roleId, reason || "Milestone completed", actorRole);
        return NextResponse.json({ ok: true, profile });
      }

      // ── Vision Updates ──
      case "update_vision": {
        if (actorRole !== "founder") {
          return NextResponse.json({ ok: false, error: "Forbidden: Only founder can update GameVision." }, { status: 403 });
        }
        const updated = defaultDepartmentRegistry.updateVision(body.patch || {}, actorRole);
        return NextResponse.json({ ok: true, vision: updated });
      }

      // ── Bug Tracking & Verification ──
      case "report_bug": {
        const bug = defaultBugLifecycleEngine.reportBug({
          title: body.title,
          buildVersion: body.buildVersion,
          stepsToReproduce: body.stepsToReproduce,
          expectedResult: body.expectedResult,
          actualResult: body.actualResult,
          severity: body.severity,
          affectedSubsystem: body.affectedSubsystem,
          reportedByRoleId: body.reportedByRoleId || "AEGIS-QA-01",
        });
        return NextResponse.json({ ok: true, bug });
      }

      case "assign_bug": {
        const bug = defaultBugLifecycleEngine.assignBug(body.bugId, body.engineerRoleId);
        return NextResponse.json({ ok: true, bug });
      }

      case "propose_fix": {
        const bug = defaultBugLifecycleEngine.proposeFix(body.bugId, body.engineerRoleId, body.commitRef);
        return NextResponse.json({ ok: true, bug });
      }

      case "verify_bug": {
        const bug = defaultBugLifecycleEngine.verifyBugFix(
          body.bugId,
          body.qaRoleId || "AEGIS-QA-01",
          Boolean(body.passed),
          body.notes || "Verified against test harness"
        );
        return NextResponse.json({ ok: true, bug });
      }

      // ── Marketing & Video Pipeline ──
      case "create_marketing_draft": {
        const draft = defaultMarketingEngine.createDraft({
          title: body.title,
          targetPlatforms: body.targetPlatforms || ["youtube", "instagram"],
          milestoneReference: body.milestoneReference,
          verifiedFeatureStatus: body.verifiedFeatureStatus,
          script: body.script,
          captions: body.captions || [],
          suggestedTags: body.suggestedTags || [],
          sourceFootagePath: body.sourceFootagePath,
          rightsMetadata: body.rightsMetadata || {
            isAiClonedVoice: false,
            rightsAttestation: "Original gameplay footage, all rights reserved.",
            complianceChecked: true,
          },
        });
        return NextResponse.json({ ok: true, draft });
      }

      case "attach_video": {
        const draft = defaultMarketingEngine.attachVideoCut(body.draftId, body.editedVideoPath, body.thumbnailPath);
        return NextResponse.json({ ok: true, draft });
      }

      case "review_marketing_draft": {
        const draft = defaultMarketingEngine.reviewDraft(body.draftId, Boolean(body.approved), body.approvalToken);
        return NextResponse.json({ ok: true, draft });
      }

      case "publish_marketing_draft": {
        const draft = defaultMarketingEngine.publishDraft(body.draftId);
        return NextResponse.json({ ok: true, draft });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
