/**
 * @file lib/memoryManager.ts
 * @description Advanced Persistent Long-Term & Working Memory Subsystem for ULTRON.
 * 
 * Subsystem:
 * Long-Term Episodic Memory, User Profile Extraction & Context Grounding.
 * 
 * Key Responsibilities:
 * - Persists user memories, preferences, identity, and project contexts across chat sessions.
 * - Auto-extracts facts and handles name corrections ("i am not rahul i am ashish", "mera naam rahul nahi ashish hai").
 * - Performs semantic and keyword associative recall to retrieve relevant memories during conversation turns.
 * - Injects recalled memories into prompt context for personalized and super-intelligent answers.
 * - Provides memory management APIs: list, create, edit, delete, and clear memories.
 * 
 * Architectural Role & Interactions:
 * - Interfaced by `app/api/chat/route.ts` on every turn to ground the LLM in the user's persistent profile.
 * - Backed by `app/api/memory/route.ts` for direct UI inspection and manual memory editing.
 * - Saves state to an atomic, disk-persisted vault (`ultron_memory_vault.json`) that survives server reboots.
 * 
 * Safety / Security Guarantees:
 * - All memory writes are atomic (temporary file + rename) to prevent database corruption.
 * - Personal facts remain strictly on the local machine; never transmitted to third-party tracking services.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getActiveMasterSecret } from "./crypto.ts";
import { defaultMemoryCoordinator } from "./memory/memoryCoordinator.ts";

export * from "./memory/index.ts";
export const memoryCoordinator = defaultMemoryCoordinator;

export type MemoryCategory = "profile" | "preference" | "project" | "fact" | "instruction";

export interface MemoryRecord {
  id: string;
  key: string;
  category: MemoryCategory;
  content: string;
  importance: number; // 1 to 5 scale
  confidence: number; // 0.0 to 1.0
  createdAt: number;
  updatedAt: number;
  source: "explicit" | "inferred";
  projectId?: string;
  provenance?: {
    origin: string;
    timestamp: number;
  };
}

export interface MemoryVaultData {
  version: number;
  lastUpdated: number;
  memories: MemoryRecord[];
}

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  lastUpdated: number;
}

const VAULT_FILE_PATH = path.join(process.cwd(), "ultron_memory_vault.json");
const VAULT_BACKUP_PATH = path.join(process.cwd(), "ultron_memory_vault.json.bak");

/** Legacy migration key retained strictly for one-time decryption of historical vaults. */
const LEGACY_VAULT_MIGRATION_SECRET = "STARK_VAULT_E2EE_KEY_STATIC_DERIVATION_2026";

/**
 * Derives a dynamic 256-bit AES key for persistent vault encryption at rest.
 * Uses the CSPRNG platform-backed master secret; NEVER hardcoded static strings.
 *
 * @returns 32-byte Buffer key.
 */
function getVaultKey(): Buffer {
  const secret = getActiveMasterSecret();
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Sanitizes memory text to prevent prompt injection or control token smuggling.
 *
 * @param text - Raw memory content.
 * @returns Sanitized text string.
 */
export function sanitizeMemoryContent(text: string): string {
  return text
    .replace(/<\|.*?\|>/g, "")
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous\s+)?instructions/gi, "[redacted override]")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

/**
 * Encrypts vault data using AES-256-GCM authenticated encryption at rest.
 * Uses a dynamic CSPRNG key and fresh 96-bit nonce.
 *
 * @param data - MemoryVaultData object to encrypt.
 * @returns Serialized JSON string containing version 2 ciphertext, nonce, and auth tag.
 */
function encryptVaultData(data: MemoryVaultData): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify(
    {
      version: 2,
      encrypted: true,
      lastUpdated: data.lastUpdated,
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    },
    null,
    2
  );
}

/**
 * Decrypts vault data from disk, handling legacy plaintext (v1), active dynamic AES-GCM (v2),
 * and one-time migration of historical encrypted vaults.
 *
 * @param raw - Raw file string from disk.
 * @returns Parsed MemoryVaultData or null if corrupted or invalid.
 */
function decryptVaultData(raw: string): MemoryVaultData | null {
  try {
    const parsed = JSON.parse(raw);
    // Backward compatibility: legacy plaintext format (Version 1)
    if (parsed && Array.isArray(parsed.memories)) {
      return parsed;
    }
    // Version 2: AES-256-GCM authenticated encryption
    if (parsed && parsed.encrypted && parsed.ciphertext && parsed.iv && parsed.tag) {
      const iv = Buffer.from(parsed.iv, "hex");
      const tag = Buffer.from(parsed.tag, "hex");
      const ciphertext = Buffer.from(parsed.ciphertext, "hex");

      // Attempt 1: Decrypt with active dynamic CSPRNG master key
      try {
        const primaryKey = getVaultKey();
        const decipher = crypto.createDecipheriv("aes-256-gcm", primaryKey, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return JSON.parse(decrypted.toString("utf-8"));
      } catch {
        // Attempt 2: Fallback migration key for historical vaults
        const legacyKey = crypto.createHash("sha256").update(LEGACY_VAULT_MIGRATION_SECRET).digest();
        const fallbackDecipher = crypto.createDecipheriv("aes-256-gcm", legacyKey, iv);
        fallbackDecipher.setAuthTag(tag);
        const migratedDecrypted = Buffer.concat([fallbackDecipher.update(ciphertext), fallbackDecipher.final()]);
        const migratedData: MemoryVaultData = JSON.parse(migratedDecrypted.toString("utf-8"));
        // Asynchronously re-encrypt with the active key to complete migration
        setImmediate(() => {
          persistMemories(migratedData.memories);
        });
        return migratedData;
      }
    }
  } catch (err) {
    console.warn("[MEMORY MANAGER] Error decrypting memory vault:", err);
  }
  return null;
}

/**
 * Loads all stored memories from disk with automatic backup recovery and backward compatibility.
 *
 * @returns Array of persistent memory records.
 */
export function loadAllMemories(): MemoryRecord[] {
  try {
    if (fs.existsSync(VAULT_FILE_PATH)) {
      const raw = fs.readFileSync(VAULT_FILE_PATH, "utf-8");
      const parsed = decryptVaultData(raw);
      if (parsed && Array.isArray(parsed.memories)) {
        return parsed.memories.map((m) => ({
          ...m,
          provenance: m.provenance || {
            origin: "user_conversation",
            timestamp: m.updatedAt || m.createdAt || Date.now(),
          },
        }));
      }
    }
    // Attempt recovery from backup if primary read failed or file missing
    if (fs.existsSync(VAULT_BACKUP_PATH)) {
      console.warn("[MEMORY MANAGER] Attempting recovery from vault backup...");
      const rawBak = fs.readFileSync(VAULT_BACKUP_PATH, "utf-8");
      const parsedBak = decryptVaultData(rawBak);
      if (parsedBak && Array.isArray(parsedBak.memories)) {
        return parsedBak.memories.map((m) => ({
          ...m,
          provenance: m.provenance || {
            origin: "vault_backup",
            timestamp: m.updatedAt || m.createdAt || Date.now(),
          },
        }));
      }
    }
  } catch (err) {
    console.warn("[MEMORY MANAGER] Error loading memory vault:", err);
  }
  return [];
}

/**
 * Atomically saves all memories to disk using authenticated AES-256-GCM encryption and backup.
 *
 * @param memories - Array of memory records to persist.
 */
export function persistMemories(memories: MemoryRecord[]): void {
  const data: MemoryVaultData = {
    version: 2,
    lastUpdated: Date.now(),
    memories,
  };

  const encryptedContent = encryptVaultData(data);
  const tempPath = `${VAULT_FILE_PATH}.${crypto.randomBytes(4).toString("hex")}.tmp`;

  try {
    // 1. Write encrypted data to temporary file
    fs.writeFileSync(tempPath, encryptedContent, "utf-8");
    // 2. Maintain backup of existing file before atomic replacement
    if (fs.existsSync(VAULT_FILE_PATH)) {
      try {
        fs.copyFileSync(VAULT_FILE_PATH, VAULT_BACKUP_PATH);
      } catch {
        /* non-fatal */
      }
    }
    // 3. Atomic rename
    fs.renameSync(tempPath, VAULT_FILE_PATH);
  } catch (err) {
    console.error("[MEMORY MANAGER] Error persisting encrypted memory vault:", err);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* cleanup */ }
    }
  }
}

/**
 * Stores or updates a specific memory record in the vault.
 *
 * @param key - Unique semantic key identifier (e.g. "user_name", "user_role").
 * @param content - Human-readable statement of the memory.
 * @param category - Category classification.
 * @param importance - Importance priority from 1 to 5.
 * @param source - "explicit" (user asked to remember) or "inferred".
 * @returns The saved or updated MemoryRecord.
 */
export function saveMemory(
  key: string,
  content: string,
  category: MemoryCategory = "fact",
  importance: number = 3,
  source: "explicit" | "inferred" = "inferred"
): MemoryRecord {
  const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "_");
  const safeContent = sanitizeMemoryContent(content);
  const memories = loadAllMemories();
  const existingIndex = memories.findIndex((m) => m.key === cleanKey);

  const now = Date.now();
  let record: MemoryRecord;

  if (existingIndex >= 0) {
    record = {
      ...memories[existingIndex],
      content: safeContent,
      category,
      importance,
      updatedAt: now,
      source,
    };
    memories[existingIndex] = record;
  } else {
    record = {
      id: "mem_" + crypto.randomBytes(6).toString("hex"),
      key: cleanKey,
      category,
      content: safeContent,
      importance,
      confidence: 1.0,
      createdAt: now,
      updatedAt: now,
      source,
    };
    memories.push(record);
  }

  persistMemories(memories);
  return record;
}

/**
 * Updates a memory by its unique ID.
 *
 * @param id - Unique memory ID.
 * @param updates - Partial fields to update.
 * @returns The updated MemoryRecord or null if not found.
 */
export function updateMemoryById(
  id: string,
  updates: Partial<Pick<MemoryRecord, "content" | "category" | "importance">>
): MemoryRecord | null {
  const memories = loadAllMemories();
  const index = memories.findIndex((m) => m.id === id);
  if (index === -1) return null;

  const now = Date.now();
  const updated: MemoryRecord = {
    ...memories[index],
    ...(updates.content ? { content: sanitizeMemoryContent(updates.content) } : {}),
    ...(updates.category ? { category: updates.category } : {}),
    ...(typeof updates.importance === "number" ? { importance: updates.importance } : {}),
    updatedAt: now,
  };

  memories[index] = updated;
  persistMemories(memories);
  return updated;
}

/**
 * Deletes a memory record by key or ID.
 *
 * @param keyOrId - Memory key or ID to remove.
 * @returns True if a memory was deleted, false otherwise.
 */
export function deleteMemory(keyOrId: string): boolean {
  const clean = keyOrId.trim().toLowerCase();
  const memories = loadAllMemories();
  const filtered = memories.filter((m) => m.id !== clean && m.key !== clean);

  if (filtered.length !== memories.length) {
    persistMemories(filtered);
    return true;
  }
  return false;
}

/**
 * Clears all stored memories from the vault.
 */
export function clearAllMemories(): void {
  persistMemories([]);
}

/**
 * Computes memory statistics for UI dashboards.
 *
 * @returns Statistics summary object.
 */
export function getMemoryStats(): MemoryStats {
  const memories = loadAllMemories();
  const byCategory: Record<MemoryCategory, number> = {
    profile: 0,
    preference: 0,
    project: 0,
    fact: 0,
    instruction: 0,
  };

  for (const m of memories) {
    if (byCategory[m.category] !== undefined) {
      byCategory[m.category]++;
    } else {
      byCategory.fact++;
    }
  }

  return {
    total: memories.length,
    byCategory,
    lastUpdated: memories.length > 0 ? Math.max(...memories.map((m) => m.updatedAt)) : Date.now(),
  };
}

/**
 * Recalls relevant memories matching the given query using keyword and associative scoring.
 *
 * @param query - Current user utterance.
 * @param limit - Maximum number of memories to return (default: 8).
 * @returns Array of prioritized relevant memories.
 */
export function recallRelevantMemories(query: string, limit: number = 8): MemoryRecord[] {
  // 1. Attempt smart multi-modal retrieval from the Advanced Memory Coordinator
  try {
    const searchResults = defaultMemoryCoordinator.search({ query, limit });
    if (searchResults.length > 0) {
      return searchResults.map((s) => s.record as unknown as MemoryRecord);
    }
  } catch {
    /* fallback to deterministic keyword scoring */
  }

  const memories = loadAllMemories();
  if (memories.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length >= 3);

  // Score each memory by relevance + importance
  const scored = memories.map((mem) => {
    let score = mem.importance * 0.6;
    const lowerContent = mem.content.toLowerCase();
    const lowerKey = mem.key.toLowerCase();

    // Direct key match
    if (lowerQuery.includes(lowerKey) || lowerKey.includes(lowerQuery)) {
      score += 5.0;
    }

    // Keyword overlap
    for (const word of queryWords) {
      if (lowerContent.includes(word)) score += 2.0;
      if (lowerKey.includes(word)) score += 2.5;
    }

    // Instructions and user profile are baseline anchors for tone and persona
    if (mem.category === "instruction") score += 3.0;
    if (mem.category === "profile") score += 2.5;

    return { mem, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.mem);
}

/**
 * Formats recalled memories into a clean prompt context block for the neural core.
 *
 * @param memories - Array of memories to format.
 * @returns Formatted context string or empty string.
 */
export function formatMemoriesForPrompt(memories: MemoryRecord[]): string {
  if (!memories || memories.length === 0) return "";

  const lines = memories.map((m) => `- [${m.category.toUpperCase()}]: ${m.content}`);
  return `### USER PROFILE & STORED LONG-TERM MEMORIES\n${lines.join("\n")}\nAlways adhere to these user preferences and address the user appropriately.\n`;
}

/**
 * Parses user utterance specifically for name declarations or corrections (e.g. "i am not rahul i am ashish").
 *
 * @param text - Raw user input.
 * @returns Extraction object with right name and optional wrong name, or null.
 */
export function parseNameIntent(text: string): { wrong?: string; right: string; type: "correction" | "direct" } | null {
  const clean = text.replace(/[,;!]/g, " ").replace(/\s+/g, " ").toLowerCase().trim();

  // 1. Correction Pattern A: "i am not <wrong>, i am / call me <right>" or "not <wrong> i am <right>"
  const corrA = /(?:i am not|i'm not|not)\s+([a-zA-Z]{2,20})\s+(?:i am|i'm|my name is|my name's|call me|it's|it is|but)?\s*([a-zA-Z]{2,20})/i.exec(clean);
  if (corrA) {
    return { wrong: corrA[1], right: corrA[2], type: "correction" };
  }

  // 2. Correction Pattern B: "mera naam <wrong> nahi <right> hai" or "<wrong> nahi <right>"
  const corrB = /(?:mera naam|mai|main)?\s*([a-zA-Z]{2,20})\s+(?:nahi|nahi hai|nahin)\s+(?:i am|my name is|call me|mujhe|naam|hai|hu|hoon)?\s*([a-zA-Z]{2,20})/i.exec(clean);
  if (corrB && corrB[1] !== "mai" && corrB[1] !== "mera") {
    return { wrong: corrB[1], right: corrB[2], type: "correction" };
  }

  // 3. Direct Pattern: "my name is <right>", "call me <right>", "i am <right>", "mera naam <right> hai", "mai <right> hu"
  const direct = /(?:my name is|my name's|call me|mera naam|naam hai|mujhe|i am|i'm|mai|main)\s+([a-zA-Z]{2,20})(?:\s+(?:hai|hu|hoon|bolo|bolte))?/i.exec(clean);
  if (direct) {
    const candidate = direct[1];
    const stopwords = new Set([
      "not", "here", "ready", "fine", "doing", "trying", "ultron", "assistant",
      "today", "going", "back", "sorry", "happy", "listening", "good", "bad",
      "feeling", "sure", "a", "an", "the", "your", "you", "my", "me", "it",
      "name", "what", "is", "this", "that", "there", "who", "why", "how", "user"
    ]);
    if (!stopwords.has(candidate)) {
      return { right: candidate, type: "direct" };
    }
  }

  return null;
}

/**
 * Silently extracts implicit facts, preferences, or projects from conversation messages in the background.
 *
 * @param text - Incoming user utterance.
 */
export function extractImplicitFacts(text: string): void {
  // 1. Process through Advanced Memory Pipeline (Extraction, Deduplication, Reconciliation, Storage)
  try {
    defaultMemoryCoordinator.processUtterancePipeline(text, "user");
  } catch (err) {
    console.warn("[MEMORY MANAGER] Error processing utterance pipeline:", err);
  }

  const lower = text.toLowerCase().trim();

  // Location detection: "I live in X", "mai X me rehta hu", "I am based in X"
  const locationMatch = /(?:i live in|i am based in|i reside in|mai|main)\s+([a-zA-Z\s]{3,20})(?:\s+me rehta hu|\s+me rehta hoon|\s+city)?/i.exec(lower);
  if (locationMatch && !/\b(here|now|house|car|room)\b/.test(locationMatch[1])) {
    const loc = locationMatch[1].trim();
    if (loc.length > 2 && loc.length < 25) {
      saveMemory("user_location", `User is located in ${loc}`, "profile", 3, "inferred");
    }
  }

  // Project detection: "I am building X", "mai X bana raha hu", "my project is X"
  const projectMatch = /(?:i am building|i am working on|my project is|mai|main)\s+([a-zA-Z0-9\s_-]{3,30})(?:\s+project|\s+bana raha hu|\s+par kaam kar raha hu)?/i.exec(lower);
  if (projectMatch && !/\b(something|it|this|that|code)\b/.test(projectMatch[1])) {
    const proj = projectMatch[1].trim();
    if (proj.length > 3) {
      saveMemory("user_project", `User is working on project: ${proj}`, "project", 4, "inferred");
    }
  }

  // Preference detection: "I prefer X", "mujhe X pasand hai", "my favorite X is Y"
  const prefMatch = /(?:i prefer|i like using|mujhe)\s+([a-zA-Z0-9\s#+.-]{3,25})(?:\s+pasand hai|\s+over)?/i.exec(lower);
  if (prefMatch && !/\b(it|that|this|you)\b/.test(prefMatch[1])) {
    const pref = prefMatch[1].trim();
    if (pref.length > 2) {
      const key = "pref_" + pref.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 15);
      saveMemory(key, `User prefers: ${pref}`, "preference", 3, "inferred");
    }
  }
}

/**
 * Analyzes natural language input to automatically extract explicit memory commands or identity queries.
 *
 * @param text - User message text.
 * @returns Memory extraction result with confirmation response, or null if no memory command detected.
 */
export function processMemoryIntent(text: string): { action: "save" | "list" | "delete" | "clear" | "clear_blocked"; message: string } | null {
  const lower = text.toLowerCase().trim();

  // 1. Identity & "Who am I" inquiries (English & Hinglish)
  if (
    /^(who am i|mera naam kya hai|what is my name|do you know my name|do you know who i am|kya tumhe mera naam pata hai|tum mere baare me kya jaante ho)\b/i.test(lower)
  ) {
    const all = loadAllMemories();
    const nameMem = all.find((m) => m.key === "user_name");
    const roleMem = all.find((m) => m.key === "user_role");
    const facts = all.filter((m) => m.key !== "user_name" && m.key !== "user_role");

    if (nameMem) {
      const cleanName = nameMem.content.replace(/^user's name is\s+/i, "");
      let reply = `Based on my persistent memory vault, you are **${cleanName}**`;
      if (roleMem) {
        reply += `, and you work as **${roleMem.content.replace(/^user works as\s+/i, "")}**`;
      }
      reply += `.\n\n`;

      if (facts.length > 0) {
        reply += `Here are additional facts I remember about you:\n`;
        facts.forEach((f, idx) => {
          reply += `${idx + 1}. **${f.content}** *(${f.category})*\n`;
        });
      }
      return {
        action: "list",
        message: reply,
      };
    } else {
      return {
        action: "list",
        message: "You haven't introduced yourself yet! You can tell me *'My name is [Your Name]'* (or *'Mera naam [Name] hai'*), and I will permanently remember it.",
      };
    }
  }

  // 2. Name declarations and corrections (e.g. "i am not rahul i am ashish", "mera naam ashish hai")
  const nameIntent = parseNameIntent(text);
  if (nameIntent) {
    const capitalizedName = nameIntent.right.charAt(0).toUpperCase() + nameIntent.right.slice(1).toLowerCase();
    saveMemory("user_name", `User's name is ${capitalizedName}`, "profile", 5, "explicit");

    if (nameIntent.type === "correction" && nameIntent.wrong) {
      const capitalizedWrong = nameIntent.wrong.charAt(0).toUpperCase() + nameIntent.wrong.slice(1).toLowerCase();
      return {
        action: "save",
        message: `Understood! My apologies for the mix-up. I have updated my persistent memory vault: you are **${capitalizedName}**, not **${capitalizedWrong}**! I will remember this across all our chats.`,
      };
    }

    return {
      action: "save",
      message: `Pleasure to meet you, **${capitalizedName}**! I have updated my persistent neural vault. I will remember you moving forward.`,
    };
  }

  // 3. Explicit request to list stored memories
  if (
    /^(what do you remember|show (?:my )?memories|list (?:my )?memories|meri yaadein|tumhe kya yaad hai|memories|my memory)\b/i.test(lower) ||
    lower === "memories" ||
    lower === "my memory"
  ) {
    const all = loadAllMemories();
    if (all.length === 0) {
      return {
        action: "list",
        message: "Your memory vault is currently empty. You can tell me facts like *'My name is Ashish'* or *'Remember that I prefer TypeScript'*, and I will commit them to long-term memory.",
      };
    }
    const list = all
      .map((m, idx) => `${idx + 1}. **${m.content}** *[Category: ${m.category}]*`)
      .join("\n");
    return {
      action: "list",
      message: `### 🧠 ULTRON Memory Vault (${all.length} Records Stored)\n\n${list}\n\n*You can view, edit, or delete any of these from the 'Neural Memories' panel or by asking me directly.*`,
    };
  }

  // 4. Explicit request to clear memories (Safety Gate: destructive wipe requires explicit confirmation)
  if (
    /^(clear (?:all )?memories|delete (?:all )?memories|wipe memory|sab yaadein bhool jao|reset memory)\b/i.test(lower)
  ) {
    return {
      action: "clear_blocked",
      message:
        "🛡️ **Destructive Action Protection Active**\n\n" +
        "To protect your persistent profile facts and project memory, bulk vault deletion cannot be triggered via conversational text.\n\n" +
        "To clear your memory vault, please open the **Neural Memories** panel and provide explicit cryptographic confirmation, or submit an authenticated confirmation token.",
    };
  }

  // 5. Explicit "Remember that ..." command (English, Hindi, Hinglish)
  const rememberPrefix = /^(?:please\s+)?(?:remember\s+that|yaad\s+rakhna\s+ki|note\s+that|save\s+to\s+memory|ye\s+yaad\s+rakhna)\s+(.+)$/i.exec(text);
  if (rememberPrefix) {
    const fact = rememberPrefix[1].trim();
    if (fact.length >= 3) {
      const key = "custom_" + crypto.randomBytes(3).toString("hex");
      saveMemory(key, fact, "fact", 5, "explicit");
      return {
        action: "save",
        message: `Committed to long-term memory: **"${fact}"**. I will remember this across all our sessions.`,
      };
    }
  }

  // 6. Automatic User Role Extraction
  const roleMatch =
    /(?:i am a|i work as a|my role is|mai ek|main ek)\s+([a-zA-Z0-9\s_-]{3,40})(?:\s+developer|\s+engineer|\s+scientist|\s+architect|\s+designer|\s+student|\s+hu|\s+hoon)/i.exec(text);
  if (roleMatch) {
    const fullRole = roleMatch[0].replace(/^(?:i am a|i work as a|my role is|mai ek|main ek)\s+/i, "").replace(/\s+(?:hu|hoon)$/i, "");
    saveMemory("user_role", `User works as ${fullRole}`, "profile", 4, "inferred");
    return {
      action: "save",
      message: `Noted in long-term memory: You work as a **${fullRole}**. I will tailor my technical depth accordingly.`,
    };
  }

  // 7. Automatic Preferred Language / Tech Stack Extraction
  const techMatch =
    /(?:my favorite language is|i prefer using|my tech stack is|i usually code in)\s+([a-zA-Z0-9#+.\s]{2,30})/i.exec(text);
  if (techMatch) {
    const tech = techMatch[1].trim();
    saveMemory("tech_preference", `User prefers ${tech}`, "preference", 4, "inferred");
    return {
      action: "save",
      message: `Saved to memory vault: Your preferred tech stack is **${tech}**.`,
    };
  }

  // Also trigger implicit extraction for side-effects
  extractImplicitFacts(text);

  return null;
}
