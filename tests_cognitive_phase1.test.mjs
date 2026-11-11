/**
 * @file tests_cognitive_phase1.test.mjs
 * @description Test Suite for ULTRON Cognitive Intelligence Engine — Phase 1 Foundation.
 *
 * Verifies:
 * 1. Intent Recognition across diverse co-founder queries.
 * 2. Multi-step instruction extraction & negative constraint detection.
 * 3. Ambiguity detection and transparent stated assumption generation.
 * 4. Conversation continuity & anaphoric pronoun resolution across turns.
 * 5. Dynamic complexity calculation & tier routing (Tier 1 Fast vs Tier 2 Analytical).
 * 6. Calibrated confidence formula and epistemic classification.
 * 7. Pre-delivery self-evaluation constraint audit.
 */

import test from "node:test";
import assert from "node:assert/strict";

test("Cognitive Phase 1: Context Understanding accurately categorizes diverse intents", async () => {
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Fast Greeting
  const greeting = analyzeContext("hey ultron");
  assert.equal(greeting.intentCategory, "GREETING");
  assert.equal(greeting.complexityScore < 0.3, true, "Greetings must be low complexity");

  // 2. Fast Command
  const cmd = analyzeContext("open chrome");
  assert.equal(cmd.intentCategory, "FAST_COMMAND");
  assert.equal(cmd.complexityScore < 0.3, true);

  // 3. Strategic Decision
  const decision = analyzeContext("Should we choose PostgreSQL vs MongoDB for our analytics service?");
  assert.equal(decision.intentCategory, "STRATEGIC_DECISION");
  assert.equal(decision.complexityScore >= 0.3, true, "Decisions must trigger analytical tier");

  // 4. Critical Thinking / Devil's Advocate
  const critical = analyzeContext("Play Devil's Advocate on our plan to rewrite the entire backend in Rust");
  assert.equal(critical.intentCategory, "CRITICAL_INQUIRY");
  assert.equal(critical.complexityScore >= 0.3, true);

  // 5. Project Planning
  const planning = analyzeContext("Create a step-by-step roadmap and timeline to build our offline voice agent");
  assert.equal(planning.intentCategory, "PROJECT_PLANNING");
  assert.equal(planning.complexityScore >= 0.3, true);

  // 6. Problem Solving / Debugging
  const bug = analyzeContext("Why is our SQLite database throwing disk I/O error when multiple workers write?");
  assert.equal(bug.intentCategory, "PROBLEM_SOLVING");
  assert.equal(bug.complexityScore >= 0.3, true);
});

test("Cognitive Phase 1: Extracts multi-step instructions and detects negative constraints", async () => {
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const compoundQuery =
    "First, analyze our database query performance.\n" +
    "Second, compare redis caching vs in-memory LRU cache.\n" +
    "Ensure you strictly avoid paid cloud services and never store unencrypted tokens.";

  const context = analyzeContext(compoundQuery);

  assert.equal(context.isMultiStep, true, "Compound instructions must be marked isMultiStep");
  assert.ok(context.instructions.length >= 3, "Must extract at least 3 discrete instruction lines");

  // Check negative constraint extraction
  const negativeConstraints = context.instructions.filter((i) => i.isNegativeConstraint);
  assert.ok(negativeConstraints.length >= 1, "Must detect negative constraint");
  assert.equal(negativeConstraints[0].priority, "MANDATORY", "Negative constraints must be MANDATORY");
  assert.match(negativeConstraints[0].normalizedText.toLowerCase(), /avoid|never/, "Must match constraint phrasing");
});

test("Cognitive Phase 1: Detects ambiguity and formulates transparent stated assumptions", async () => {
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Underspecified strategic query
  const vagueQuery = "Should we migrate?";
  const context = analyzeContext(vagueQuery);

  assert.ok(context.ambiguityScore > 0.3, "Underspecified query must have non-zero ambiguity");
  assert.ok(context.ambiguityFacets.length > 0, "Must identify missing parameter facets");
  assert.ok(context.statedAssumptions.length > 0, "Must generate stated assumptions");
  assert.match(context.statedAssumptions[0], /assumed/i, "Assumption must state assumed premise");
});

test("Cognitive Phase 1: Resolves conversation continuity and follow-up references", async () => {
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const history = [
    { role: "user", content: "What are the trade-offs of using WebAssembly for audio processing?" },
    { role: "assistant", content: "WebAssembly provides near-native execution speed but increases compilation overhead." },
  ];

  const followUp = analyzeContext("Why does it increase compilation overhead?", history);

  assert.equal(followUp.isFollowUp, true, "Must detect follow-up inquiry");
  assert.ok(followUp.resolvedReferences["target_context"], "Must resolve referent to prior turn");
  assert.match(followUp.resolvedReferences["target_context"], /WebAssembly|audio processing/i);
});

test("Cognitive Phase 1: Orchestrator routes tiers dynamically and builds system prompts", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  // Fast track test
  const fast = await orchestrateCognitivePipeline("status");
  assert.equal(fast.tier, "TIER_1_FAST");

  // Analytical track test
  let progressCount = 0;
  const analytical = await orchestrateCognitivePipeline(
    "Should we use microservices or modular monolith for our new platform? Do not use cloud services.",
    [],
    {
      onStatus: (st) => {
        progressCount++;
        assert.ok(st.phase);
      },
    }
  );

  assert.equal(analytical.tier, "TIER_2_ANALYTICAL");
  assert.ok(progressCount >= 2, "Must emit status notifications during analytical pipeline");
  assert.match(analytical.cognitiveSystemPrompt, /ONE HUMAN FOUNDER · ONE AI BRAIN/);
  assert.match(analytical.cognitiveSystemPrompt, /ANALYTICAL CO-FOUNDER DIRECTIVES/);
  assert.match(analytical.cognitiveSystemPrompt, /STRICT NEGATIVE CONSTRAINTS/);
});

test("Cognitive Phase 1: Calibrated Confidence replaces magic numbers with multi-factor formula", async () => {
  const { calculateCalibratedConfidence } = await import("./lib/cognitive/orchestrator.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const clearContext = analyzeContext("Evaluate PostgreSQL vs MySQL for our local SQLite replacement");
  const confidence = calculateCalibratedConfidence(clearContext, 1.0, 3);

  assert.ok(typeof confidence.overallScore === "number", "Confidence must be a numeric score");
  assert.ok(confidence.overallScore >= 0.0 && confidence.overallScore <= 1.0, "Must be bounded [0, 1]");
  assert.ok(confidence.classification, "Must classify epistemic certainty");
  assert.ok(confidence.knownFacts.length > 0, "Must list known facts");
  assert.ok(confidence.contextGroundingScore > 0, "Must have non-zero grounding");
});

test("Cognitive Phase 1: Pre-delivery self-evaluation catches constraint violations", async () => {
  const { auditCandidateReply } = await import("./lib/cognitive/orchestrator.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const contextWithConstraint = analyzeContext("Give me options for voice STT. Do not use paid APIs.");

  // 1. Compliant candidate
  const goodReply = "We can use local whisper.cpp or Vosk running offline with zero paid APIs.";
  const goodAudit = auditCandidateReply(goodReply, contextWithConstraint);
  assert.equal(goodAudit.passed, true);
  assert.equal(goodAudit.complianceScore, 1.0);

  // 2. Violating candidate
  const badReply = "You should sign up for a paid API key on Google Cloud Speech to get started.";
  const badAudit = auditCandidateReply(badReply, contextWithConstraint);
  assert.equal(badAudit.passed, false);
  assert.ok(badAudit.constraintViolations.length > 0);
  assert.equal(badAudit.revisedReplyRequired, true);
});
