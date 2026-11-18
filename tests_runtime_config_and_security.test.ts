/**
 * @file tests_runtime_config_and_security.test.ts
 * @description Unit & Regression Tests for ULTRON Runtime Config, SSRF Guards, Diagnostic Redaction & Vault Integrity.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  getDefaultSettings,
  mergeAndValidateSettings,
  validateLoopbackEndpoint,
} from "./lib/runtimeConfig.ts";
import {
  redactDiagnosticText,
  recordDiagnosticLog,
  listDiagnosticLogs,
} from "./lib/diagnosticsLog.ts";

test("SSRF Guard: validateLoopbackEndpoint accepts only loopback HTTP/HTTPS hosts", () => {
  assert.equal(validateLoopbackEndpoint("http://127.0.0.1:11434/"), "http://127.0.0.1:11434");
  assert.equal(validateLoopbackEndpoint("http://localhost:11434"), "http://localhost:11434");
  assert.equal(validateLoopbackEndpoint("https://[::1]:11434"), "https://[::1]:11434");

  // External, RFC1918, cloud metadata, and credentialed URLs MUST fail closed
  assert.equal(validateLoopbackEndpoint("http://169.254.169.254/latest/meta-data"), null);
  assert.equal(validateLoopbackEndpoint("http://10.0.0.5:11434"), null);
  assert.equal(validateLoopbackEndpoint("https://evil.example.com"), null);
  assert.equal(validateLoopbackEndpoint("file:///etc/passwd"), null);
  assert.equal(validateLoopbackEndpoint("http://user:pass@127.0.0.1:11434"), null);
});

test("Runtime Config: enforces schema bounds and immutable strictLoopbackOnly invariant", () => {
  const base = getDefaultSettings();

  // Reject unsafe external Ollama endpoint
  const badEndpoint = mergeAndValidateSettings(base, {
    ai: { ollamaEndpoint: "http://192.168.1.50:11434" },
  });
  assert.equal(badEndpoint.ok, false);

  // Reject shell-injection characters in model tag
  const badModel = mergeAndValidateSettings(base, {
    ai: { activeModel: "qwen2.5; rm -rf /" },
  });
  assert.equal(badModel.ok, false);

  // Clamp numeric bounds & keep strictLoopbackOnly locked true
  const valid = mergeAndValidateSettings(base, {
    ai: {
      ollamaEndpoint: "http://localhost:11434/",
      activeModel: "llama3.2:3b",
      temperature: 99,
      timeoutMs: 100,
    },
    security: {
      strictLoopbackOnly: false,
    },
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.settings.ai.ollamaEndpoint, "http://localhost:11434");
    assert.equal(valid.settings.ai.activeModel, "llama3.2:3b");
    assert.equal(valid.settings.ai.temperature, 2);
    assert.equal(valid.settings.ai.timeoutMs, 3000);
    assert.equal(valid.settings.security.strictLoopbackOnly, true);
  }
});

test("Diagnostic Log: redacts bearer tokens, secrets, and long hex keys", () => {
  const sample =
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.sig token=abcd1234567890 key:9c630c997a91db2f071642f071496d99167f50659cd61ec14a4efb632f75ad2b";
  const redacted = redactDiagnosticText(sample);
  assert.equal(redacted.includes("eyJhbGciOiJIUzI1NiJ9"), false);
  assert.equal(redacted.includes("9c630c997a91db2f071642f071496d99167f50659cd61ec14a4efb632f75ad2b"), false);
  assert.equal(redacted.includes("[REDACTED]"), true);

  recordDiagnosticLog("info", "unit-test", "Verified redaction pipeline token=supersecret123");
  const latest = listDiagnosticLogs({ subsystem: "unit-test", limit: 1 })[0];
  assert.ok(latest);
  assert.equal(latest.message.includes("supersecret123"), false);
});

test("Security Regression: learning route does not hardcode operator sessions to founder", () => {
  const learningSrc = fs.readFileSync(path.join(process.cwd(), "app", "api", "learning", "route.ts"), "utf8");
  assert.equal(learningSrc.includes('return { authorized: true, role: "founder" }'), false);
  assert.equal(learningSrc.includes('desktopVal.session?.userRole || "operator"'), true);
});

test("Honesty Regression: no fabricated Synaptics Windows Hello sensor strings remain in UI", () => {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
  };
  const files = walk(path.join(process.cwd(), "components"));
  assert.ok(files.length > 0, "Expected component files under components/");
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.equal(src.includes("Synaptics VFS7552"), false, `Fabricated sensor string found in ${file}`);
  }
});

test("Vault Preservation: ultron_memory_vault.json remains byte-identical to pre-migration snapshot", () => {
  const vaultBuf = fs.readFileSync(path.join(process.cwd(), "ultron_memory_vault.json"));
  const snapBuf = fs.readFileSync(
    path.join(process.cwd(), "backups", "pre_migration_safe_snapshot", "ultron_memory_vault.json"),
  );
  const vaultHash = crypto.createHash("sha256").update(vaultBuf).digest("hex");
  const snapHash = crypto.createHash("sha256").update(snapBuf).digest("hex");
  assert.equal(vaultBuf.length, snapBuf.length);
  assert.equal(vaultHash, snapHash);
});
