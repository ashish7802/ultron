"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi, type AssistantVisualState } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";
type ChatMessage = { role: "user" | "assistant"; content: string };

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

const SPEECH_START_LEVEL = 0.008;
const SPEECH_END_LEVEL = 0.009;
const BARGE_IN_LEVEL = 0.013;
const SILENCE_END_MS = 500;
const MAX_RECORDING_MS = 8_000;
const MIN_RECORDING_MS = 350;
const MAX_CONVERSATION_MESSAGES = 20;
const MAX_CONVERSATION_CHARACTERS = 12_000;

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function JarvisOrb() {
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
  const [voiceLabel, setVoiceLabel] = useState<string>("VOICE OFF");
  const [micLevel, setMicLevel] = useState(0);
  const [textPromptOpen, setTextPromptOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [brainTag, setBrainTag] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => {
      voiceActiveRef.current = false;
      voiceSessionRef.current += 1;
      stopVoiceStream();
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const updateVisualState = useCallback(
    (st: AssistantVisualState, data?: { audioLevel?: number; progress?: number }) => {
      setAssistantState(st);
      sceneRef.current?.setAssistantState(st, data);
    },
    [],
  );

  const cancelOngoingAction = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speechQueueRef.current = [];
    isPlayingQueueRef.current = false;
    isSpeakingRef.current = false;
    isChatBusyRef.current = false;
    chatRequestRef.current += 1;
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
      speechCooldownUntilRef.current = performance.now() + 500;
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
    pauseVoiceRecorder();
    updateVisualState("speaking", { audioLevel: 0.65 });
    setVoiceLabel("SPEAKING…");

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.includes("en-IN") || v.lang.includes("en-US") || v.lang.includes("hi"),
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      playNextSentence();
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") {
        console.warn("Speech playback error:", e.error);
      }
      playNextSentence();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      playNextSentence();
    }
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
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      speechQueueRef.current = [];
      isPlayingQueueRef.current = false;
      queueSpeechChunk(text);
    },
    [queueSpeechChunk],
  );

  const processAudioBlob = async (blob: Blob, sessionId: number) => {
    if (
      !voiceActiveRef.current ||
      sessionId !== voiceSessionRef.current ||
      isSpeakingRef.current ||
      isProcessingRef.current ||
      blob.size < 500
    ) {
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
        return;
      }

      console.info("[ULTRON STT]", transcript);
      setVoiceLabel(`HEARD: "${transcript.slice(0, 18)}…"`);
      setError(null);
      await handleUserSpeech(transcript, sessionId);
    } catch (err) {
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown transcription error";
      console.error("STT process error:", err);
      setError(`TRANSCRIPTION FAILED: ${message}`);
      setVoiceLabel("LISTENING…");
    } finally {
      if (processingSessionRef.current === sessionId) {
        processingSessionRef.current = null;
        isProcessingRef.current = false;
      }
      if (
        voiceActiveRef.current &&
        sessionId === voiceSessionRef.current &&
        !isSpeakingRef.current
      ) {
        setVoiceLabel("LISTENING…");
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
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordingStartedAtRef.current = null;
    silenceStartedAtRef.current = null;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
  };

  const startVoiceSystem = async () => {
    const sessionId = ++voiceSessionRef.current;
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

      const devices = await navigator.mediaDevices.enumerateDevices();
      const realMic = devices.find(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId &&
          !device.label.toLowerCase().includes("voice changer") &&
          !device.label.toLowerCase().includes("virtual") &&
          (device.label.toLowerCase().includes("intel") ||
            device.label.toLowerCase().includes("realtek") ||
            device.label.toLowerCase().includes("array") ||
            device.label.toLowerCase().includes("headset") ||
            device.label.toLowerCase().includes("microphone")),
      );
      const currentDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (realMic && realMic.deviceId !== currentDeviceId) {
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...audioConstraints,
            deviceId: { exact: realMic.deviceId },
          },
        });
        audioStreamRef.current = stream;
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
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

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
              duration >= MIN_RECORDING_MS &&
              !isChatBusyRef.current &&
              !isSpeakingRef.current
            ) {
              console.info("[ULTRON TIMING] captured audio", {
                durationMs: Math.round(duration),
                silenceWaitMs,
                bytes: blob.size,
              });
              void processAudioBlob(blob, sessionId);
            } else if (voiceActiveRef.current) {
              setVoiceLabel("LISTENING…");
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
        if (now - lastLevelUpdate > 250) {
          const level = Math.min(100, Math.round(rms * 2500));
          setMicLevel(level);
          console.debug("[ULTRON MIC LEVEL]", level);
          lastLevelUpdate = now;
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
    } catch (err) {
      console.error("Mic access error:", err);
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

    try {
      const responseStarted = performance.now();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, stream: true }),
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
              } else if (event.type === "token") {
                finalReply += event.content;
                sentenceBuffer += event.content;
                setSubtitle(finalReply);
                setVoiceLabel("STREAMING…");

                // Sentence-by-sentence streaming speech execution
                const sMatch =
                  sentenceBuffer.match(/^([^\n.?!]+[.?!]\s*)(.*)$/s) ||
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
        if (data.planReport) {
          setActivePlan({
            goal: data.route?.planGoal || userText,
            passed: data.planReport.passed_steps,
            total: data.planReport.total_steps,
            status: data.planReport.overall_status,
          });
          updateVisualState("executing", { progress: 1.0 });
          setTimeout(() => setActivePlan(null), 8000);
        }
        if (data.route?.intent === "SYSTEM_LOCAL") {
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
        throw new Error("AI service returned an empty reply");
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
      if (!streamedTokens) {
        speakLocal(finalReply);
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
    } finally {
      if (requestId === chatRequestRef.current) {
        isChatBusyRef.current = false;
      }
    }
  };

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
      setVoiceActive(false);
      setVoiceLabel("VOICE OFF");
      setMicLevel(0);
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
      startVoiceSystem();
    }
  };

  const submitTextPrompt = () => {
    if (!textInput.trim()) return;
    const prompt = textInput.trim();
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
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
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

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* ORIGINAL TOP-LEFT TITLE (100% Original HUD) */}
      <div className="hud hud-title">U.L.T.R.O.N.</div>
      {brainTag && <div className="hud hud-brain-tag">{brainTag}</div>}

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
    </>
  );
}
