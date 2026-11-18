/**
 * @file components/views/VoiceView.tsx
 * @description Truthful Voice Interface View (Microphone Permissions, Recording, Live STT & TTS Controls).
 *
 * Subsystem:
 * Interface Area C — Voice Interface.
 *
 * Key Responsibilities:
 * - Queries actual browser microphone permission status via `navigator.permissions` and `mediaDevices`.
 * - Never simulates microphone access, audio levels, or transcription; surfaces explicit errors
 *   when hardware or browser APIs are unavailable.
 * - Captures real audio via `MediaRecorder` and submits to `/api/transcribe` (local Faster-Whisper),
 *   with live Web Speech API interim captions where natively supported by the browser.
 * - Drives real Web Audio `AnalyserNode` voice activity meter while recording.
 * - Provides speech output (TTS) playback controls via `/api/tts` + Web Speech synthesis,
 *   including immediate Stop/Interrupt (`DELETE /api/tts` + `speechSynthesis.cancel()`).
 * - Syncs listening mode with `/api/wakeword`.
 *
 * Architectural Role & Interactions:
 * - Can forward verified transcripts directly into `ChatView` via `onSendTranscript`.
 *
 * Safety / Security Guarantees:
 * - Local-first audio processing; authenticated via `ultronFetch` desktop session cookie.
 * - All media tracks and audio contexts are cleanly torn down on stop or unmount.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ToastNotice, UltronSettings } from "@/components/workspace/types";
import { ultronFetch, ultronJson } from "@/components/workspace/apiClient";

interface VoiceViewProps {
  settings: UltronSettings | null;
  onSendTranscript: (transcript: string) => void;
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

type MicPermissionState = "checking" | "granted" | "prompt" | "denied" | "unsupported";

export default function VoiceView({ settings, onSendTranscript, onNotify }: VoiceViewProps) {
  const [micPermission, setMicPermission] = useState<MicPermissionState>("checking");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveSpeechSupported, setLiveSpeechSupported] = useState(false);

  // TTS controls
  const [ttsText, setTtsText] = useState("ULTRON voice subsystem ready for local speech verification.");
  const [speechRate, setSpeechRate] = useState(settings?.voice.speechRate ?? 1.0);
  const [speechVolume, setSpeechVolume] = useState(settings?.voice.speechVolume ?? 90);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<string | null>(null);

  // Wakeword mode synced with /api/wakeword
  const [wakeMode, setWakeMode] = useState<"PUSH_TO_TALK" | "WAKE_WORD" | "CONTINUOUS_CONVERSATION">(
    "PUSH_TO_TALK",
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speechRecognitionRef = useRef<{ stop?: () => void } | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Inspect real microphone & speech API support on mount
  useEffect(() => {
    let active = true;
    const hasMediaDevices =
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");

    const SpeechRecCtor =
      typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        : null;
    setLiveSpeechSupported(Boolean(SpeechRecCtor));

    if (!hasMediaDevices) {
      setMicPermission("unsupported");
      return;
    }

    (async () => {
      try {
        if (navigator.permissions && typeof navigator.permissions.query === "function") {
          const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (active) {
            setMicPermission(perm.state as MicPermissionState);
            perm.onchange = () => {
              if (active) setMicPermission(perm.state as MicPermissionState);
            };
          }
        } else if (active) {
          setMicPermission("prompt");
        }
      } catch {
        if (active) setMicPermission("prompt");
      }
    })();

    // Fetch current wakeword mode from backend
    (async () => {
      const res = await ultronJson<{ mode?: "PUSH_TO_TALK" | "WAKE_WORD" | "CONTINUOUS_CONVERSATION" }>(
        "/api/wakeword",
      );
      if (active && res.ok && res.data?.mode) {
        setWakeMode(res.data.mode);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const cleanupRecordingResources = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (speechRecognitionRef.current?.stop) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupRecordingResources]);

  const startRecording = async () => {
    setVoiceError(null);
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setMicPermission("unsupported");
      setVoiceError("Microphone capture is unavailable in this browser or headless runtime.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setMicPermission("granted");

      // Real Web Audio API analyser for truthful voice activity metering
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = ctx;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(dataArray);
          let sumSq = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const norm = (dataArray[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.sqrt(sumSq / dataArray.length);
          setAudioLevel(Math.min(100, Math.round(rms * 320)));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Metering optional if AudioContext blocked
      }

      // Optional live browser SpeechRecognition for interim captions (never simulated)
      const SpeechRecCtor = (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
      if (typeof SpeechRecCtor === "function") {
        try {
          const rec = new (SpeechRecCtor as new () => {
            continuous: boolean;
            interimResults: boolean;
            lang: string;
            onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
            start: () => void;
            stop: () => void;
          })();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = settings?.general.preferredLanguage === "hinglish" ? "en-IN" : "en-US";
          rec.onresult = (ev) => {
            let interim = "";
            let finalPart = "";
            for (let i = 0; i < ev.results.length; i++) {
              const res = ev.results[i];
              if (res.isFinal) finalPart += res[0].transcript + " ";
              else interim += res[0].transcript;
            }
            if (finalPart.trim()) {
              setTranscript((prev) => (prev ? `${prev} ${finalPart.trim()}` : finalPart.trim()));
            }
            setInterimTranscript(interim);
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch {
          // Proceed with MediaRecorder + local /api/transcribe
        }
      }

      const preferredMime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "";
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupRecordingResources();
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const res = await ultronFetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": mimeType.split(";")[0] },
            body: blob,
          });
          const payload = await res.json().catch(() => null);
          if (res.ok && typeof payload?.text === "string" && payload.text.trim()) {
            setTranscript(payload.text.trim());
            onNotify({ tone: "success", title: "Local transcription complete" });
          } else {
            setVoiceError(
              payload?.message ||
                payload?.error ||
                `Local transcription unavailable (HTTP ${res.status}).`,
            );
          }
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : "Audio transcription request failed.");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      cleanupRecordingResources();
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicPermission("denied");
        setVoiceError("Microphone access denied by browser or operating system permission policy.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setVoiceError("No physical microphone device was detected on this machine.");
      } else {
        setVoiceError(err instanceof Error ? err.message : "Could not initialize microphone capture.");
      }
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
    }
  };

  const handleSpeak = async () => {
    const clean = ttsText.trim();
    if (!clean) return;
    setIsSpeaking(true);
    setTtsStatus("Requesting speech synthesis...");

    try {
      const res = await ultronFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, rate: speechRate, volume: speechVolume }),
      });

      if (res.ok && res.headers.get("content-type")?.includes("audio/wav")) {
        const blob = await res.blob();
        // On non-Windows hosts `/api/tts` returns a minimal silent fallback WAV (~6KB) so browser speechSynthesis can speak
        if (blob.size > 12000) {
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          activeAudioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setIsSpeaking(false);
            setTtsStatus("Native SAPI5 playback completed.");
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            setIsSpeaking(false);
            setTtsStatus("Audio playback error.");
          };
          setTtsStatus("Playing native WAV speech output...");
          await audio.play();
          return;
        }
      }

      // Browser Web Speech Synthesis fallback when native Windows SAPI5 is unavailable
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = speechRate;
        utterance.volume = speechVolume / 100;
        utterance.onend = () => {
          setIsSpeaking(false);
          setTtsStatus("Browser speech synthesis finished.");
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          setTtsStatus("Browser speech synthesis unavailable or cancelled.");
        };
        setTtsStatus("Speaking via browser Web Speech API...");
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
        setTtsStatus("No native SAPI5 or browser SpeechSynthesis engine available in this environment.");
      }
    } catch (err) {
      setIsSpeaking(false);
      setTtsStatus(err instanceof Error ? err.message : "Speech output failed.");
    }
  };

  const handleStopSpeech = async () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    await ultronFetch("/api/tts", { method: "DELETE" }).catch(() => {});
    setIsSpeaking(false);
    setTtsStatus("Speech output interrupted.");
  };

  const handleModeChange = async (mode: "PUSH_TO_TALK" | "WAKE_WORD" | "CONTINUOUS_CONVERSATION") => {
    setWakeMode(mode);
    const res = await ultronJson("/api/wakeword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      onNotify({ tone: "warn", title: "Could not sync voice mode", detail: res.error || undefined });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Voice Studio</h1>
          <p className="text-sm text-slate-400">
            Local microphone capture, Faster-Whisper transcription, and interruptible speech output.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-1.5 text-xs">
          <span className="text-slate-400">Microphone Permission:</span>
          <span
            className={`font-mono font-medium uppercase ${
              micPermission === "granted"
                ? "text-emerald-400"
                : micPermission === "denied" || micPermission === "unsupported"
                  ? "text-rose-400"
                  : "text-amber-300"
            }`}
          >
            {micPermission}
          </span>
        </div>
      </div>

      {/* Main 2-Column Voice Console */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Capture & Live Transcription */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">Audio Capture & STT</h2>
              <span className="font-mono text-[11px] text-slate-400">
                Live Captions: {liveSpeechSupported ? "Browser Supported" : "Unavailable"}
              </span>
            </div>

            {/* Activation Mode Selector */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { id: "PUSH_TO_TALK" as const, label: "Push to Talk" },
                { id: "WAKE_WORD" as const, label: "Wake Word" },
                { id: "CONTINUOUS_CONVERSATION" as const, label: "Continuous" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void handleModeChange(m.id)}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                    wakeMode === m.id
                      ? "border-blue-500/50 bg-blue-600/20 text-white"
                      : "border-slate-800 bg-[#101726]/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Real Voice Activity Level Bar */}
            <div className="mt-5 rounded-lg border border-slate-800/90 bg-[#06090f] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-300">
                  <Radio className={`h-3.5 w-3.5 ${isRecording ? "text-cyan-400" : "text-slate-500"}`} />
                  <span>{isRecording ? "Recording from local microphone" : isTranscribing ? "Transcribing locally..." : "Standby"}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {isRecording ? `${audioLevel}% input` : "0% input"}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-[width] duration-75"
                  style={{ width: `${isRecording ? Math.max(4, audioLevel) : 0}%` }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    disabled={isTranscribing || micPermission === "unsupported"}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-rose-500"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Stop & Transcribe</span>
                  </button>
                )}

                {micPermission === "denied" && (
                  <span className="inline-flex items-center gap-1 text-xs text-rose-400">
                    <MicOff className="h-3.5 w-3.5" />
                    Permission denied
                  </span>
                )}
              </div>
            </div>

            {voiceError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-950/20 p-3 text-xs text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{voiceError}</span>
              </div>
            )}

            {/* Transcript Output */}
            <div className="mt-4">
              <label htmlFor="voice-transcript-box" className="text-xs font-medium text-slate-400">
                Verified Transcript
              </label>
              <textarea
                id="voice-transcript-box"
                value={transcript + (interimTranscript ? ` ${interimTranscript}` : "")}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                placeholder="Transcribed speech appears here. No audio is simulated when a microphone is unavailable."
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#06090f] p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setTranscript("");
                setVoiceError(null);
              }}
              className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!transcript.trim()}
              onClick={() => onSendTranscript(transcript.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send to AI Chat</span>
            </button>
          </div>
        </section>

        {/* Right: Speech Output (TTS) & Interrupt Controls */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">Speech Output (TTS)</h2>
              <span className="font-mono text-[11px] text-slate-400">
                {isSpeaking ? "Speaking" : "Idle"}
              </span>
            </div>

            <div className="mt-4">
              <label htmlFor="tts-test-input" className="text-xs font-medium text-slate-400">
                Speech Output Prompt
              </label>
              <textarea
                id="tts-test-input"
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                rows={4}
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#06090f] p-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="tts-rate">Speech Rate</label>
                  <span className="font-mono tabular-nums text-slate-200">{speechRate.toFixed(1)}x</span>
                </div>
                <input
                  id="tts-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={speechRate}
                  onChange={(e) => setSpeechRate(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="tts-volume">Output Volume</label>
                  <span className="font-mono tabular-nums text-slate-200">{speechVolume}%</span>
                </div>
                <input
                  id="tts-volume"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={speechVolume}
                  onChange={(e) => setSpeechVolume(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-500"
                />
              </div>
            </div>

            {ttsStatus && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#101726]/70 px-3 py-2 text-xs text-slate-300">
                {ttsStatus}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleSpeak()}
              disabled={isSpeaking || !ttsText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Volume2 className="h-4 w-4" />
              <span>Speak Output</span>
            </button>

            <button
              type="button"
              onClick={() => void handleStopSpeech()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#101726] px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-rose-500/40 hover:text-rose-300"
            >
              <VolumeX className="h-4 w-4" />
              <span>Stop & Interrupt</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
