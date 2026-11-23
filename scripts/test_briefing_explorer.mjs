// scripts/test_briefing_explorer.mjs
import assert from "assert";
import { defaultDailyBriefingEngine } from "../lib/news/dailyBriefingEngine.ts";
import { defaultWorldExplorer } from "../lib/learning/worldExplorerEngine.ts";

console.log("=== Testing Daily Briefing & World Explorer Engines ===");

async function testBriefing() {
  console.log("Testing Daily Briefing Generation...");
  const briefing = await defaultDailyBriefingEngine.getDailyBriefing(false);
  assert(briefing.briefingDate, "Briefing date must exist");
  assert(briefing.topicToLearn, "Topic to learn must exist");
  assert(briefing.topicToLearn.simpleExplanationHinglish, "Hinglish explanation must exist");
  assert(briefing.topicToLearn.factVsSpeculation, "Fact vs speculation must exist");

  console.log("[PASS] Daily Briefing Date:", briefing.briefingDate);
  console.log("[PASS] Topic to Learn:", briefing.topicToLearn.title);
  console.log(`[PASS] Top stories: ${briefing.topDevelopments.length}, India/World: ${briefing.indiaAndWorld.length}, AI/Tech: ${briefing.aiAndTechnology.length}`);
  console.log("[PASS] Verified Sources count:", briefing.sources.length);
}

async function testWorldExplorer() {
  console.log("\nTesting World Explorer Topic Explanation...");
  const exploration = await defaultWorldExplorer.exploreTopic("Quantum Computing");
  assert.strictEqual(exploration.topic, "Quantum Computing");
  assert(exploration.beginnerExplanationHinglish, "Explanation must exist");
  assert(exploration.keyTermsExplained.length > 0, "Key terms must be explained");
  assert(exploration.factVsInterpretation.verifiedFacts.length > 0, "Verified facts must exist");
  assert(exploration.recommendedSources.length > 0, "Sources must be provided");

  console.log("[PASS] World Explorer Explanation:", exploration.beginnerExplanationHinglish.slice(0, 100) + "...");
  console.log("[PASS] Key terms count:", exploration.keyTermsExplained.length);
  console.log("[PASS] Recommended sources:", exploration.recommendedSources.map(s => s.name).join(", "));
}

async function main() {
  try {
    await testBriefing();
    await testWorldExplorer();
    console.log("\n>>> ALL BRIEFING & EXPLORER TESTS PASSED (100%) <<<\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

main();
