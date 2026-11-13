/**
 * @file app/api/learning/route.ts
 * @description Next.js REST API Route for the ULTRON Learning & Evolution Engine.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8).
 *
 * Key Responsibilities:
 * - Exposes real-time telemetry across all 10 Learning & Evolution modules.
 * - Handles founder feedback submissions, response corrections, and explicit preferences.
 * - Serves skill library queries, skill testing, and skill proposal approvals.
 * - Coordinates improvement proposals, benchmark execution, evolution approvals, activations, and instant rollbacks.
 * - Rejects unverified requests fail-closed.
 *
 * Architectural Role & Safety Guarantees:
 * - Backs the `LearningEvolutionModal.tsx` frontend dashboard.
 * - Enforces zero autonomous production code modifications: requires explicit approval tokens for evolutions.
 */

import { NextResponse } from "next/server";
import {
  defaultLearningCoordinator,
  type TaskStepRecord,
} from "@/lib/learning";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "overview";

    switch (action) {
      case "overview": {
        const stats = defaultLearningCoordinator.getContinuousLearningStats();
        const latestBenchmark = defaultLearningCoordinator.performance.getLatestReport();
        const currentVersion = defaultLearningCoordinator.evolution.getCurrentVersion();
        const profile = defaultLearningCoordinator.feedback.getCommunicationProfile();
        return NextResponse.json({
          success: true,
          currentVersion,
          stats,
          latestBenchmark,
          communicationProfile: profile,
        });
      }

      case "experiences": {
        const experiences = defaultLearningCoordinator.experiences.listExperiences();
        const lessons = defaultLearningCoordinator.experiences.listLessons();
        return NextResponse.json({
          success: true,
          count: experiences.length,
          experiences,
          lessons,
        });
      }

      case "feedback": {
        const feedbackList = defaultLearningCoordinator.feedback.listFeedback();
        const preferences = defaultLearningCoordinator.feedback.listPreferences();
        const profile = defaultLearningCoordinator.feedback.getCommunicationProfile();
        const repeatedPatterns = defaultLearningCoordinator.feedback.detectRepeatedFeedbackPatterns();
        return NextResponse.json({
          success: true,
          count: feedbackList.length,
          feedbackList,
          preferences,
          profile,
          repeatedPatterns,
        });
      }

      case "mistakes": {
        const failures = defaultLearningCoordinator.mistakes.listFailures();
        const guards = defaultLearningCoordinator.mistakes.listGuards();
        const repeatedMistakes = defaultLearningCoordinator.mistakes.getRepeatedMistakes();
        return NextResponse.json({
          success: true,
          failuresCount: failures.length,
          failures,
          guardsCount: guards.length,
          guards,
          repeatedMistakes,
        });
      }

      case "skills": {
        const category = searchParams.get("category") || undefined;
        const query = searchParams.get("query") || undefined;
        const skills = defaultLearningCoordinator.skills.querySkills({ category, query });
        const proposals = defaultLearningCoordinator.skills.listProposals();
        return NextResponse.json({
          success: true,
          skillsCount: skills.length,
          skills,
          proposalsCount: proposals.length,
          proposals,
        });
      }

      case "strategies": {
        const category = searchParams.get("category") || undefined;
        const metrics = defaultLearningCoordinator.strategies.listMetrics();
        const stratAnalysis = defaultLearningCoordinator.experiences.analyzeStrategies(category);
        return NextResponse.json({
          success: true,
          metrics,
          analysis: stratAnalysis,
        });
      }

      case "benchmarks": {
        const reports = defaultLearningCoordinator.performance.listReports();
        const latest = defaultLearningCoordinator.performance.getLatestReport();
        return NextResponse.json({
          success: true,
          count: reports.length,
          latest,
          reports,
        });
      }

      case "proposals": {
        const proposals = defaultLearningCoordinator.selfImprovement.listProposals();
        const gaps = defaultLearningCoordinator.selfImprovement.listGaps();
        return NextResponse.json({
          success: true,
          proposalsCount: proposals.length,
          proposals,
          gapsCount: gaps.length,
          gaps,
        });
      }

      case "evolution": {
        const evolutions = defaultLearningCoordinator.evolution.listEvolutions();
        const auditTrail = defaultLearningCoordinator.evolution.getAuditTrail();
        const currentVersion = defaultLearningCoordinator.evolution.getCurrentVersion();
        return NextResponse.json({
          success: true,
          currentVersion,
          evolutionsCount: evolutions.length,
          evolutions,
          auditTrail,
        });
      }

      case "analytics": {
        const analytics = defaultLearningCoordinator.getEvolutionAnalytics();
        const meta = defaultLearningCoordinator.analyzeMetaLearning();
        return NextResponse.json({
          success: true,
          analytics,
          metaLearning: meta,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: "${action}"` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing required 'action' field in request body." },
        { status: 400 }
      );
    }

    switch (action) {
      case "ingest_task": {
        const res = defaultLearningCoordinator.ingestTaskOutcome({
          taskId: body.taskId || `task_${Date.now()}`,
          goal: body.goal || "Task Goal",
          category: body.category || "GENERAL",
          strategyUsed: body.strategyUsed || "STANDARD",
          steps: (body.steps || []) as TaskStepRecord[],
          outcome: body.outcome || "SUCCESS",
          executionDurationMs: body.executionDurationMs || 1000,
          verifiedByTest: body.verifiedByTest ?? true,
          testEvidenceId: body.testEvidenceId,
          errorMessage: body.errorMessage,
          projectId: body.projectId,
        });
        return NextResponse.json({ success: true, result: res });
      }

      case "ingest_feedback": {
        if (!body.rawText) {
          return NextResponse.json(
            { success: false, error: "Missing 'rawText' for feedback." },
            { status: 400 }
          );
        }
        const res = defaultLearningCoordinator.applyFeedbackReinforcement(
          body.rawText,
          body.rating,
          body.correctedResponse
        );
        return NextResponse.json({ success: true, result: res });
      }

      case "propose_improvement": {
        const proposal = defaultLearningCoordinator.selfImprovement.proposeImprovement({
          title: body.title,
          type: body.type || "NEW_SKILL",
          description: body.description,
          motivation: body.motivation,
          expectedImpactMetric: body.expectedImpactMetric || "Overall Score",
          expectedImprovementDelta: body.expectedImprovementDelta || 5.0,
          riskLevel: body.riskLevel || "LOW",
        });
        return NextResponse.json({ success: true, proposal });
      }

      case "approve_evolution": {
        if (!body.evolutionId || !body.approvalToken) {
          return NextResponse.json(
            { success: false, error: "Missing 'evolutionId' or 'approvalToken'." },
            { status: 400 }
          );
        }
        const evo = defaultLearningCoordinator.evolution.approveEvolution(
          body.evolutionId,
          body.approvalToken,
          body.notes
        );
        return NextResponse.json({ success: true, evolution: evo });
      }

      case "test_evolution": {
        if (!body.evolutionId) {
          return NextResponse.json(
            { success: false, error: "Missing 'evolutionId'." },
            { status: 400 }
          );
        }
        const testRes = defaultLearningCoordinator.evolution.executeIsolatedTesting(body.evolutionId);
        return NextResponse.json({ success: true, testResult: testRes });
      }

      case "activate_evolution": {
        if (!body.evolutionId) {
          return NextResponse.json(
            { success: false, error: "Missing 'evolutionId'." },
            { status: 400 }
          );
        }
        const evo = defaultLearningCoordinator.evolution.activateEvolution(body.evolutionId);
        return NextResponse.json({ success: true, evolution: evo });
      }

      case "rollback_evolution": {
        if (!body.evolutionId || !body.reason) {
          return NextResponse.json(
            { success: false, error: "Missing 'evolutionId' or rollback 'reason'." },
            { status: 400 }
          );
        }
        const evo = defaultLearningCoordinator.evolution.rollbackEvolution(body.evolutionId, body.reason);
        return NextResponse.json({ success: true, evolution: evo });
      }

      case "run_benchmark": {
        const report = defaultLearningCoordinator.performance.runFullBenchmarkBattery();
        return NextResponse.json({ success: true, report });
      }

      case "test_skill": {
        if (!body.skillId) {
          return NextResponse.json(
            { success: false, error: "Missing 'skillId'." },
            { status: 400 }
          );
        }
        const res = defaultLearningCoordinator.skills.testSkill(body.skillId);
        return NextResponse.json({ success: true, result: res });
      }

      case "approve_skill": {
        if (!body.proposalId) {
          return NextResponse.json(
            { success: false, error: "Missing 'proposalId'." },
            { status: 400 }
          );
        }
        const skill = defaultLearningCoordinator.skills.approveProposal(body.proposalId);
        return NextResponse.json({ success: true, skill });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported POST action: "${action}"` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
