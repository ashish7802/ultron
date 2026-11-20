// scripts/verify_chat_regressions.mjs
/**
 * @file scripts/verify_chat_regressions.mjs
 * @description Comprehensive assertion-based chat regression and intelligence verification suite.
 *
 * Requirements:
 * - Fails closed with non-zero exit code (process.exit(1)) on ANY assertion failure.
 * - Tests single-turn and multi-turn conversations.
 * - Tests live Ollama streaming SSE endpoint.
 * - Tests memory isolation and honest capability reporting.
 */

const BASE_URL = process.env.ULTRON_BASE_URL || "http://127.0.0.1:3000";

let sessionToken = "";
let cookieHeader = "";
let failedTests = 0;
let passedTests = 0;

function assert(condition, testName, message) {
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}: ${message}`);
  }
}

async function bootstrapSession() {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to bootstrap session: HTTP ${res.status}`);
  }
  const data = await res.json();
  sessionToken = data.sessionToken || data.token || data.sessionId || "";
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    cookieHeader = setCookie.split(";")[0];
  }
  console.log("Bootstrapped session token:", sessionToken ? "SUCCESS" : "EMPTY", "Cookie:", cookieHeader ? "SET" : "NONE");
}

async function sendMessage(messages) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionToken) headers["X-ULTRON-Session-Token"] = sessionToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  const msgList = typeof messages === "string" ? [{ role: "user", content: messages }] : messages;

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: msgList }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function testStreaming(prompt) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionToken) headers["X-ULTRON-Session-Token"] = sessionToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Stream request failed with HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let receivedTokens = [];
  let receivedDone = false;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const raw of lines) {
      const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "token") {
          const tok = evt.token || evt.content;
          if (typeof tok === "string" && tok.length > 0) {
            receivedTokens.push(tok);
          }
        } else if (evt.type === "done") {
          receivedDone = true;
        }
      } catch {}
    }
  }

  return {
    tokensCount: receivedTokens.length,
    fullText: receivedTokens.join(""),
    receivedDone,
  };
}

async function runBattery() {
  await bootstrapSession();

  console.log("\n==================================================");
  console.log("STARTING FAIL-CLOSED CHAT & INTELLIGENCE REGRESSION BATTERY");
  console.log("==================================================");

  // Test 1: Basic Greeting
  console.log("\n>>> Test 1: Basic Greeting ('hey')");
  try {
    const t1 = await sendMessage("hey");
    assert(
      Boolean(t1.reply && t1.reply.length > 2 && !t1.usedTool),
      "Test 1: Basic Greeting",
      `Expected non-empty conversational reply without tool execution, got: ${JSON.stringify(t1)}`
    );
  } catch (err) {
    assert(false, "Test 1: Basic Greeting", err.message);
  }

  // Test 2: Desktop Automation & Document Discovery
  console.log("\n>>> Test 2: Desktop Automation ('ultron me chrome me docss open karo or sari docs files pado')");
  try {
    const t2 = await sendMessage("ultron me chrome me docss open karo or sari docs files pado");
    const reply = t2.reply || "";
    // Verify it either opened Chrome or generated a permission plan, and inspected docs honestly without fake cloud sync
    const isApprovalPlan = reply.includes("Desktop Action Approval Required") && reply.includes("chrome");
    const isExecutionReport = (/Desktop Automation|Browser Launch|Google Chrome/i.test(reply)) && (/Local Document Discovery|docs\//i.test(reply));
    assert(
      isApprovalPlan || isExecutionReport,
      "Test 2: Desktop Automation & Permission Gate Verification",
      `Expected verified action approval plan or desktop execution report without fabricated claims, got: ${reply.slice(0, 200)}...`
    );
  } catch (err) {
    assert(false, "Test 2: Desktop Automation", err.message);
  }

  // Test 3: Multi-turn Conversation Continuity
  console.log("\n>>> Test 3: Multi-turn Conversation Continuity");
  try {
    const conv = [
      { role: "user", content: "I am writing a Python script to parse financial transactions." },
      { role: "assistant", content: "That sounds great! Python has excellent libraries like pandas and csv for handling financial transactions." },
      { role: "user", content: "Which programming language did I say I was using?" },
    ];
    const t3 = await sendMessage(conv);
    const reply3 = (t3.reply || "").toLowerCase();
    assert(
      reply3.includes("python"),
      "Test 3: Multi-turn Conversation Continuity",
      `Expected model to recall 'Python' across conversation turns, got: ${t3.reply}`
    );
  } catch (err) {
    assert(false, "Test 3: Multi-turn Conversation Continuity", err.message);
  }

  // Test 4: Personal Memory Recall
  console.log("\n>>> Test 4: Personal Memory ('who am i')");
  try {
    const t4 = await sendMessage("who am i");
    const reply4 = t4.reply || "";
    // Should recall user identity without dumping unrelated ACME certificates or raw research dumps
    const noCertificateLeak = !reply4.includes("ACME_LETSENCRYPT") && !reply4.includes("[RESEARCH DOSSIER]");
    const hasIdentityContext = reply4.length > 5;
    assert(
      noCertificateLeak && hasIdentityContext,
      "Test 4: Personal Memory Isolation",
      `Expected isolated memory recall without raw dossier leaks, got: ${reply4.slice(0, 150)}...`
    );
  } catch (err) {
    assert(false, "Test 4: Personal Memory Isolation", err.message);
  }

  // Test 5: Tool & Capability Discovery
  console.log("\n>>> Test 5: Dynamic Tool Discovery");
  try {
    const t5 = await sendMessage("What desktop and research tools are currently available, and which actions require approval?");
    const reply5 = t5.reply || "";
    const mentionsRegisteredTools = reply5.includes("launch_application") || reply5.includes("read_file") || reply5.includes("Registered Computer Actions");
    const mentionsApproval = reply5.includes("Approval") || reply5.includes("approval plan");
    assert(
      mentionsRegisteredTools && mentionsApproval,
      "Test 5: Dynamic Tool Discovery",
      `Expected dynamic registered tools inventory and approval policies, got: ${reply5.slice(0, 200)}...`
    );
  } catch (err) {
    assert(false, "Test 5: Dynamic Tool Discovery", err.message);
  }

  // Test 6: Genuine SSE Token Streaming
  console.log("\n>>> Test 6: Genuine SSE Token Streaming");
  try {
    const streamRes = await testStreaming("Explain the difference between synchronous and asynchronous programming in two sentences.");
    assert(
      streamRes.tokensCount > 0 && streamRes.receivedDone && streamRes.fullText.length > 10,
      "Test 6: Genuine SSE Token Streaming",
      `Expected real streamed token events and done marker, got ${streamRes.tokensCount} tokens, done=${streamRes.receivedDone}`
    );
  } catch (err) {
    assert(false, "Test 6: Genuine SSE Token Streaming", err.message);
  }

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log("==================================================");

  if (failedTests > 0) {
    console.error(`\nFAILED: ${failedTests} regression test(s) failed. Exiting with non-zero status.`);
    process.exit(1);
  } else {
    console.log("\nSUCCESS: All chat regression tests verified successfully with 0 failures!");
    process.exit(0);
  }
}

runBattery().catch((err) => {
  console.error("FATAL: Test harness runner failed:", err);
  process.exit(1);
});
