import fs from "fs";
import crypto from "crypto";
import { defaultDpapiBridge } from "../lib/security/dpapiBridge.ts";

const raw = fs.readFileSync("ultron_memory_vault.json", "utf-8");
const parsed = JSON.parse(raw);
const iv = Buffer.from(parsed.iv, "hex");
const tag = Buffer.from(parsed.tag, "hex");
const ciphertext = Buffer.from(parsed.ciphertext, "hex");

function tryKey(name, secret) {
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    console.log(`[SUCCESS] Decrypted with ${name}! Length:`, dec.length);
    const data = JSON.parse(dec.toString("utf-8"));
    console.log(`Memories in vault (${name}):`, data.memories?.length);
    return true;
  } catch (e) {
    // failed
    return false;
  }
}

// 1. Check recovery.key.dpapi
if (fs.existsSync(".security_vault/recovery.key.dpapi")) {
  const enc = fs.readFileSync(".security_vault/recovery.key.dpapi", "utf-8").trim();
  const unwrap = defaultDpapiBridge.unprotectSecret(enc);
  if (unwrap) {
    console.log("Unwrapped recovery.key:", unwrap.slice(0, 8) + "...");
    tryKey("recovery.key", unwrap);
  }
}

// 2. Check all backups
const backupDirs = ["backups/pre_cleanup_snapshot", "backups/core_recovery_pre_snapshot"];
for (const bDir of backupDirs) {
  if (fs.existsSync(bDir)) {
    const files = fs.readdirSync(bDir);
    for (const f of files) {
      if (f.includes("vault_key") || f.includes("recovery")) {
        const full = `${bDir}/${f}`;
        const content = fs.readFileSync(full, "utf-8").trim();
        let unwrap = content;
        if (f.endsWith(".dpapi")) {
          unwrap = defaultDpapiBridge.unprotectSecret(content);
        }
        if (unwrap) {
          tryKey(full, unwrap);
        }
      }
    }
  }
}
