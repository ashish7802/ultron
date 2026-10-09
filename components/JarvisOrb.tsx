"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
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
const SPEECH_END_LEVEL = 0.005;
const SILENCE_END_MS = 750;
const MAX_RECORDING_MS = 12_000;
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

  // Voice & Chat State
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState<string>("VOICE OFF");
  const [textPromptOpen, setTextPromptOpen] = useState(false);
  const [textInput, setTextInput] = useState("");

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

  const speakLocal = (text: string) => {
    console.info("[ULTRON TTS]", text);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("SPEECH PLAYBACK IS NOT AVAILABLE IN THIS BROWSER");
      setVoiceLabel("VOICE OFF");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (voice) =>
        voice.lang.includes("en-IN") ||
        voice.lang.includes("en-US") ||
        voice.lang.includes("hi"),
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    let handled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const finishSpeech = () => {
      if (handled) return;
      handled = true;
      if (watchdog) clearTimeout(watchdog);
      isSpeakingRef.current = false;
      speechCooldownUntilRef.current = performance.now() + 500;
      if (voiceActiveRef.current) {
        setVoiceLabel("LISTENING…");
      } else {
        setVoiceLabel("VOICE OFF");
      }
    };

    utterance.onend = finishSpeech;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setError(`SPEECH PLAYBACK FAILED: ${event.error}`);
      }
      finishSpeech();
    };

    isSpeakingRef.current = true;
    pauseVoiceRecorder();
    setVoiceLabel("SPEAKING…");

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("SpeechSynthesis error:", err);
      setError("SPEECH PLAYBACK COULD NOT START");
      finishSpeech();
      return;
    }

    watchdog = setTimeout(() => {
      if (!handled) {
        window.speechSynthesis.cancel();
        setError("SPEECH PLAYBACK TIMED OUT");
        finishSpeech();
      }
    }, Math.min(120_000, Math.max(15_000, text.length * 250)));
  };

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
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data: { text?: string; error?: string } = await res.json();
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!voiceActiveRef.current || sessionId !== voiceSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
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
        if (now - lastLevelUpdate > 1_000) {
          console.debug("[ULTRON MIC LEVEL]", Math.round(rms * 2500));
          lastLevelUpdate = now;
        }

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
    const userMessage: ChatMessage = { role: "user", content: userText.trim() };
    const nextMessages = limitConversation([
      ...conversationRef.current,
      userMessage,
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data: { reply?: string; error?: string } = await res.json();
      if (
        requestId !== chatRequestRef.current ||
        (voiceSessionId !== undefined &&
          (!voiceActiveRef.current || voiceSessionId !== voiceSessionRef.current))
      ) {
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || `AI service returned ${res.status}`);
      }
      if (data.reply) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply,
        };
        conversationRef.current = limitConversation([
          ...nextMessages,
          assistantMessage,
        ]);
        setError(null);
        speakLocal(data.reply);
      } else {
        throw new Error("AI service returned an empty reply");
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
