/**
 * @file lib/listeningStateMachine.ts
 * @description Formal 10-state Listening State Machine for ULTRON AI.
 * 
 * Subsystem:
 * Audio & Voice Perception Engine.
 * 
 * Architectural Role:
 * Governs the lifecycle of microphone audio capture, wake-word gating, speech buffering,
 * continuation timeouts, synthesis delivery, interruptions, and safety muting.
 * 
 * Valid States:
 * - IDLE: Standby; ambient audio monitored without executing commands.
 * - WAKE_WORD_DETECTION: Passive listening specifically for the activation phrase ("Ultron", "Hey Ultron").
 * - ACTIVE_LISTENING: User activated; high-gain audio streaming & transcription in progress.
 * - SPEECH_PROCESSING: Audio captured; VAD endpoint confirmed; transcription and decision engine evaluating.
 * - WAITING_FOR_CONTINUATION: Short pause detected; keeping audio pipeline primed for multi-sentence inputs.
 * - RESPONSE_PENDING: Decision engine approved response; queuing or awaiting LLM token streams.
 * - SPEAKING: TTS audio playback active; barge-in detector armed.
 * - INTERRUPTED: User spoke during TTS; output paused/cancelled; transition back to ACTIVE_LISTENING.
 * - TEMPORARILY_MUTED: User or system muted microphone; no audio captured or processed.
 * - ERROR_RECOVERY: Recovering from mic disconnect, audio context failure, or service crash.
 */

export type ListeningState =
  | "IDLE"
  | "WAKE_WORD_DETECTION"
  | "ACTIVE_LISTENING"
  | "SPEECH_PROCESSING"
  | "WAITING_FOR_CONTINUATION"
  | "RESPONSE_PENDING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "TEMPORARILY_MUTED"
  | "ERROR_RECOVERY";

export type ActivationMode = "WAKE_WORD" | "PUSH_TO_TALK" | "CONTINUOUS_CONVERSATION";

export interface StateTransitionEvent {
  from: ListeningState;
  to: ListeningState;
  reason: string;
  timestamp: number;
}

export type StateChangeListener = (event: StateTransitionEvent) => void;

export class ListeningStateMachine {
  private _state: ListeningState = "IDLE";
  private _mode: ActivationMode = "WAKE_WORD";
  private _listeners: Set<StateChangeListener> = new Set();
  private _history: StateTransitionEvent[] = [];
  private _continuationTimer: ReturnType<typeof setTimeout> | null = null;
  private _activeListeningTimer: ReturnType<typeof setTimeout> | null = null;
  private _responseTimer: ReturnType<typeof setTimeout> | null = null;
  private _mutedPreviousState: ListeningState = "IDLE";

  // Configurable timeouts in milliseconds
  public continuationTimeoutMs: number = 1800; // Time to wait for user to continue speaking
  public maxActiveListeningMs: number = 10000; // Maximum duration of uninterrupted speech chunk
  public maxResponseWaitMs: number = 8000;    // Maximum wait time for reasoning engine before timeout

  constructor(initialMode: ActivationMode = "WAKE_WORD") {
    this._mode = initialMode;
    // Start in the idle state that matches the activation mode: push-to-talk waits
    // for a key press (IDLE), continuous mode is already listening, and wake-word
    // mode passively scans for the activation phrase.
    this._state = this._resolveDefaultWaitingState();
  }

  public get state(): ListeningState {
    return this._state;
  }

  public get mode(): ActivationMode {
    return this._mode;
  }

  public setMode(mode: ActivationMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    
    // Automatically transition default waiting state based on activation mode
    if (this._state === "IDLE" || this._state === "WAKE_WORD_DETECTION" || this._state === "ACTIVE_LISTENING") {
      if (mode === "CONTINUOUS_CONVERSATION") {
        this.transition("ACTIVE_LISTENING", `Mode changed to ${mode}`);
      } else if (mode === "WAKE_WORD") {
        this.transition("WAKE_WORD_DETECTION", `Mode changed to ${mode}`);
      } else {
        this.transition("IDLE", `Mode changed to ${mode}`);
      }
    }
  }

  public subscribe(listener: StateChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public getHistory(limit: number = 20): StateTransitionEvent[] {
    return this._history.slice(-limit);
  }

  /**
   * Validates and executes state transitions according to deterministic rules.
   */
  public transition(target: ListeningState, reason: string): boolean {
    if (this._state === target) return true;

    // Handle MUTE overrides
    if (target === "TEMPORARILY_MUTED") {
      this._clearAllTimers();
      this._mutedPreviousState = this._state;
      return this._commit(target, reason);
    }

    if (this._state === "TEMPORARILY_MUTED" && target !== "ERROR_RECOVERY") {
      // Only unmuting can exit TEMPORARILY_MUTED
      if (reason.toLowerCase().includes("unmute")) {
        // Restore the last stable waiting state the user was in when muted; transient
        // states (SPEAKING, SPEECH_PROCESSING, ...) fall back to the mode default.
        const previous = this._mutedPreviousState;
        const restoreTarget =
          previous === "IDLE" || previous === "WAKE_WORD_DETECTION" || previous === "ACTIVE_LISTENING"
            ? previous
            : this._resolveDefaultWaitingState();
        return this._commit(restoreTarget, "Unmuted by user");
      }
      return false; // Cannot transition while muted
    }

    // Comprehensive transition validity matrix
    const isValid = this._validateTransition(this._state, target);
    if (!isValid) {
      console.warn(`[ULTRON FSM] Rejected invalid transition: ${this._state} -> ${target} (${reason})`);
      return false;
    }

    this._clearAllTimers();

    // Setup state entry hooks & safety timeouts
    if (target === "ACTIVE_LISTENING") {
      this._activeListeningTimer = setTimeout(() => {
        this.transition("SPEECH_PROCESSING", "Max speech chunk duration reached");
      }, this.maxActiveListeningMs);
    } else if (target === "WAITING_FOR_CONTINUATION") {
      this._continuationTimer = setTimeout(() => {
        // Resolve the fallback at expiry time: the activation mode may have changed
        // while this timer was pending (e.g. continuous -> push-to-talk).
        this.transition(this._resolveDefaultWaitingState(), "Continuation expired");
      }, this.continuationTimeoutMs);
    } else if (target === "RESPONSE_PENDING") {
      this._responseTimer = setTimeout(() => {
        // Reasoning engine never delivered a reply: drop back to a safe listening state
        // instead of hanging in RESPONSE_PENDING forever.
        this.transition(
          this._resolveDefaultWaitingState(),
          "Response wait timeout exceeded",
        );
      }, this.maxResponseWaitMs);
    }

    return this._commit(target, reason);
  }

  private _validateTransition(from: ListeningState, to: ListeningState): boolean {
    switch (from) {
      case "IDLE":
        return to === "WAKE_WORD_DETECTION" || to === "ACTIVE_LISTENING" || to === "ERROR_RECOVERY";
      case "WAKE_WORD_DETECTION":
        return to === "ACTIVE_LISTENING" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "ACTIVE_LISTENING":
        return to === "SPEECH_PROCESSING" || to === "WAITING_FOR_CONTINUATION" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "SPEECH_PROCESSING":
        return to === "RESPONSE_PENDING" || to === "WAITING_FOR_CONTINUATION" || to === "ACTIVE_LISTENING" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "WAITING_FOR_CONTINUATION":
        return to === "ACTIVE_LISTENING" || to === "SPEECH_PROCESSING" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "RESPONSE_PENDING":
        return to === "SPEAKING" || to === "ACTIVE_LISTENING" || to === "WAITING_FOR_CONTINUATION" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "SPEAKING":
        return to === "INTERRUPTED" || to === "WAITING_FOR_CONTINUATION" || to === "ACTIVE_LISTENING" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "INTERRUPTED":
        return to === "ACTIVE_LISTENING" || to === "SPEECH_PROCESSING" || to === "WAKE_WORD_DETECTION" || to === "IDLE" || to === "ERROR_RECOVERY";
      case "ERROR_RECOVERY":
        return to === "IDLE" || to === "WAKE_WORD_DETECTION" || to === "ACTIVE_LISTENING";
      case "TEMPORARILY_MUTED":
        // Muted state only allows the explicit unmute path or emergency recovery.
        return to === "ERROR_RECOVERY";
      default:
        return false;
    }
  }

  private _resolveDefaultWaitingState(): ListeningState {
    if (this._mode === "CONTINUOUS_CONVERSATION") return "ACTIVE_LISTENING";
    if (this._mode === "PUSH_TO_TALK") return "IDLE";
    return "WAKE_WORD_DETECTION";
  }

  private _commit(target: ListeningState, reason: string): boolean {
    const event: StateTransitionEvent = {
      from: this._state,
      to: target,
      reason,
      timestamp: Date.now(),
    };
    this._state = target;
    this._history.push(event);
    if (this._history.length > 50) this._history.shift();

    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[ULTRON FSM Listener Error]", err);
      }
    }
    return true;
  }

  private _clearAllTimers(): void {
    if (this._continuationTimer) {
      clearTimeout(this._continuationTimer);
      this._continuationTimer = null;
    }
    if (this._activeListeningTimer) {
      clearTimeout(this._activeListeningTimer);
      this._activeListeningTimer = null;
    }
    if (this._responseTimer) {
      clearTimeout(this._responseTimer);
      this._responseTimer = null;
    }
  }

  /**
   * Detaches every listener and clears pending timers so the machine can be
   * discarded without leaking timeouts or calling back into an unmounted UI.
   */
  public dispose(): void {
    this._clearAllTimers();
    this._listeners.clear();
    this._history = [];
  }

  /**
   * Reset state machine to clean default condition.
   *
   * @description Bypasses the transition matrix on purpose: a reset must always
   * succeed (even from TEMPORARILY_MUTED) so a new voice session can never inherit
   * a stale state.
   */
  public reset(): void {
    this._clearAllTimers();
    const target = this._resolveDefaultWaitingState();
    if (this._state === target) return;
    this._commit(target, "FSM Reset");
  }
}

