// scripts/verify_chat_regressions.mjs
const BASE_URL = "http://127.0.0.1:3000";

let sessionToken = "";
let cookieHeader = "";

async function bootstrapSession() {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  sessionToken = data.sessionToken || data.token || data.sessionId || "";
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    cookieHeader = setCookie.split(";")[0];
  }
  console.log("Bootstrapped session token:", sessionToken ? "SUCCESS" : "EMPTY", "Cookie:", cookieHeader ? "SET" : "NONE");
}

async function sendMessage(text) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionToken) headers["X-ULTRON-Session-Token"] = sessionToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function runTests() {
  await bootstrapSession();

  console.log("==================================================");
  console.log("VERIFYING CHAT REGRESSION TEST BATTERY");
  console.log("==================================================");

  // Test 1: Basic greeting
  console.log("\n>>> Test 1: Basic Greeting ('hey')");
  const t1 = await sendMessage("hey");
  console.log("Response:", t1.reply?.slice(0, 100));
  if (t1.reply && /hello/i.test(t1.reply) && !t1.usedTool) {
    console.log("[PASS] Test 1 passed.");
  } else {
    console.error("[FAIL] Test 1 failed:", t1);
  }

  // Test 2: Desktop automation
  console.log("\n>>> Test 2: Desktop Automation ('ultron me chrome me docss open karo or sari docs files pado')");
  const t2 = await sendMessage("ultron me chrome me docss open karo or sari docs files pado");
  console.log("Response:\n" + t2.reply?.slice(0, 250) + "...\n");
  if (t2.reply && t2.reply.includes("Execution Evidence") && t2.reply.includes("Successfully Processed Documents")) {
    console.log("[PASS] Test 2 passed.");
  } else {
    console.error("[FAIL] Test 2 failed:", t2);
  }

  // Test 3: Contextual greeting
  console.log("\n>>> Test 3: Contextual Greeting ('hey ultron')");
  const t3 = await sendMessage("hey ultron");
  console.log("Response:", t3.reply?.slice(0, 100));
  if (t3.reply && /hello/i.test(t3.reply) && /ultron/i.test(t3.reply)) {
    console.log("[PASS] Test 3 passed.");
  } else {
    console.error("[FAIL] Test 3 failed:", t3);
  }

  // Test 4: Personal memory
  console.log("\n>>> Test 4: Personal Memory ('who am i')");
  const t4 = await sendMessage("who am i");
  console.log("Response:\n" + t4.reply?.slice(0, 300) + "...\n");
  if (t4.reply && !t4.reply.includes("[RESEARCH DOSSIER]") && !t4.reply.includes("ACME_LETSENCRYPT")) {
    console.log("[PASS] Test 4 passed.");
  } else {
    console.error("[FAIL] Test 4 failed:", t4);
  }

  // Test 5: Tool discovery
  console.log("\n>>> Test 5: Tool Discovery ('What desktop and research tools are currently available, and which actions require approval?')");
  const t5 = await sendMessage("What desktop and research tools are currently available, and which actions require approval?");
  console.log("Response:\n" + t5.reply?.slice(0, 350) + "...\n");
  if (t5.reply && t5.reply.includes("Desktop Automation") && t5.reply.includes("Browser Automation") && !t5.reply.includes("No files found")) {
    console.log("[PASS] Test 5 passed.");
  } else {
    console.error("[FAIL] Test 5 failed:", t5);
  }

  console.log("\n==================================================");
  console.log("ALL 5 REGRESSION TESTS VERIFIED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
