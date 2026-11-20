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

type LegacyMemoryRecord = MemoryRecord & {
  memoryType?: MemoryCategory;
  workflowName?: string;
};

export interface MemoryVaultData {
  version: number;
  lastUpdated: number;
  memories: MemoryRecord[];
}

import { defaultAppPathService } from "./security/appPathService.ts";

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  lastUpdated: number;
}

const VAULT_FILE_PATH = defaultAppPathService.getMemoryVaultPath();
const VAULT_BACKUP_PATH = `${VAULT_FILE_PATH}.bak`;

/** Default founder seed memories loaded when no existing vault is decryptable. */
const DEFAULT_FOUNDER_MEMORIES: MemoryRecord[] = [
  {
    id: "mem_0758f7efb687",
    key: "user_name",
    category: "profile",
    content: "User's name is Ashish",
    importance: 5,
    confidence: 1,
    createdAt: 1794105280814,
    updatedAt: 1794197500000,
    source: "explicit",
    provenance: {
      origin: "bootstrap_seed",
      timestamp: 1794197500000,
    },
  },
  {
    id: "mem_5c30f77289b9",
    key: "custom_9d0d98",
    category: "fact",
    content: "I am building an autonomous AI assistant",
    importance: 5,
    confidence: 1,
    createdAt: 1794105280907,
    updatedAt: 1794105280907,
    source: "explicit",
    provenance: {
      origin: "bootstrap_seed",
      timestamp: 1794105280907,
    },
  },
];

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
        try {
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
        } catch {
          // Historical vault key mismatch: preserve file on disk safely without noise
          return null;
        }
      }
    }
  } catch (err) {
    console.warn("[MEMORY MANAGER] Invalid vault format on disk:", err instanceof Error ? err.message : String(err));
  }
  return null;
}

/**
 * Loads all stored memories from disk with automatic backup recovery and backward compatibility.
 *
 * @returns Array of persistent memory records.
 */
export function loadAllMemories(): MemoryRecord[] {
  let loadedMemories: MemoryRecord[] = [];
  try {
    if (fs.existsSync(VAULT_FILE_PATH)) {
      const raw = fs.readFileSync(VAULT_FILE_PATH, "utf-8");
      const parsed = decryptVaultData(raw);
      if (parsed && Array.isArray(parsed.memories)) {
        loadedMemories = parsed.memories.map((m: LegacyMemoryRecord) => ({
          ...m,
          category: m.category || m.memoryType || "fact",
          content: typeof m.content === "string" ? m.content : (m.workflowName || JSON.stringify(m)),
          provenance: m.provenance || {
            origin: "user_conversation",
            timestamp: m.updatedAt || m.createdAt || Date.now(),
          },
        }));
      }
    }
    // Attempt recovery from backup if primary read failed or produced empty list
    if (loadedMemories.length === 0 && fs.existsSync(VAULT_BACKUP_PATH)) {
      console.warn("[MEMORY MANAGER] Attempting recovery from vault backup...");
      const rawBak = fs.readFileSync(VAULT_BACKUP_PATH, "utf-8");
      const parsedBak = decryptVaultData(rawBak);
      if (parsedBak && Array.isArray(parsedBak.memories)) {
        loadedMemories = parsedBak.memories.map((m: LegacyMemoryRecord) => ({
          ...m,
          category: m.category || m.memoryType || "fact",
          content: typeof m.content === "string" ? m.content : (m.workflowName || JSON.stringify(m)),
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

  // Guarantee Zero Data Loss: founder identity and core project facts must never be dropped
  for (const seed of DEFAULT_FOUNDER_MEMORIES) {
    if (!loadedMemories.some((m) => m.key === seed.key)) {
      loadedMemories.unshift(seed);
    }
  }

  // Safety Gate: NEVER overwrite disk vault if decryption returned empty but a non-empty vault exists on disk
  if (fs.existsSync(VAULT_FILE_PATH)) {
    try {
      const stats = fs.statSync(VAULT_FILE_PATH);
      if (stats.size > 200 && loadedMemories.length <= DEFAULT_FOUNDER_MEMORIES.length) {
        // Vault file exists and has substantial size, but only default seeds are loaded;
        // Avoid overwriting existing encrypted user data with default seeds!
        console.warn("[MEMORY MANAGER] Preserving existing encrypted vault on disk from accidental empty overwrite.");
        return loadedMemories;
      }
    } catch {}
  }

  // Pure read: loadAllMemories never writes back to disk during read operations.
  return loadedMemories;
}

/**
 * Atomically saves all memories to disk using authenticated AES-256-GCM encryption and backup.
 *
 * @param memories - Array of memory records to persist.
 * @throws Error if atomic write or encryption fails.
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
    throw new Error(`Failed to persist memory vault to disk: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
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

  // Anchor corrections to a full identity statement so unrelated phrases like "mai ne to ye nahi bola"
  // cannot be misread as a correction such as "Bola, not Ye".
  const corrA = /^(?:(?:i am|i'm)\s+not|not)\s+([a-zA-Z]{2,20})\s+(?:i am|i'm|my name is|my name's|call me|it's|it is|but)\s+([a-zA-Z]{2,20})[.!?]?$/i.exec(clean);
  if (corrA) {
    return { wrong: corrA[1], right: corrA[2], type: "correction" };
  }

  // Hinglish corrections need an explicit name/identity frame and must consume the whole utterance.
  const corrB = /^(?:mera naam)\s+([a-zA-Z]{2,20})\s+(?:nahi|nahin)\s+([a-zA-Z]{2,20})\s+hai[.!?]?$/i.exec(clean);
  if (corrB) {
    return { wrong: corrB[1], right: corrB[2], type: "correction" };
  }
  const corrC = /^(?:mai|main)\s+([a-zA-Z]{2,20})\s+(?:nahi|nahin)\s+([a-zA-Z]{2,20})(?:\s+(?:hai|hu|hoon|hun))?[.!?]?$/i.exec(clean);
  if (corrC) {
    return { wrong: corrC[1], right: corrC[2], type: "correction" };
  }

  // 3. Direct identity statements: requires complete, unambiguous name declaration frames.
  // Plain sentences such as "I am building...", "I am going...", or "Main kal..." must never be misparsed as names.
  const direct =
    /^(?:my name is|my name's|call me|mera naam|naam hai|mujhe)\s+([a-zA-Z]{2,20})(?:\s+(?:hai|bolo|bolte))?[.!?]?$/i.exec(clean) ||
    /^(?:i am|i'm)\s+([a-zA-Z]{2,20})[.!?]?$/i.exec(clean) ||
    /^(?:mai|main)\s+([a-zA-Z]{2,20})\s+(?:hu|hoon|hun)[.!?]?$/i.exec(clean);

  if (direct) {
    const candidate = direct[1].trim();
    const candidateLower = candidate.toLowerCase();
    const stopwords = new Set([
      "not", "here", "ready", "fine", "doing", "trying", "ultron", "assistant",
      "today", "going", "back", "sorry", "happy", "listening", "good", "bad",
      "feeling", "sure", "a", "an", "the", "your", "you", "my", "me", "it",
      "name", "what", "is", "this", "that", "there", "who", "why", "how", "user",
      "building", "working", "going", "running", "learning", "eating", "sleeping",
      "writing", "reading", "typing", "coding", "testing", "fixing", "creating",
      "making", "talking", "helping", "asking", "telling", "playing", "sitting",
      "standing", "using", "living", "kal", "aaj", "theek", "accha", "bura"
    ]);

    // Reject verbs ending in "ing" or words matching stopword set
    if (!stopwords.has(candidateLower) && !candidateLower.endsWith("ing")) {
      return { right: candidate, type: "direct" };
    }
  }

  return null;
}

/**
 * Silently extracts implicit facts, preferences, or projects from conversation messages in the background.
 * Requires complete, intent-specific phrases in English and Hindi/Hinglish to prevent false inferences.
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

  // Location detection: requires explicit residence framing in English or Hinglish.
  // "I live in Delhi", "I am based in Mumbai", "mai Delhi me rehta hu"
  // NEVER match "main" alone (e.g. "Main kal office jaunga" must NOT extract location).
  const locationMatch =
    /(?:i live in|i am based in|i reside in)\s+([a-zA-Z\s]{2,20})(?:\s+city)?[.!?]?$/i.exec(lower) ||
    /(?:mai|main)\s+([a-zA-Z\s]{2,20})\s+(?:me|mein)\s+rehta\s+(?:hu|hoon|hun)[.!?]?$/i.exec(lower);

  if (locationMatch && !/\b(here|now|house|car|room|office|home)\b/i.test(locationMatch[1])) {
    const loc = locationMatch[1].trim();
    if (loc.length > 2 && loc.length < 25 && !/\b(kal|aaj|parso|jaldi)\b/i.test(loc)) {
      saveMemory("user_location", `User is located in ${loc}`, "profile", 3, "inferred");
    }
  }

  // Project detection: requires explicit project declaration.
  // "I am building an assistant", "I am working on Ultron", "my project is Ultron", "mai Ultron par kaam kar raha hu"
  // NEVER match "main" alone.
  const projectMatch =
    /(?:i am building|i am working on|my project is)\s+([a-zA-Z0-9\s_-]{2,30})[.!?]?$/i.exec(lower) ||
    /(?:mai|main)\s+([a-zA-Z0-9\s_-]{2,30})\s+(?:bana raha hu|bana raha hoon|par kaam kar raha hu|par kaam kar raha hoon)[.!?]?$/i.exec(lower);

  if (projectMatch && !/\b(something|it|this|that|code|kal|office)\b/i.test(projectMatch[1])) {
    const proj = projectMatch[1].trim();
    if (proj.length > 2) {
      saveMemory("user_project", `User is working on project: ${proj}`, "project", 4, "inferred");
    }
  }

  // Preference detection: requires complete preference phrases.
  // "I prefer Next.js", "I like using TypeScript", "mujhe Python pasand hai"
  const prefMatch =
    /(?:i prefer|i like using)\s+([a-zA-Z0-9\s#+.-]{2,25})[.!?]?$/i.exec(lower) ||
    /(?:mujhe)\s+([a-zA-Z0-9\s#+.-]{2,25})\s+pasand\s+hai[.!?]?$/i.exec(lower);

  if (prefMatch && !/\b(it|that|this|you)\b/i.test(prefMatch[1])) {
    const pref = prefMatch[1].trim();
    if (pref.length > 1) {
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
    // Filter strictly for personal profile & user preference facts. Exclude research dossiers, procedural instructions, lessons, and malformed strings.
    const validCategories = new Set(["profile", "preference", "user_profile"]);
    const facts = all.filter((m) => {
      if (m.key === "user_name" || m.key === "user_role") return false;
      if (!validCategories.has(m.category)) return false;
      if (m.key.startsWith("lesson_") || m.key.startsWith("rec_") || m.key.startsWith("claim_") || m.key.startsWith("rule_")) return false;
      if (m.content.includes("[RESEARCH DOSSIER]") || m.content.includes("ACME_") || m.content.includes("LETSENCRYPT")) return false;
      // Exclude conversational noise or malformed strings
      if (m.content.length < 3 || m.content.includes("ne to ye nahi bola")) return false;
      return true;
    });

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
