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

/**
 * Loads all stored memories from disk.
 *
 * @returns Array of persistent memory records.
 */
export function loadAllMemories(): MemoryRecord[] {
  try {
    if (!fs.existsSync(VAULT_FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(VAULT_FILE_PATH, "utf-8");
    const parsed: MemoryVaultData = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.memories)) {
      return parsed.memories;
    }
  } catch (err) {
    console.warn("[MEMORY MANAGER] Error reading memory vault:", err);
  }
  return [];
}

/**
 * Atomically saves all memories to disk using a temporary file and rename.
 *
 * @param memories - Array of memory records to persist.
 */
export function persistMemories(memories: MemoryRecord[]): void {
  const data: MemoryVaultData = {
    version: 1,
    lastUpdated: Date.now(),
    memories,
  };

  const tempPath = `${VAULT_FILE_PATH}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempPath, VAULT_FILE_PATH);
  } catch (err) {
    console.error("[MEMORY MANAGER] Error writing memory vault:", err);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore cleanup error */ }
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
  const memories = loadAllMemories();
  const existingIndex = memories.findIndex((m) => m.key === cleanKey);

  const now = Date.now();
  let record: MemoryRecord;

  if (existingIndex >= 0) {
    record = {
      ...memories[existingIndex],
      content: content.trim(),
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
      content: content.trim(),
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
    ...(updates.content ? { content: updates.content.trim() } : {}),
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
      "feeling", "sure", "a", "an", "the"
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
export function processMemoryIntent(text: string): { action: "save" | "list" | "delete" | "clear"; message: string } | null {
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

  // 4. Explicit request to clear memories
  if (
    /^(clear (?:all )?memories|delete (?:all )?memories|wipe memory|sab yaadein bhool jao|reset memory)\b/i.test(lower)
  ) {
    clearAllMemories();
    return {
      action: "clear",
      message: "I have wiped all stored memories from the vault. Starting fresh with a clean state.",
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
