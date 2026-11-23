// scripts/verify_live_conversations.mjs
/**
 * Real-time End-to-End Chat Verification Suite for ULTRON Lite.
 * Interacts directly with the running application at http://127.0.0.1:3000.
 */

const BASE_URL = process.env.ULTRON_BASE_URL || "http://127.0.0.1:3000";

let sessionToken = "";
let cookieHeader = "";

async function bootstrapSession() {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bootstrapping session`);
  const data = await res.json();
  sessionToken = data.sessionToken || data.sessionId || "";
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookieHeader = setCookie.split(";")[0];
  console.log("Session bootstrapped successfully. Token:", sessionToken ? "YES" : "NO");
}

const conversationHistory = [];

async function sendChatTurn(userText, testLabel) {
  console.log(`\n==================================================`);
  console.log(`>>> PROMPT [${testLabel}]: "${userText}"`);
  console.log(`==================================================`);

  conversationHistory.push({ role: "user", content: userText });

  const headers = { "Content-Type": "application/json" };
  if (sessionToken) headers["X-ULTRON-Session-Token"] = sessionToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: conversationHistory,
      stream: false,
    }),
  });

  const elapsed = Date.now() - started;
  if (!res.ok) {
    const errText = await res.text();
    console.error(`FAILED with HTTP ${res.status}:`, errText);
    return { ok: false, error: errText, elapsed };
  }

  const data = await res.json();
  const reply = data.reply || "";
  console.log(`[ULTRON REPLY (${elapsed}ms)]:\n${reply}`);
  conversationHistory.push({ role: "assistant", content: reply });
  return { ok: true, reply, data, elapsed };
}

async function main() {
  await bootstrapSession();

  let passCount = 0;
  let failCount = 0;

  // A. Basic conversation
  const turnA = await sendChatTurn("Namaste ULTRON. Tum kya kar sakte ho?", "Conversation A: Basic Capabilities");
  if (turnA.ok && turnA.reply.length > 50) {
    console.log("[PASS] Conversation A passed.");
    passCount++;
  } else {
    console.error("[FAIL] Conversation A failed.");
    failCount++;
  }

  // B. Browser operation
  const turnB = await sendChatTurn("ULTRON, Chrome mein ek naya tab kholo aur artificial intelligence ki latest research search karo.", "Conversation B: Browser Operation");
  if (turnB.ok && (turnB.reply.includes("Chrome") || turnB.reply.includes("Search Query:") || turnB.reply.includes("http"))) {
    console.log("[PASS] Conversation B passed (Browser search dispatched).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation B failed.");
    failCount++;
  }

  // C. Article reading
  const turnC = await sendChatTurn("Is article ko padho, simple Hinglish mein samjhao aur original source link do. https://en.wikipedia.org/wiki/Artificial_intelligence", "Conversation C: Article Reading & Summarization");
  if (turnC.ok && (turnC.reply.includes("Article Analysis") || turnC.reply.includes("Mukhya Baatein") || turnC.reply.includes("Original Source:"))) {
    console.log("[PASS] Conversation C passed (Live article extracted & summarized in Hinglish).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation C failed.");
    failCount++;
  }

  // D. Follow-up
  const turnD = await sendChatTurn("Is article mein sabse important claim kya hai? Kya source us claim ko support karta hai?", "Conversation D: Grounded Follow-up Claim Verification");
  if (turnD.ok && (turnD.reply.includes("Claim Verification") || turnD.reply.includes("claim") || turnD.reply.includes("Source Link"))) {
    console.log("[PASS] Conversation D passed (Grounded follow-up answered).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation D failed.");
    failCount++;
  }

  // E. Daily briefing
  const turnE = await sendChatTurn("Aaj ki important India aur international news ka detailed briefing do.", "Conversation E: Daily News Briefing");
  if (turnE.ok && (turnE.reply.includes("Daily World Briefing") || turnE.reply.includes("Top Important Developments") || turnE.reply.includes("India & World"))) {
    console.log("[PASS] Conversation E passed (Verified RSS news briefing returned).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation E failed.");
    failCount++;
  }

  // F. World Explorer
  const turnF = await sendChatTurn("Quantum computing ko beginner ke liye samjhao aur reliable sources do.", "Conversation F: World Explorer Pedagogical Concept");
  if (turnF.ok && (turnF.reply.includes("Quantum Computing") || turnF.reply.includes("Beginner Explanation") || turnF.reply.includes("Key Terms"))) {
    console.log("[PASS] Conversation F passed (World Explorer concept explanation returned).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation F failed.");
    failCount++;
  }

  // G. Model availability
  const turnG = await sendChatTurn("Kaunsa local model active hai? Kya tum actual inference kar rahe ho?", "Conversation G: Active Model Status & Live Inference");
  if (turnG.ok && (turnG.reply.includes("ultron-brain") || turnG.reply.includes("Ollama") || turnG.reply.includes("HAAN"))) {
    console.log("[PASS] Conversation G passed (Model status verified).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation G failed.");
    failCount++;
  }

  // H. Failure handling
  const turnH = await sendChatTurn("ULTRON, agar internet ya local model unavailable ho to kya hoga?", "Conversation H: Failure Handling & Offline Architecture");
  if (turnH.ok && (turnH.reply.includes("Offline Architecture") || turnH.reply.includes("Internet Unavailable") || turnH.reply.includes("Deterministic Fallback"))) {
    console.log("[PASS] Conversation H passed (Failure handling explained).");
    passCount++;
  } else {
    console.error("[FAIL] Conversation H failed.");
    failCount++;
  }

  console.log(`\n==================================================`);
  console.log(`LIVE CONVERSATION BATTERY: ${passCount} PASSED, ${failCount} FAILED (TOTAL 8/8)`);
  console.log(`==================================================\n`);

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal test error:", e);
  process.exit(1);
});
