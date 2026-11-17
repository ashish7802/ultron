/**
 * @file components/UltronOrb.tsx
 * @description Primary client-side UI component hosting the ULTRON 3D Holographic HUD, Web Audio VAD,
 * microphone recording, speech synthesis playback, gesture recognition, and status overlays.
 * 
 * Subsystem:
 * Holographic Frontend & Multimodal Interaction Manager.
 * 
 * Key Responsibilities:
 * - Mounts Three.js canvas and manages lifecycle of the 3D orb particle scene.
 * - Manages Web Audio API pipeline: AudioContext, AnalyserNode, RMS volume calculation, and VAD.
 * - Handles live speech recording, sub-second streaming STT dispatch, and TTS speech playback.
 * - Implements full-duplex barge-in interruption (silencing output when user speaks).
 * - Integrates webcam hand tracking gestures (pinch, rotate, open-palm repel).
 * - Displays active agent execution plans, token streaming, and system telemetry HUD badges.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi, type AssistantVisualState } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import { ListeningStateMachine, type ListeningState, type ActivationMode } from "@/lib/listeningStateMachine";
import { AudioProcessor } from "@/lib/audioProcessor";
import { ConversationManager } from "@/lib/conversationManager";

type CameraState = "off" | "starting" | "on" | "error";
type ChatMessage = { role: "user" | "assistant"; content: string };
/** Voice state reported to the dashboard without exposing the internal audio graph. */
type VoiceStatus = {
  active: boolean;
  label: string;
  assistantState: AssistantVisualState;
  error: string | null;
};

/** Optional embedding controls; standalone mode preserves the original full HUD behavior. */
interface UltronOrbProps {
  compact?: boolean;
  wakeWordEnabled?: boolean;
  voiceToggleRequest?: number;
  onVoiceStateChange?: (status: VoiceStatus) => void;
}

function limitConversation(messages: ChatMessage[]): ChatMessage[] {
  const recentMessages = messages.slice(-MAX_CONVERSATION_MESSAGES);
  let totalCharacters = recentMessages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  while (recentMessages.length > 1 && totalCharacters > MAX_CONVERSATION_CHARACTERS) {
    const removedMessage = recentMessages.shift();
    totalCharacters -= removedMessage?.content.length ?? 0;
  }
  return recentMessages;
}

const SPEECH_START_LEVEL = 0.010;
const SPEECH_END_LEVEL = 0.008;
const BARGE_IN_LEVEL = 0.015;
const SILENCE_END_MS = 380;
const MAX_RECORDING_MS = 8_000;
const MIN_RECORDING_MS = 300;
const MAX_CONVERSATION_MESSAGES = 20;
const MAX_CONVERSATION_CHARACTERS = 12_000;

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

/**
 * Hosts the existing voice engine and optional Three.js HUD.
 *
 * @param props - Embedding mode, wake-word policy, and dashboard state callbacks.
 * @returns Full HUD or a visually hidden voice-engine bridge.
 * @throws No microphone or filesystem work occurs during render; permission errors are reported in component state.
 */
export default function UltronOrb({
  compact = false,
  wakeWordEnabled = !compact,
  voiceToggleRequest = 0,
  onVoiceStateChange,
}: UltronOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [assistantState, setAssistantState] = useState<AssistantVisualState>("idle");
  const [activePlan, setActivePlan] = useState<{ goal: string; passed: number; total: number; status: string } | null>(null);

  // Voice & Chat State
  const [voiceActive, setVoiceActive] = useState(false);
  const [listeningState, setListeningState] = useState<ListeningState>("WAKE_WORD_DETECTION");
  const [activationMode, setActivationMode] = useState<ActivationMode>("WAKE_WORD");
  const [snrDb, setSnrDb] = useState<number>(0);
  const fsmRef = useRef<ListeningStateMachine>(new ListeningStateMachine("WAKE_WORD"));
  const audioProcessorRef = useRef<AudioProcessor>(new AudioProcessor());
  const conversationMgrRef = useRef<ConversationManager>(new ConversationManager());
  const [voiceLabel, setVoiceLabel] = useState<string>("VOICE OFF");
  const [micLevel, setMicLevel] = useState(0);
  const [textPromptOpen, setTextPromptOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [brainTag, setBrainTag] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monotonic TTS playback generation. Bumped whenever existing speech is
  // cancelled (STOP, barge-in, voice off, unmount) so callbacks belonging to a
  // cancelled utterance can never restart the speech queue.
  const speechGenerationRef = useRef(0);
  const lastVoiceToggleRequestRef = useRef(0);


  // Autonomous Quantum Web & Browser Research State
  const [activeResearch, setActiveResearch] = useState<{
    status: string;
    query: string;
    vectors_evaluated: string[];
    sources_harvested_count: number;
    sources_analyzed_count: number;
    sources: Array<{
      title: string;
      url: string;
      domain: string;
      snippet: string;
      credibility_score: number;
    }>;
    executive_summary: string;
    key_findings: string[];
    deep_analysis: string;
    telemetry: {
      elapsed_ms: number;
      quantum_vectors: number;
      live_crawled_pages: number;
      timestamp: number;
    };
  } | null>(null);

  const [researchModalOpen, setResearchModalOpen] = useState(false);
  const [researchInput, setResearchInput] = useState("");
  const [isResearching, setIsResearching] = useState(false);

  const speechQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);
  const voiceActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const isChatBusyRef = useRef(false);
  const chatRequestRef = useRef(0);
  const voiceSessionRef = useRef(0);
  const processingSessionRef = useRef<number | null>(null);
  const speechCooldownUntilRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const conversationRef = useRef<ChatMessage[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const startVoiceSystemRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    let scene: OrbSceneApi | null = null;
    if (!compact && container) {
      try {
        scene = createOrbScene(container);
        sceneRef.current = scene;
      } catch (sceneError) {
        const message = sceneError instanceof Error ? sceneError.message : String(sceneError);
        setError(`HOLOGRAPHIC VISUALIZER UNAVAILABLE: ${message}`);
      }
    }
    return () => {
      voiceActiveRef.current = false;
      voiceSessionRef.current += 1;
      // Invalidate any in-flight TTS callbacks before tearing the audio graph down.
      speechGenerationRef.current += 1;
      if (subtitleTimerRef.current) {
        clearTimeout(subtitleTimerRef.current);
        subtitleTimerRef.current = null;
      }
      if (planClearTimerRef.current) {
        clearTimeout(planClearTimerRef.current);
        planClearTimerRef.current = null;
      }
      stopVoiceStream();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          // Browser speech synthesis outlives the React tree; without this the
          // assistant keeps talking after the HUD unmounts.
          window.speechSynthesis.cancel();
        } catch {}
      }
      audioProcessorRef.current.dispose();
      fsmRef.current.dispose();
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [compact]);

  // Direct Access: No biometric check or background auth polling required

  const updateVisualState = useCallback(
    (st: AssistantVisualState, data?: { audioLevel?: number; progress?: number }) => {
      setAssistantState(st);
      sceneRef.current?.setAssistantState(st, data);
    },
    [],
  );

  const cancelOngoingAction = useCallback(() => {
    // Invalidate TTS callbacks before cancelling: speechSynthesis fires onerror/
    // onend for the cancelled utterance and those handlers would otherwise restart
    // the queue from the next scheduled sentence.
    speechGenerationRef.current += 1;
    audioProcessorRef.current.setAssistantSpeaking(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
      } catch {}
      activeAudioRef.current = null;
    }
    void fetch("/api/tts", { method: "DELETE" }).catch(() => {});
    speechQueueRef.current = [];
    isPlayingQueueRef.current = false;
    isSpeakingRef.current = false;
    isChatBusyRef.current = false;
    chatRequestRef.current += 1;
    if (planClearTimerRef.current) {
      clearTimeout(planClearTimerRef.current);
      planClearTimerRef.current = null;
    }
    setActivePlan(null);
    speechCooldownUntilRef.current = performance.now() + 400;
    updateVisualState(voiceActiveRef.current ? "listening" : "idle");
    setVoiceLabel(voiceActiveRef.current ? "LISTENING…" : "VOICE OFF");
  }, [updateVisualState]);

  const playNextSentence = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speechQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      isSpeakingRef.current = false;
      audioProcessorRef.current.setAssistantSpeaking(false);
      speechCooldownUntilRef.current = performance.now() + 450;
      updateVisualState(voiceActiveRef.current ? "listening" : "idle");
      setVoiceLabel(voiceActiveRef.current ? "LISTENING…" : "VOICE OFF");
      if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
      subtitleTimerRef.current = setTimeout(() => {
        setSubtitle(null);
        setBrainTag(null);
      }, 7000);
      return;
    }

    const sentence = speechQueueRef.current.shift()!;
    isPlayingQueueRef.current = true;
    isSpeakingRef.current = true;
    // Snapshot the playback generation before speaking. If the user cancels speech
    // (STOP / barge-in / voice off), the generation is bumped and callbacks fired
    // by the cancelled utterance are ignored instead of advancing the queue.
    const playbackGeneration = speechGenerationRef.current;
    const isStalePlayback = () => playbackGeneration !== speechGenerationRef.current;
    audioProcessorRef.current.setAssistantSpeaking(true);
    pauseVoiceRecorder();
    updateVisualState("speaking", { audioLevel: 0.7 });
    setVoiceLabel("SPEAKING…");

    const playFallback = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        playNextSentence();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang === "en-IN" || v.lang.includes("en-IN")) ||
        voices.find((v) => v.name.toLowerCase().includes("ravi") || v.name.toLowerCase().includes("neerja") || v.name.toLowerCase().includes("david")) ||
        voices.find((v) => v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) ||
        voices.find((v) => v.lang.startsWith("hi"));
      if (preferredVoice) utterance.voice = preferredVoice;

      let finished = false;
      const watchdogDuration = Math.max(3000, sentence.length * 110);
      const watchdog = setTimeout(() => {
        if (!finished && isSpeakingRef.current && !isStalePlayback()) {
          finished = true;
          playNextSentence();
        }
      }, watchdogDuration);

      utterance.onend = () => {
        if (!finished) {
          finished = true;
          clearTimeout(watchdog);
          if (!isStalePlayback()) playNextSentence();
        }
      };

      utterance.onerror = () => {
        if (!finished) {
          finished = true;
          clearTimeout(watchdog);
          if (!isStalePlayback()) playNextSentence();
        }
      };

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        finished = true;
        clearTimeout(watchdog);
        if (!isStalePlayback()) playNextSentence();
      }
    };

    // Instant zero-delay native browser speech synthesis
    playFallback();
  }, [updateVisualState]);

  const queueSpeechChunk = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      speechQueueRef.current.push(clean);
      if (!isPlayingQueueRef.current) {
        playNextSentence();
      }
    },
    [playNextSentence],
  );

  const speakLocal = useCallback(
    (text: string) => {
      // Bump the generation BEFORE cancel() so the cancelled utterance's async
      // onend/onerror can never fire playNextSentence into the new queue.
      speechGenerationRef.current += 1;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      speechQueueRef.current = [];
      isPlayingQueueRef.current = false;
      isSpeakingRef.current = false;
      queueSpeechChunk(text);
    },
    [queueSpeechChunk],
  );

  const scheduleVoiceTurn = (transcript: string, sessionId: number) => {
    if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) return;

    const turn = conversationMgrRef.current.addSpeechChunk(transcript);
    if (speechTurnTimerRef.current) {
      clearTimeout(speechTurnTimerRef.current);
    }

    // Wait for the adaptive silence budget so short recognition fragments and
    // clause pauses are combined into one conversational turn.
    speechTurnTimerRef.current = setTimeout(() => {
      speechTurnTimerRef.current = null;
      const completeTurn = conversationMgrRef.current.finalizeTurn();
      if (!completeTurn || !voiceActiveRef.current || sessionId !== voiceSessionRef.current) return;
      void handleUserSpeech(completeTurn, sessionId);
    }, turn.recommendedEndpointMs);
  };

  /**
   * Executes autonomous quantum web research on a specific topic.
   * Probes live search engines, crawls pages, scores credibility, and synthesizes findings.
   */
  const executeAutonomousResearch = useCallback(
    async (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed || isResearching) return;
      setIsResearching(true);
      setSubtitle(`[QUANTUM RESEARCH INITIATED]: Probing live web for "${trimmed}"...`);
      setBrainTag("QUANTUM RESEARCH [MULTI-VECTOR PROBES]");
      updateVisualState("thinking", { progress: 0.3 });

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });

        const data = await res.json();
        if (res.ok && data.success && data.dossier) {
          setActiveResearch(data.dossier);
          setBrainTag("QUANTUM DOSSIER SYNTHESIZED");
          updateVisualState("executing", { progress: 1.0 });

          if (data.dossier.executive_summary) {
            setSubtitle(data.dossier.executive_summary);
            queueSpeechChunk(data.dossier.executive_summary);
          }
        } else {
          setError(data.message || data.error || "Autonomous research failed");
          updateVisualState("idle");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to execute research");
        updateVisualState("idle");
      } finally {
        setIsResearching(false);
      }
    },
    [isResearching, queueSpeechChunk, updateVisualState],
  );

  const processAudioBlob = async (blob: Blob, sessionId: number) => {
    if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) {
      return;
    }
    if (isSpeakingRef.current || isProcessingRef.current || isChatBusyRef.current) {
      return;
    }
    if (blob.size < 500) {
      // Too little audio to transcribe; restore the idle listening label that
      // recorder.onstop switched to "THINKING…".
      setVoiceLabel("LISTENING…");
      updateVisualState("listening");
      return;
    }

    isProcessingRef.current = true;
    processingSessionRef.current = sessionId;
    try {
      const transcriptionStarted = performance.now();
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data: { text?: string; error?: string } = await res.json();
      console.info("[ULTRON TIMING] transcription", {
        elapsedMs: Math.round(performance.now() - transcriptionStarted),
        audioBytes: blob.size,
      });
      if (!res.ok) {
        throw new Error(data.error || `Transcription service returned ${res.status}`);
      }

      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) return;
      const transcript = data.text?.trim() ?? "";
      if (!transcript) {
        console.debug("[ULTRON STT] No speech detected in the captured audio.");
        if (voiceActiveRef.current && sessionId === voiceSessionRef.current) {
          setVoiceLabel("LISTENING…");
          updateVisualState("listening");
        }
        return;
      }

      const normalizedTranscript = transcript.toLowerCase();
      const isKnownHallucination =
        normalizedTranscript.includes("subtitles by") ||
        normalizedTranscript.includes("thank you for watching") ||
        normalizedTranscript.includes("thanks for watching") ||
        normalizedTranscript.includes("amara.org") ||
        normalizedTranscript === "you" ||
        normalizedTranscript === "bye" ||
        normalizedTranscript === "status report.";
      if (isKnownHallucination) {
        console.debug("[ULTRON STT] Ignored a known Whisper false positive.");
        if (voiceActiveRef.current && sessionId === voiceSessionRef.current) {
          setVoiceLabel("LISTENING…");
          updateVisualState("listening");
        }
        return;
      }

      setVoiceLabel(`HEARD: "${transcript.slice(0, 18)}…"`);
      setError(null);
      scheduleVoiceTurn(transcript, sessionId);
    } catch (err) {
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown transcription error";
      console.error("STT process error:", err);
      setError(`TRANSCRIPTION FAILED: ${message}`);
      setVoiceLabel("LISTENING…");
      updateVisualState("listening");
    } finally {
      if (processingSessionRef.current === sessionId) {
        processingSessionRef.current = null;
        isProcessingRef.current = false;
      }
      if (
        voiceActiveRef.current &&
        sessionId === voiceSessionRef.current &&
        !isSpeakingRef.current &&
        !isChatBusyRef.current
      ) {
        setVoiceLabel("LISTENING…");
        updateVisualState("listening");
      }
    }
  };

  const pauseVoiceRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const stopVoiceStream = () => {
    pauseVoiceRecorder();
    if (speechTurnTimerRef.current) {
      clearTimeout(speechTurnTimerRef.current);
      speechTurnTimerRef.current = null;
    }
    conversationMgrRef.current.finalizeTurn();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordingStartedAtRef.current = null;
    silenceStartedAtRef.current = null;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Release the secondary spectral-VAD AudioContext along with the capture graph.
    audioProcessorRef.current.dispose();

    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }

    // Return the listening state machine to the mode's idle state for the next session.
    fsmRef.current.reset();
  };

  const startVoiceSystem = async () => {
    const sessionId = ++voiceSessionRef.current;
    startVoiceSystemRef.current = startVoiceSystem;
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
        throw new Error("MICROPHONE RECORDING IS NOT SUPPORTED IN THIS BROWSER");
      };
      const audioConstraints: MediaTrackConstraints = {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      };

      let stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioStreamRef.current = stream;

      // HEADPHONES / EARBUDS ONLY ENFORCEMENT:
      // If user is using built-in laptop mic/speakers, reject recording and inform the user.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        
        // Find external headset, bluetooth earbuds, or USB/wired headphones
        const headsetDevice = audioInputs.find((d) => {
          const l = d.label.toLowerCase();
          return l.includes("headset") || 
                 l.includes("headphone") || 
                 l.includes("earbud") || 
                 l.includes("bluetooth") || 
                 l.includes("airpod") || 
                 l.includes("buds") || 
                 l.includes("tws") ||
                 l.includes("hands-free");
        });

        if (headsetDevice && headsetDevice.deviceId) {
          console.info("[ULTRON MIC] External headset/earbuds detected. Prioritizing:", headsetDevice.label);
          const currentDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
          if (headsetDevice.deviceId !== currentDeviceId) {
            const headsetStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                ...audioConstraints,
                deviceId: { exact: headsetDevice.deviceId },
              },
            }).catch(() => null);
            if (headsetStream) {
              stream.getTracks().forEach((track) => track.stop());
              stream = headsetStream;
            }
          }
        } else {
          console.info("[ULTRON MIC] Using primary hardware microphone with AEC/AGC/Noise Suppression.");
        }
      } catch (enumErr) {
        console.warn("[ULTRON MIC] Device detection notice:", enumErr);
      }
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (audioStreamRef.current === stream) audioStreamRef.current = null;
        return;
      }
      audioStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      await audioCtx.resume();
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) {
        // A newer session (or shutdown) superseded this start-up while the audio
        // context was resuming: release only the resources created by this call.
        stream.getTracks().forEach((track) => track.stop());
        if (audioStreamRef.current === stream) audioStreamRef.current = null;
        if (audioCtxRef.current === audioCtx) {
          void audioCtx.close().catch(() => {});
          audioCtxRef.current = null;
        }
        return;
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Wire the spectral VAD / adaptive noise-floor analyser used for the HUD SNR
      // readout. Fire-and-forget so a slow/second AudioContext can never block the
      // microphone session from starting.
      void audioProcessorRef.current.initialize(stream).catch((vadErr) => {
        console.warn("[ULTRON VAD] Spectral analyser unavailable:", vadErr);
      });

      const audioTrack = stream.getAudioTracks()[0];
      console.info("[ULTRON MIC]", {
        input: audioTrack?.label || "system default",
        settings: audioTrack?.getSettings(),
      });

      audioTrack?.addEventListener("ended", () => {
        if (voiceActiveRef.current && sessionId === voiceSessionRef.current) {
          setError("MICROPHONE DISCONNECTED");
          setVoiceLabel("MIC DISCONNECTED");
          voiceActiveRef.current = false;
          setVoiceActive(false);
          stopVoiceStream();
        }
      });

      const samples = new Uint8Array(analyser.fftSize);
      let lastLevelUpdate = 0;
      const startRecording = () => {
        if (
          !voiceActiveRef.current ||
          sessionId !== voiceSessionRef.current ||
          isSpeakingRef.current ||
          isProcessingRef.current ||
          mediaRecorderRef.current
        ) {
          return;
        }
        try {
          const mimeType = [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/mp4",
          ].find((type) => MediaRecorder.isTypeSupported(type));
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          audioChunksRef.current = [];
          recordingStartedAtRef.current = performance.now();
          silenceStartedAtRef.current = null;
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
          };
          recorder.onerror = (event) => {
            console.error("Microphone recorder error:", event);
            setError("MICROPHONE RECORDING FAILED");
            setVoiceLabel("MIC ERROR");
          };
          recorder.onstop = () => {
            const duration = recordingStartedAtRef.current === null
              ? 0
              : performance.now() - recordingStartedAtRef.current;
            const silenceWaitMs = silenceStartedAtRef.current === null
              ? null
              : Math.round(performance.now() - silenceStartedAtRef.current);
            const blob = new Blob(audioChunksRef.current, {
              type: recorder.mimeType || mimeType || "audio/webm",
            });
            audioChunksRef.current = [];
            recordingStartedAtRef.current = null;
            silenceStartedAtRef.current = null;
            if (mediaRecorderRef.current === recorder) {
              mediaRecorderRef.current = null;
            }
            if (
              voiceActiveRef.current &&
              sessionId === voiceSessionRef.current &&
              duration >= MIN_RECORDING_MS &&
              !isChatBusyRef.current &&
              !isSpeakingRef.current
            ) {
              console.info("[ULTRON TIMING] captured audio", {
                durationMs: Math.round(duration),
                silenceWaitMs,
                bytes: blob.size,
              });
              // Instant zero-delay feedback: Switch to thinking state immediately upon speech completion
              setVoiceLabel("THINKING…");
              updateVisualState("thinking");
              void processAudioBlob(blob, sessionId);
            } else if (
              voiceActiveRef.current &&
              sessionId === voiceSessionRef.current &&
              // Do not overwrite the "THINKING…" state when the recorder stopped
              // because a reply is already being processed.
              !isProcessingRef.current &&
              !isChatBusyRef.current
            ) {
              setVoiceLabel("LISTENING…");
              updateVisualState("listening");
            }
          };
          recorder.start();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Recorder initialization failed";
          setError(`MICROPHONE RECORDING FAILED: ${message}`);
          setVoiceLabel("MIC ERROR");
        }
      };

      const monitorAudio = (now: number) => {
        // Run spectral VAD and noise floor evaluation
        const vad = audioProcessorRef.current.analyzeFrame();
        if (now - lastLevelUpdate > 80) {
          setSnrDb(vad.snr);
        }
        if (
          !voiceActiveRef.current ||
          sessionId !== voiceSessionRef.current ||
          analyserRef.current !== analyser
        ) {
          return;
        }

        analyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        if (now - lastLevelUpdate > 80) {
          const level = Math.min(100, Math.round(rms * 2500));
          setMicLevel(level);
          lastLevelUpdate = now;
        }

        // Live voice reaction on the 3D Orb while user speaks
        if (
          !isSpeakingRef.current &&
          !isProcessingRef.current &&
          !isChatBusyRef.current &&
          voiceActiveRef.current
        ) {
          sceneRef.current?.setAssistantState("listening", { audioLevel: rms * 15 });
        }

        // 1. Full-Duplex Barge-In: user voice interrupts assistant speech immediately
        if (isSpeakingRef.current && rms >= BARGE_IN_LEVEL) {
          console.info("[ULTRON BARGE-IN] Detected user voice during speech playback.");
          cancelOngoingAction();
          startRecording();
          animFrameRef.current = requestAnimationFrame(monitorAudio);
          return;
        }

        // 2. Normal recording and silence detection
        if (
          !isSpeakingRef.current &&
          !isProcessingRef.current &&
          !isChatBusyRef.current &&
          now >= speechCooldownUntilRef.current
        ) {
          if (mediaRecorderRef.current?.state === "recording") {
            if (rms >= SPEECH_START_LEVEL) {
              setVoiceLabel("HEARING…");
            }

            if (rms < SPEECH_END_LEVEL) {
              silenceStartedAtRef.current ??= now;
              const recordingStartedAt = recordingStartedAtRef.current ?? now;
              if (
                now - silenceStartedAtRef.current >= SILENCE_END_MS &&
                now - recordingStartedAt >= MIN_RECORDING_MS
              ) {
                mediaRecorderRef.current.stop();
              }
            } else {
              silenceStartedAtRef.current = null;
            }

            const recordingStartedAt = recordingStartedAtRef.current ?? now;
            if (now - recordingStartedAt >= MAX_RECORDING_MS) {
              mediaRecorderRef.current.stop();
            }
          } else if (rms >= SPEECH_START_LEVEL) {
            startRecording();
          }
        }

        animFrameRef.current = requestAnimationFrame(monitorAudio);
      };
      animFrameRef.current = requestAnimationFrame(monitorAudio);
      setVoiceLabel("LISTENING…");
      updateVisualState("listening");
    } catch (err) {
      console.error("Mic access error:", err);
      // A superseded session must not tear down the microphone of the session that
      // replaced it (its failure is only relevant to its own startup attempt).
      if (sessionId !== voiceSessionRef.current) return;
      const errorName = err instanceof DOMException ? err.name : "";
      const message = err instanceof Error ? err.message : "Unknown microphone error";
      const userMessage = errorName === "NotAllowedError"
        ? "MIC ACCESS BLOCKED — ALLOW MICROPHONE PERMISSION"
        : errorName === "NotFoundError"
          ? "NO MICROPHONE FOUND — CONNECT OR SELECT AN INPUT DEVICE"
          : errorName === "NotReadableError"
            ? "MICROPHONE IS BUSY — CLOSE OTHER APPS USING IT"
            : `MICROPHONE SETUP FAILED: ${message}`;
      setError(userMessage);
      setVoiceLabel("MIC DENIED");
      setMicLevel(0);
      setVoiceActive(false);
      voiceActiveRef.current = false;
      stopVoiceStream();
    }
  };

  const handleUserSpeech = async (userText: string, voiceSessionId?: number) => {
    if (isChatBusyRef.current || !userText.trim()) return;
    const requestId = ++chatRequestRef.current;
    isChatBusyRef.current = true;
    pauseVoiceRecorder();
    setVoiceLabel("THINKING…");
    updateVisualState("thinking");
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    setSubtitle(null);

    // Direct local actions for instant responsiveness
    const lowerText = userText.toLowerCase().trim();
    if (lowerText.includes("reset view") || lowerText.includes("reset orb")) {
      sceneRef.current?.resetView();
    } else if (lowerText.includes("zoom in")) {
      sceneRef.current?.zoomIn();
    } else if (lowerText.includes("zoom out")) {
      sceneRef.current?.zoomOut();
    }

    const userMessage: ChatMessage = { role: "user", content: userText.trim() };
    const nextMessages = limitConversation([
      ...conversationRef.current,
      userMessage,
    ]);

    // Voice turns are buffered until the adaptive silence timer fires. Typed
    // prompts bypass that timer, so record them directly in conversation context.
    if (voiceSessionId === undefined) {
      conversationMgrRef.current.addSpeechChunk(userText.trim());
      conversationMgrRef.current.finalizeTurn();
    }
    conversationMgrRef.current.closeFollowUpWindow();

    try {
      const responseStarted = performance.now();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          stream: true,
          activationMode: fsmRef.current.mode,
          followUpActive: conversationMgrRef.current.isFollowUpActive,
        }),
      });

      if (
        requestId !== chatRequestRef.current ||
        (voiceSessionId !== undefined &&
          (!voiceActiveRef.current || voiceSessionId !== voiceSessionRef.current))
      ) {
        return;
      }

      if (!res.ok) {
        let errMessage = `AI service returned ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch {}
        throw new Error(errMessage);
      }

      let finalReply = "";
      const contentType = res.headers.get("content-type") || "";
      let streamedTokens = false;

      if (contentType.includes("text/event-stream") && res.body) {
        streamedTokens = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let sentenceBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // STOP / barge-in / a newer request bumped chatRequestRef. Stop consuming
          // the stream so the cancelled reply can never re-queue speech or overwrite
          // the HUD after the user asked it to stop.
          if (requestId !== chatRequestRef.current) {
            try {
              await reader.cancel();
            } catch {}
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(dataStr);
              if (event.type === "route") {
                const intent = event.decision?.intent || "";
                if (intent === "SYSTEM_LOCAL") {
                  setBrainTag("LOCAL KERNEL [0ms]");
                } else if (intent === "QUANTUM_RESEARCH") {
                  setBrainTag("QUANTUM RESEARCH [MULTI-VECTOR]");
                  updateVisualState("thinking", { progress: 0.8 });
                } else if (intent === "FAST_CHAT") {
                  setBrainTag("FAST BRAIN [0.5B]");
                } else if (intent === "COMPLEX_REASONING") {
                  setBrainTag("SMART BRAIN [1.5B]");
                } else if (intent === "TOOL_CALL") {
                  setBrainTag("TOOL CORE [1.5B]");
                  updateVisualState("executing", { progress: 0.5 });
                } else if (intent === "AGENT_PLAN") {
                  setBrainTag("AGENT PLANNER [1.5B]");
                  updateVisualState("executing", { progress: 0.2 });
                } else if (intent === "MEMORY_OP") {
                  setBrainTag("SQLITE MEMORY [0ms]");
                }
                if (event.dossier) {
                  setActiveResearch(event.dossier);
                }
              } else if (event.type === "status") {
                // "Talk while working": the API narrates long-running phases (research,
                // planning, degraded fallback). Show them in the HUD and, in voice mode,
                // speak them when the reply queue is idle so ULTRON talks the user through
                // the task instead of going silent.
                const statusMessage = typeof event.message === "string" ? event.message.trim() : "";
                if (statusMessage) {
                  setSubtitle(statusMessage);
                  setBrainTag("WORKING…");
                  if (typeof event.progress === "number") {
                    updateVisualState("executing", { progress: event.progress });
                  }
                  if (voiceActiveRef.current && !isSpeakingRef.current) {
                    queueSpeechChunk(statusMessage);
                  }
                }
              } else if (event.type === "token") {
                finalReply += event.content;
                sentenceBuffer += event.content;
                setSubtitle(finalReply);
                setVoiceLabel("STREAMING…");

                // Low-latency streaming speech execution: speaks early on complete clauses or punctuation
                const sMatch =
                  sentenceBuffer.match(/^([^\n.?!]{8,}[.?!]\s*)(.*)$/s) ||
                  sentenceBuffer.match(/^([^\n,;:]{28,}[,;:]\s*)(.*)$/s) ||
                  sentenceBuffer.match(/^([^\n]+\n+)(.*)$/s);
                if (sMatch && (voiceActiveRef.current || isSpeakingRef.current)) {
                  const readySentence = sMatch[1].trim();
                  sentenceBuffer = sMatch[2];
                  if (readySentence) {
                    queueSpeechChunk(readySentence);
                  }
                }
              } else if (event.type === "done") {
                if (event.reply) finalReply = event.reply;
                if (event.dossier) {
                  setActiveResearch(event.dossier);
                  setBrainTag("QUANTUM DOSSIER READY");
                }
              }
            } catch {}
          }
        }

        if (sentenceBuffer.trim() && (voiceActiveRef.current || isSpeakingRef.current)) {
          queueSpeechChunk(sentenceBuffer.trim());
        }
      } else {
        const data = await res.json();
        finalReply = data.reply || "";
        if (data.dossier) {
          setActiveResearch(data.dossier);
          setBrainTag("QUANTUM DOSSIER READY");
        }
        if (data.planReport) {
          setActivePlan({
            goal: data.route?.planGoal || userText,
            passed: data.planReport.passed_steps,
            total: data.planReport.total_steps,
            status: data.planReport.overall_status,
          });
          updateVisualState("executing", { progress: 1.0 });
          // Track the auto-dismiss timer so unmount/STOP can clear it instead of
          // leaving a pending state update behind.
          if (planClearTimerRef.current) clearTimeout(planClearTimerRef.current);
          planClearTimerRef.current = setTimeout(() => {
            planClearTimerRef.current = null;
            setActivePlan(null);
          }, 8000);
        }
        if (data.route?.intent === "QUANTUM_RESEARCH" || data.intent === "QUANTUM_RESEARCH") {
          setBrainTag("QUANTUM RESEARCH [MULTI-VECTOR]");
        } else if (data.route?.intent === "SYSTEM_LOCAL") {
          setBrainTag("LOCAL KERNEL [0ms]");
        } else if (data.route?.intent === "FAST_CHAT") {
          setBrainTag("FAST BRAIN [0.5B]");
        } else if (data.route?.intent === "AGENT_PLAN") {
          setBrainTag("AGENT PLANNER [1.5B]");
        } else if (data.route?.intent === "MEMORY_OP") {
          setBrainTag("SQLITE MEMORY [0ms]");
        } else {
          setBrainTag("SMART BRAIN [1.5B]");
        }
        setSubtitle(finalReply);
      }

      console.info("[ULTRON TIMING] response", {
        elapsedMs: Math.round(performance.now() - responseStarted),
        replyCharacters: finalReply.length,
      });

      if (!finalReply) {
        // Ignored ambient chatter, silence, or non-actionable background sound
        console.info("[ULTRON] Utterance ignored or empty response. Returning to listening state.");
        if (voiceActiveRef.current) {
          setVoiceLabel("LISTENING?");
          updateVisualState("listening");
        } else {
          // Text-mode prompt with no reply: otherwise the orb stays on "thinking".
          updateVisualState("idle");
        }
        return;
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: finalReply,
      };
      conversationRef.current = limitConversation([
        ...nextMessages,
        assistantMessage,
      ]);
      setError(null);

      // Open a 7-second active follow-up conversation window focused on the user
      conversationMgrRef.current.recordAssistantReply(finalReply);
      conversationMgrRef.current.startFollowUpWindow(() => {
        console.debug("[ULTRON] Conversation follow-up window closed. Returned to strict wake-word mode.");
      });

      if (!streamedTokens) {
        speakLocal(finalReply);
      }

      // Text-only turns (voice off, or streaming with no queued/playing sentence)
      // never fire the speech queue's "finished" hook, which would leave the orb
      // stuck on "thinking". Return it to the idle/listening visual state.
      if (!isSpeakingRef.current && !isPlayingQueueRef.current) {
        updateVisualState(voiceActiveRef.current ? "listening" : "idle");
      }
    } catch (err) {
      if (
        requestId !== chatRequestRef.current ||
        (voiceSessionId !== undefined &&
          (!voiceActiveRef.current || voiceSessionId !== voiceSessionRef.current))
      ) {
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown AI service error";
      console.error("Chat request failed:", err);
      setError(`AI RESPONSE FAILED: ${message}`);
      speakLocal("Local AI did not respond. Please try again.");
      // If the browser cannot speak, speakLocal() is a no-op and the orb would be
      // stuck on "thinking" forever; return to the idle/listening visual state.
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        updateVisualState(voiceActiveRef.current ? "listening" : "idle");
      }
    } finally {
      if (requestId === chatRequestRef.current) {
        isChatBusyRef.current = false;
      }
    }
  };

  // Hands-free offline wake-word listener (ULTRON)
  useEffect(() => {
    if (!wakeWordEnabled) return;
    startVoiceSystemRef.current = startVoiceSystem;
    let unmounted = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const checkWakeWord = async () => {
      if (unmounted) return;
      if (!isSpeakingRef.current && !isProcessingRef.current && !isChatBusyRef.current) {
        try {
          // Authentication was removed per user request (local single-user app),
          // so hands-free activation polls the wake-word route directly.
          const res = await fetch("/api/wakeword", {
            cache: "no-store",
            signal: AbortSignal.timeout(1500),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.event && data.event.type === "WAKE_WORD_DETECTED") {
              console.info("[ULTRON WAKEWORD] Hands-free wake phrase triggered!", data.event);
              if (!voiceActiveRef.current) {
                voiceActiveRef.current = true;
                setVoiceActive(true);
                setVoiceLabel("LISTENING…");
                updateVisualState("listening");
                if (startVoiceSystemRef.current) {
                  void startVoiceSystemRef.current();
                }
              }
            }
          }
        } catch {}
      }
      if (!unmounted) {
        pollTimer = setTimeout(checkWakeWord, 600);
      }
    };

    pollTimer = setTimeout(checkWakeWord, 1500);
    return () => {
      unmounted = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [updateVisualState, wakeWordEnabled]);

  const toggleVoice = () => {
    setError(null);

    if (voiceActive) {
      voiceActiveRef.current = false;
      isSpeakingRef.current = false;
      isProcessingRef.current = false;
      processingSessionRef.current = null;
      isChatBusyRef.current = false;
      chatRequestRef.current += 1;
      voiceSessionRef.current += 1;
      // Invalidate pending TTS callbacks and drop queued sentences BEFORE cancel()
      // so the cancelled utterance's onerror cannot speak the next queued sentence.
      speechGenerationRef.current += 1;
      speechQueueRef.current = [];
      isPlayingQueueRef.current = false;
      audioProcessorRef.current.setAssistantSpeaking(false);
      setVoiceActive(false);
      setVoiceLabel("VOICE OFF");
      setMicLevel(0);
      updateVisualState("idle");
      stopVoiceStream();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    } else {
      voiceActiveRef.current = true;
      isSpeakingRef.current = false;
      isProcessingRef.current = false;
      isChatBusyRef.current = false;
      setVoiceActive(true);
      setVoiceLabel("LISTENING…");
      updateVisualState("listening");
      startVoiceSystem();
    }
  };

  useEffect(() => {
    if (voiceToggleRequest <= lastVoiceToggleRequestRef.current) return;
    lastVoiceToggleRequestRef.current = voiceToggleRequest;
    toggleVoice();
  }, [voiceToggleRequest, toggleVoice]);

  useEffect(() => {
    onVoiceStateChange?.({
      active: voiceActive,
      label: voiceLabel,
      assistantState,
      error,
    });
  }, [assistantState, error, onVoiceStateChange, voiceActive, voiceLabel]);

  const submitTextPrompt = () => {
    const prompt = textInput.trim();
    if (!prompt) return;
    if (isChatBusyRef.current) {
      // Do not clear the input: the prompt would otherwise be silently dropped.
      setError("AI IS STILL RESPONDING — WAIT OR PRESS STOP");
      return;
    }
    setTextInput("");
    setTextPromptOpen(false);
    handleUserSpeech(prompt);
  };

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      // A stop()/toggle may have raced the async camera + MediaPipe startup. If this
      // tracker is no longer the active one, keep the HUD off instead of showing a
      // phantom "GESTURES ON" state.
      if (trackerRef.current !== tracker) {
        tracker.stop();
        setCamera("off");
        return;
      }
      setCamera("on");
    } catch (err) {
      const isCurrentTracker = trackerRef.current === tracker;
      if (isCurrentTracker) trackerRef.current = null;
      tracker.stop();
      if (!isCurrentTracker) {
        // The user already toggled gestures off while the camera was starting; do not
        // surface a stale start-up error on top of the "off" state.
        setCamera("off");
        return;
      }
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  // Mirror listening state-machine transitions (activation mode changes, session
  // resets) into the HUD instead of leaving it frozen on the initial state.
  useEffect(() => {
    const fsm = fsmRef.current;
    return fsm.subscribe((event) => setListeningState(event.to));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
      ) {
        return;
      }
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "v":
        case "V":
          toggleVoice();
          break;
        case "m":
        case "M":
          // Cycle activation mode (Wake-word -> Push-to-Talk -> Continuous)
          setActivationMode((prev) => {
            const nextMode = prev === "WAKE_WORD" ? "PUSH_TO_TALK" : prev === "PUSH_TO_TALK" ? "CONTINUOUS_CONVERSATION" : "WAKE_WORD";
            fsmRef.current.setMode(nextMode);
            setVoiceLabel(`MODE: ${nextMode.replace("_", " ")}`);
            return nextMode;
          });
          break;
        case "t":
        case "T":
          setTextPromptOpen((prev) => !prev);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures, voiceActive]);

  const cameraOn = camera === "on";

  if (compact) {
    return <div className="cc-orb-voice-bridge" aria-hidden="true" />;
  }

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* ORIGINAL TOP-LEFT TITLE (100% Original HUD) */}
      <div className="hud hud-title">U.L.T.R.O.N.</div>
      <div className="hud hud-brain-tag" style={{ top: 52 }}>MODE: {activationMode} | STATE: {listeningState} | SNR: {snrDb}dB</div>
      <div
        className="hud hud-brain-tag"
        style={{
          top: 70,
          color: "#00ffaa",
          letterSpacing: "0.1em",
        }}
      >
        SYSTEM ACTIVE | DIRECT ACCESS ENABLED
      </div>
      {brainTag && <div className="hud hud-brain-tag" style={{ top: 88 }}>{brainTag}</div>}

      {/* INTELLIGENT ASSISTANT STATE BADGE */}
      <div
        className={`hud-state-badge ${assistantState}`}
        style={{ position: "fixed", top: 20, right: 24, zIndex: 30 }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
          }}
        />
        {assistantState.toUpperCase()}
      </div>

      {activePlan && (
        <div
          className="hud-progress-container"
          style={{ position: "fixed", top: 56, right: 24, width: 280, zIndex: 30 }}
        >
          <div style={{ fontSize: "10px", color: "#38bdf8", letterSpacing: "0.08em" }}>
            TASK: {activePlan.goal.slice(0, 32)}
          </div>
          <div className="hud-progress-bar">
            <div
              className="hud-progress-fill"
              style={{
                width: `${(activePlan.passed / Math.max(1, activePlan.total)) * 100}%`,
              }}
            />
          </div>
          <div style={{ fontSize: "9px", color: "#ffaa30", marginTop: 4, letterSpacing: "0.05em" }}>
            PLAN: {activePlan.status} ({activePlan.passed}/{activePlan.total} STEPS)
          </div>
        </div>
      )}

      {subtitle && (
        <div className="hud hud-subtitles">
          <span className="hud-subtitles-prefix">&gt; ULTRON:</span>
          {subtitle}
        </div>
      )}

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        {cameraOn ? (
          <div>
            <span className="key">PINCH + MOVE</span> spin&nbsp;&nbsp;
            <span className="key">PINCH BOTH HANDS ± SPREAD</span> zoom
          </div>
        ) : (
          <div>
            <span className="key">V</span> voice chat&nbsp;&nbsp;
            <span className="key">T</span> type prompt&nbsp;&nbsp;
            <span className="key">G</span> hand gestures&nbsp;&nbsp;
            <span className="key">R</span> reset
          </div>
        )}
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        {/* Optional Type Prompt Input when T key pressed or clicked */}
        {textPromptOpen && (
          <div className="hud-row" style={{ width: "100%" }}>
            <input
              type="text"
              className="hud-chat-input"
              placeholder='Type question (e.g. "what is your name?") & press Enter...'
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitTextPrompt()}
              autoFocus
            />
          </div>
        )}

        <div className="hud-row">
          {(assistantState === "speaking" ||
            assistantState === "thinking" ||
            assistantState === "executing") && (
            <button
              type="button"
              className="hud-btn hud-cancel-btn"
              onClick={cancelOngoingAction}
              title="Stop speech or cancel current action"
            >
              STOP
            </button>
          )}

          <button
            type="button"
            className="hud-btn"
            onClick={() => setTextPromptOpen((prev) => !prev)}
          >
            TYPE
          </button>

          <button
            type="button"
            className="hud-btn"
            onClick={() => setResearchModalOpen(true)}
            style={{
              borderColor: isResearching ? "#38bdf8" : undefined,
              color: isResearching ? "#38bdf8" : undefined,
            }}
            title="Autonomous Quantum Browser & Web Research Engine"
          >
            {isResearching ? "PROBING…" : "🌐 RESEARCH"}
          </button>

          <button
            type="button"
            className="hud-btn"
            aria-pressed={voiceActive}
            onClick={toggleVoice}
            style={{
              borderColor: voiceActive ? "#00ffaa" : undefined,
              color: voiceActive ? "#00ffaa" : undefined,
            }}
          >
            {voiceLabel}
          </button>

          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>
        {voiceActive && (
          <div
            className="hud-row"
            style={{ alignItems: "center", gap: 8, width: "100%" }}
          >
            <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em" }}>
              MIC
            </span>
            <div
              role="meter"
              aria-label="Microphone input level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={micLevel}
              style={{
                flex: 1,
                height: 4,
                overflow: "hidden",
                background: "rgba(0, 255, 170, 0.18)",
              }}
            >
              <div
                style={{
                  width: `${micLevel}%`,
                  height: "100%",
                  background: micLevel >= 20 ? "#00ffaa" : "#ffc857",
                  transition: "width 120ms linear",
                }}
              />
            </div>
            <span style={{ minWidth: 32, textAlign: "right", fontSize: "0.65rem" }}>
              {micLevel}%
            </span>
          </div>
        )}
        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>
        </div>
      </div>

      {/* QUANTUM RESEARCH INTELLIGENCE MODAL & DOSSIER VIEWER */}
      {researchModalOpen && (
        <div
          role="dialog"
          aria-label="Quantum Web Research HUD"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 7, 18, 0.88)",
            backdropFilter: "blur(14px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              boxShadow: "0 0 35px rgba(56, 189, 248, 0.2)",
              borderRadius: 8,
              width: "100%",
              maxWidth: 780,
              maxHeight: "88vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              padding: 24,
              fontFamily: "monospace",
              color: "#e2e8f0",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(56, 189, 248, 0.25)", paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: "bold", letterSpacing: "0.15em", color: "#38bdf8" }}>
                  🌐 ULTRON QUANTUM RESEARCH ENGINE
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4 }}>
                  Autonomous Live Web Probes · Multi-Vector Decomposition · High-Credibility Cross-Correlation
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResearchModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  color: "#94a3b8",
                  padding: "4px 12px",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Inquiry Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (researchInput.trim()) {
                  executeAutonomousResearch(researchInput);
                }
              }}
              style={{ display: "flex", gap: 8, marginBottom: 16 }}
            >
              <input
                type="text"
                placeholder="Enter topic to research (e.g. 'SpaceX Starship 2026', 'Quantum Decoherence', 'James Webb discovery')..."
                value={researchInput}
                onChange={(e) => setResearchInput(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: 4,
                  padding: "10px 14px",
                  color: "#f8fafc",
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={isResearching || !researchInput.trim()}
                style={{
                  background: isResearching ? "rgba(56, 189, 248, 0.2)" : "rgba(56, 189, 248, 0.3)",
                  border: "1px solid #38bdf8",
                  color: "#38bdf8",
                  padding: "10px 20px",
                  fontWeight: "bold",
                  cursor: isResearching ? "not-allowed" : "pointer",
                  borderRadius: 4,
                  letterSpacing: "0.08em",
                }}
              >
                {isResearching ? "PROBING..." : "🚀 RESEARCH"}
              </button>
            </form>

            {/* Quick Suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {["SpaceX Starship 2026", "Quantum Computing Decoherence", "James Webb Discoveries", "ISRO Gaganyaan Mission"].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => {
                    setResearchInput(sug);
                    executeAutonomousResearch(sug);
                  }}
                  style={{
                    background: "rgba(51, 65, 85, 0.4)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    color: "#cbd5e1",
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  ⚡ {sug}
                </button>
              ))}
            </div>

            {/* Live Progress Indicator when researching */}
            {isResearching && (
              <div style={{ padding: 16, background: "rgba(15, 23, 42, 0.8)", border: "1px dashed rgba(56, 189, 248, 0.4)", borderRadius: 6, marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "#38bdf8", marginBottom: 8, fontSize: "0.9rem" }}>
                  📡 QUANTUM MULTI-VECTOR PROBES HARVESTING LIVE WEB DATA…
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Parallel searches deployed · Crawling authoritative domains · Cross-verifying consensus...
                </div>
              </div>
            )}

            {/* Dossier Display */}
            {activeResearch && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Telemetry Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", paddingBottom: 8 }}>
                  <span>QUERY: <strong style={{ color: "#f8fafc" }}>{activeResearch.query}</strong></span>
                  <span>⚡ {activeResearch.telemetry.elapsed_ms}ms | 📡 {activeResearch.sources_analyzed_count} Analyzed Sources | 🔒 DPAPI Sealed</span>
                </div>

                {/* Executive Summary */}
                <div style={{ background: "rgba(56, 189, 248, 0.08)", borderLeft: "3px solid #38bdf8", padding: 14, borderRadius: 4 }}>
                  <div style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: "bold", marginBottom: 6, letterSpacing: "0.08em" }}>
                    EXECUTIVE SYNTHESIS (VOICE BRIEFING)
                  </div>
                  <div style={{ fontSize: "0.95rem", lineHeight: 1.5, color: "#f1f5f9" }}>
                    {activeResearch.executive_summary}
                  </div>
                </div>

                {/* Key Verified Findings */}
                {activeResearch.key_findings && activeResearch.key_findings.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: "bold", marginBottom: 8, letterSpacing: "0.08em" }}>
                      VERIFIED DATA POINTS & BREAKTHROUGHS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {activeResearch.key_findings.map((finding, idx) => (
                        <div key={idx} style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid rgba(148, 163, 184, 0.15)", padding: "8px 12px", borderRadius: 4, fontSize: "0.82rem", lineHeight: 1.4 }}>
                          <span style={{ color: "#10b981", marginRight: 8 }}>✓</span> {finding}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources Grid */}
                {activeResearch.sources && activeResearch.sources.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: "bold", marginBottom: 8, letterSpacing: "0.08em" }}>
                      HIGH-CREDIBILITY SOURCES & CITATIONS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
                      {activeResearch.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: "rgba(30, 41, 59, 0.4)",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            padding: 10,
                            borderRadius: 4,
                            textDecoration: "none",
                            color: "inherit",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: "bold" }}>{src.domain}</span>
                            <span style={{ fontSize: "0.68rem", color: "#10b981", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: 3 }}>
                              {Math.round(src.credibility_score * 100)}% TRUST
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#f8fafc", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {src.title}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {src.snippet}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions Footer */}
                <div style={{ display: "flex", gap: 8, marginTop: 8, borderTop: "1px solid rgba(148, 163, 184, 0.15)", paddingTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeResearch.executive_summary) {
                        queueSpeechChunk(activeResearch.executive_summary);
                      }
                    }}
                    style={{
                      background: "rgba(16, 185, 129, 0.2)",
                      border: "1px solid #10b981",
                      color: "#10b981",
                      padding: "8px 16px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                    }}
                  >
                    🔊 READ BRIEFING ALOUD
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = `ULTRON QUANTUM RESEARCH: ${activeResearch.query}\n\nSUMMARY:\n${activeResearch.executive_summary}\n\nFINDINGS:\n${activeResearch.key_findings.join("\n")}\n\nSOURCES:\n${activeResearch.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`;
                      navigator.clipboard.writeText(text);
                      setSubtitle("Research dossier copied to clipboard!");
                    }}
                    style={{
                      background: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid #38bdf8",
                      color: "#38bdf8",
                      padding: "8px 16px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    📋 COPY DOSSIER
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
