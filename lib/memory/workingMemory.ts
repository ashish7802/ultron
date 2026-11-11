/**
 * @file lib/memory/workingMemory.ts
 * @description Working Memory Subsystem for ULTRON (Memory Type 1 of 12).
 *
 * Subsystem:
 * Short-Term Conversational Attention, Turn Tracking & Transient Slot Buffer.
 *
 * Key Responsibilities:
 * - Maintains active short-term conversational turns in a fixed-capacity ring buffer (default: 10 items).
 * - Tracks transient context slots (e.g., active topic, active app, unresolved target).
 * - Retains active co-founder goals throughout multi-turn dialogues.
 * - Prevents memory leaks by automatically evicting oldest turns while preserving critical context slots.
 * - Formats active working context into structured blocks for cognitive prompt synthesis.
 *
 * Architectural Role & Interactions:
 * - Consulted by `lib/cognitive/contextEngine.ts` to resolve pronoun references and follow-up turns.
 * - Updated turn-by-turn by `app/api/chat/route.ts` upon receipt of user queries and assistant replies.
 * - Flushed when starting fresh isolated tasks or explicitly requested by the user.
 *
 * Safety / Security Guarantees:
 * - Operates entirely in volatile process memory; sensitive working slots are not written to unencrypted disks.
 * - Hard capacity limits prevent runaway memory growth or heap exhaustion.
 */

import type { WorkingMemoryItem } from "./types.ts";

export class WorkingMemoryEngine {
  private _turns: WorkingMemoryItem[] = [];
  private readonly _maxTurns: number;
  private _activeGoal: string | null = null;
  private _transientSlots: Record<string, string> = {};
  private _currentTurnCounter: number = 0;

  /**
   * Initializes the Working Memory Engine with a configurable capacity bound.
   *
   * @param maxTurns - Maximum number of recent conversational turns to retain (default: 10).
   */
  constructor(maxTurns: number = 10) {
    this._maxTurns = Math.max(3, maxTurns);
  }

  /**
   * Adds a speech or text turn to working memory, updating the recency buffer.
   *
   * @param role - Who produced the utterance ("user", "assistant", or "system").
   * @param content - Transcript or message text.
   * @param intentCategory - Optional intent category determined by Context Engine.
   * @returns Newly created WorkingMemoryItem.
   *
   * State & Side Effects:
   * Evicts the oldest turn if capacity exceeds `_maxTurns`.
   */
  public addTurn(
    role: "user" | "assistant" | "system",
    content: string,
    intentCategory?: string
  ): WorkingMemoryItem {
    this._currentTurnCounter++;
    const item: WorkingMemoryItem = {
      id: `wm_${Date.now()}_${this._currentTurnCounter}`,
      turnIndex: this._currentTurnCounter,
      role,
      content: content.trim(),
      timestamp: Date.now(),
      activeGoal: this._activeGoal ?? undefined,
      transientSlots: { ...this._transientSlots },
      intentCategory,
    };

    this._turns.push(item);

    // Evict oldest turns to enforce strict bounded capacity
    while (this._turns.length > this._maxTurns) {
      this._turns.shift();
    }

    return item;
  }

  /**
   * Retrieves all currently buffered working memory turns in chronological order.
   *
   * @returns Shallow copy array of active turns.
   */
  public getRecentTurns(): WorkingMemoryItem[] {
    return [...this._turns];
  }

  /**
   * Sets or updates the currently active strategic goal in working memory.
   *
   * @param goal - Human-readable goal statement, or null to clear.
   */
  public setActiveGoal(goal: string | null): void {
    this._activeGoal = goal ? goal.trim() : null;
  }

  /**
   * Retrieves the currently active strategic goal.
   *
   * @returns Active goal string or null.
   */
  public getActiveGoal(): string | null {
    return this._activeGoal;
  }

  /**
   * Stores a temporary entity slot (e.g. key="target_file", value="lib/memoryManager.ts").
   *
   * @param key - Slot identifier.
   * @param value - Extracted value.
   */
  public setSlot(key: string, value: string): void {
    const cleanKey = key.trim().toLowerCase();
    this._transientSlots[cleanKey] = value.trim();
  }

  /**
   * Retrieves a temporary entity slot value.
   *
   * @param key - Slot identifier.
   * @returns Stored value or undefined if not present.
   */
  public getSlot(key: string): string | undefined {
    return this._transientSlots[key.trim().toLowerCase()];
  }

  /**
   * Clears a specific transient slot.
   *
   * @param key - Slot identifier.
   */
  public clearSlot(key: string): void {
    delete this._transientSlots[key.trim().toLowerCase()];
  }

  /**
   * Completely flushes all working memory turns, goals, and transient slots.
   *
   * State & Side Effects:
   * Resets active conversational state to clean baseline.
   */
  public clearWorkingMemory(): void {
    this._turns = [];
    this._activeGoal = null;
    this._transientSlots = {};
    this._currentTurnCounter = 0;
  }

  /**
   * Formats active working memory into a structured prompt context block.
   *
   * @returns Multi-line prompt injection string, or empty string if empty.
   */
  public formatForPromptContext(): string {
    if (this._turns.length === 0 && !this._activeGoal) {
      return "";
    }

    const lines: string[] = ["### ACTIVE WORKING MEMORY (ATTENTION BUFFER)"];

    if (this._activeGoal) {
      lines.push(`- Current Strategic Goal: "${this._activeGoal}"`);
    }

    const slotKeys = Object.keys(this._transientSlots);
    if (slotKeys.length > 0) {
      const formattedSlots = slotKeys.map((k) => `${k}="${this._transientSlots[k]}"`).join(", ");
      lines.push(`- Active Context Slots: [${formattedSlots}]`);
    }

    if (this._turns.length > 0) {
      lines.push("- Recent Dialogue Turns:");
      // Show up to the last 5 turns to maintain concise prompt overhead
      const visibleTurns = this._turns.slice(-5);
      for (const turn of visibleTurns) {
        const sender = turn.role === "assistant" ? "ULTRON" : turn.role === "user" ? "Founder" : "System";
        const snippet = turn.content.length > 120 ? turn.content.slice(0, 117) + "..." : turn.content;
        lines.push(`  * ${sender}: ${snippet}`);
      }
    }

    return lines.join("\n") + "\n";
  }
}

/** Global singleton instance of the Working Memory Engine. */
export const defaultWorkingMemory = new WorkingMemoryEngine(10);
