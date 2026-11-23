// test_infer.mjs
async function main() {
  console.log("Testing Ollama Chat Inference with ultron-brain:latest...");
  const started = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "ultron-brain:latest",
        messages: [
          { role: "system", content: "You are ULTRON Lite, a helpful desktop assistant. Keep responses brief in friendly Hinglish." },
          { role: "user", content: "Namaste! Ek line me batao tum kya kar sakte ho." }
        ],
        stream: false,
        options: {
          num_predict: 128,
          temperature: 0.5
        }
      })
    });

    const elapsed = Date.now() - started;
    console.log(`HTTP Status: ${res.status} (${elapsed}ms)`);
    if (!res.ok) {
      const err = await res.text();
      console.error("Error from Ollama:", err);
      process.exit(1);
    }
    const data = await res.json();
    console.log("Reply:", data.message?.content);
    console.log("\n[PASS] Ollama local model inference verified!");
  } catch (err) {
    console.error("Inference failed:", err);
    process.exit(1);
  }
}

main();
