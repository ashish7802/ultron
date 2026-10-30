/**
 * @file lib/conversationManager.ts
 * @description Natural turn-taking, multi-sentence continuity, and follow-up window manager.
 * 
 * Subsystem:
 * Conversational Context & Dialogue Management.
 * 
 * Key Responsibilities:
 * - Manages natural pause endpointing (e.g., distinguishing between a mid-sentence breath vs end-of-turn).
 * - Tracks follow-up listening windows (keeps assistant receptive for 5-8s after speaking).
 * - Resolves pronouns and contextual follow-ups ("what about tomorrow?", "open it", "repeat that").
 * - Gathers multi-sentence commands across short speech pauses into coherent queries.
 */

export interface TurnState {
  isTurnComplete: boolean;
  bufferedUtterance: string;
  recommendedEndpointMs: number;
}

export class ConversationManager {
  private _buffer: string[] = [];
  private _followUpActive: boolean = false;
  private _followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastAssistantReply: string = "";
  private _lastUserQuery: string = "";

  public followUpDurationMs: number = 7000; // 7 seconds receptive window after speaking

  public get isFollowUpActive(): boolean {
    return this._followUpActive;
  }

  public get lastAssistantReply(): string {
    return this._lastAssistantReply;
  }

  public get lastUserQuery(): string {
    return this._lastUserQuery;
  }

  /**
   * Appends speech chunk to turn buffer and evaluates if turn is complete.
   */
  public addSpeechChunk(chunk: string): TurnState {
    const clean = chunk.trim();
    if (clean) {
      this._buffer.push(clean);
    }

    const fullUtterance = this._buffer.join(" ");
    const isQuestion = fullUtterance.endsWith("?") || /^(what|how|why|when|where|who|can you|could you)\b/i.test(fullUtterance);
    const hasTrailingConjunction = /\b(and|or|because|so|if|then|with|that|about)\s*$/i.test(fullUtterance);

    // Calculate adaptive endpointing silence duration
    let recommendedEndpointMs = 450;
    if (hasTrailingConjunction) {
      recommendedEndpointMs = 1200; // Give user more time to complete trailing clauses
    } else if (isQuestion) {
      recommendedEndpointMs = 380; // Questions can be cut slightly faster
    } else if (fullUtterance.length < 15) {
      recommendedEndpointMs = 600; // Very short phrases might have subsequent words
    }

    return {
      isTurnComplete: !hasTrailingConjunction,
      bufferedUtterance: fullUtterance,
      recommendedEndpointMs,
    };
  }

  /**
   * Flushes turn buffer and returns final combined query.
   */
  public finalizeTurn(): string {
    const finalQuery = this._buffer.join(" ").trim();
    this._buffer = [];
    if (finalQuery) {
      this._lastUserQuery = finalQuery;
    }
    return finalQuery;
  }

  /**
   * Starts or refreshes the follow-up conversational listening window after assistant finishes speaking.
   */
  public startFollowUpWindow(onExpire?: () => void): void {
    if (this._followUpTimer) {
      clearTimeout(this._followUpTimer);
    }
    this._followUpActive = true;
    this._followUpTimer = setTimeout(() => {
      this._followUpActive = false;
      this._followUpTimer = null;
      if (onExpire) onExpire();
    }, this.followUpDurationMs);
  }

  public closeFollowUpWindow(): void {
    if (this._followUpTimer) {
      clearTimeout(this._followUpTimer);
      this._followUpTimer = null;
    }
    this._followUpActive = false;
  }

  /**
   * Records assistant reply and context for pronoun/referential resolution.
   */
  public recordAssistantReply(reply: string): void {
    this._lastAssistantReply = reply;
  }

  /**
   * Resolves common pronouns and contextual references against recent dialogue.
   */
  public resolveContextualReferences(query: string): string {
    let resolved = query;
    const lower = query.toLowerCase();

    // Resolves "what about it?", "tell me more about it", "explain that"
    if (/\b(it|that|this)\b/i.test(lower) && this._lastAssistantReply) {
      const mainSubject = this._extractMainSubject(this._lastAssistantReply);
      if (mainSubject) {
        resolved = resolved.replace(/\b(it|that|this)\b/gi, `"${mainSubject}"`);
      }
    }

    return resolved;
  }

  private _extractMainSubject(text: string): string {
    const match = text.match(/(?:about|regarding|is|called)\s+([A-Za-z0-9_\-\s]{3,25})[.,]/i);
    return match ? match[1].trim() : "";
  }

  public clear(): void {
    this._buffer = [];
    this.closeFollowUpWindow();
    this._lastAssistantReply = "";
    this._lastUserQuery = "";
  }
}

