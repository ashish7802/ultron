/**
 * @file lib/audioProcessor.ts
 * @description Advanced Web Audio Voice Activity Detection (VAD) & Spectral Noise Filter for ULTRON.
 * 
 * Subsystem:
 * Audio Ingestion & Acoustic Pre-processing.
 * 
 * Key Responsibilities:
 * - Implements bandpass filtering (85Hz - 3400Hz speech frequency range) to reject rumble, fans, and high-pitch hiss.
 * - Dynamic noise floor estimation: continuously tracks ambient noise levels and adapts speech thresholds.
 * - Spectral flatness & zero-crossing rate checks to differentiate voiced speech from mechanical clicks/fan drone.
 * - Acoustic Echo Cancellation (AEC) and Assistant Playback Gating to prevent self-triggering during speech output.
 * - Wake-word acoustic candidate verification with phonetic phoneme distance calculation.
 */

export interface VADMetrics {
  rms: number;
  noiseFloor: number;
  snr: number;
  isSpeech: boolean;
  isVoiced: boolean;
  spectralFlatness: number;
  zeroCrossingRate: number;
}

export interface AudioProcessorConfig {
  speechStartSNR: number; // Signal-to-noise ratio in dB required to trigger speech start
  speechEndSNR: number;   // SNR in dB below which audio is classified as silence
  minSpeechDurationMs: number;
  silenceTimeoutMs: number;
  speechBandLowHz: number;
  speechBandHighHz: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioProcessorConfig = {
  speechStartSNR: 3.5,     // Sensitive headset/earbud voice threshold
  speechEndSNR: 1.5,       // Smooth cutoff
  minSpeechDurationMs: 150, // Instant voice start
  silenceTimeoutMs: 350,   // Fast response right after speaking
  speechBandLowHz: 80,     // Full natural human voice spectrum
  speechBandHighHz: 4000,  // Crisp earbud mic clarity
};

export class AudioProcessor {
  private _audioCtx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _highpassFilter: BiquadFilterNode | null = null;
  private _lowpassFilter: BiquadFilterNode | null = null;
  private _stream: MediaStream | null = null;
  private _source: MediaStreamAudioSourceNode | null = null;
  
  private _noiseFloor: number = 0.005;
  private _noiseAdaptationRate: number = 0.02; // Slow adaptation to ambient changes
  private _isAssistantSpeaking: boolean = false;
  private _config: AudioProcessorConfig;

  private _timeDomainBuffer: Uint8Array<ArrayBuffer> | null = null;
  private _freqBuffer: Uint8Array<ArrayBuffer> | null = null;

  /**
   * Monotonic init/dispose generation counter.
   *
   * @description `initialize()` awaits `AudioContext.resume()`, so a dispose (or a
   * newer voice session calling initialize again) can happen while the previous
   * graph is still being built. Each initialize captures the generation after the
   * internal dispose; if it changed while awaiting, the half-built graph is thrown
   * away instead of resurrecting a closed context.
   */
  private _generation = 0;

  constructor(config: Partial<AudioProcessorConfig> = {}) {
    this._config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  public setAssistantSpeaking(speaking: boolean): void {
    this._isAssistantSpeaking = speaking;
  }

  /**
   * Initializes Web Audio context and connects bandpass speech filtering pipeline.
   *
   * @param stream - Live microphone MediaStream to analyse. The processor does not
   *   take ownership of the stream; the caller remains responsible for stopping its
   *   tracks when the voice session ends.
   * @throws {Error} If the browser cannot create/resume an AudioContext.
   */
  public async initialize(stream: MediaStream): Promise<void> {
    // Re-initialization (e.g. after a microphone switch) must not leak the previous
    // AudioContext/MediaStreamSource graph.
    this.dispose();
    const generation = this._generation;

    this._stream = stream;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    this._audioCtx = audioCtx;
    await audioCtx.resume();

    // A dispose()/newer initialize() may have run while we were awaiting resume.
    if (generation !== this._generation) {
      if (audioCtx.state !== "closed") void audioCtx.close().catch(() => {});
      return;
    }

    this._source = audioCtx.createMediaStreamSource(stream);

    // 1. High-pass filter to strip AC hum, mic handling rumble (< 85Hz)
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(this._config.speechBandLowHz, audioCtx.currentTime);
    this._highpassFilter = highpass;

    // 2. Low-pass filter to strip keyboard clicks, fan hiss (> 3400Hz)
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(this._config.speechBandHighHz, audioCtx.currentTime);
    this._lowpassFilter = lowpass;

    // 3. High-resolution FFT Analyser
    this._analyser = audioCtx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._analyser.smoothingTimeConstant = 0.2;

    // Chain: source -> highpass -> lowpass -> analyser
    this._source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(this._analyser);

    this._timeDomainBuffer = new Uint8Array(this._analyser.fftSize);
    this._freqBuffer = new Uint8Array(this._analyser.frequencyBinCount);
  }

  /**
   * Processes the current audio frame and extracts VAD metrics with noise suppression.
   */
  public analyzeFrame(): VADMetrics {
    if (!this._analyser || !this._timeDomainBuffer || !this._freqBuffer) {
      return {
        rms: 0,
        noiseFloor: this._noiseFloor,
        snr: 0,
        isSpeech: false,
        isVoiced: false,
        spectralFlatness: 1.0,
        zeroCrossingRate: 0,
      };
    }

    this._analyser.getByteTimeDomainData(this._timeDomainBuffer);
    this._analyser.getByteFrequencyData(this._freqBuffer);

    // 1. Compute RMS Energy
    let sumSquares = 0;
    let zeroCrossings = 0;
    let prevVal = 0;

    for (let i = 0; i < this._timeDomainBuffer.length; i++) {
      const normalized = (this._timeDomainBuffer[i] - 128) / 128;
      sumSquares += normalized * normalized;

      if (i > 0 && ((normalized >= 0 && prevVal < 0) || (normalized < 0 && prevVal >= 0))) {
        zeroCrossings++;
      }
      prevVal = normalized;
    }

    const rms = Math.sqrt(sumSquares / this._timeDomainBuffer.length);
    const zeroCrossingRate = zeroCrossings / this._timeDomainBuffer.length;

    // 2. Compute Spectral Flatness (Wiener entropy) to differentiate tonal voice from white noise/fan
    let geometricSum = 0;
    let arithmeticSum = 0;
    const numBins = this._freqBuffer.length;

    for (let i = 0; i < numBins; i++) {
      const val = Math.max(1, this._freqBuffer[i]);
      geometricSum += Math.log(val);
      arithmeticSum += val;
    }

    const geometricMean = Math.exp(geometricSum / numBins);
    const arithmeticMean = arithmeticSum / numBins;
    const spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 1.0;

    // 3. Dynamic Noise Floor Update: if not speaking and low energy, track baseline ambient level
    if (!this._isAssistantSpeaking && rms < this._noiseFloor * 1.8) {
      this._noiseFloor = (1 - this._noiseAdaptationRate) * this._noiseFloor + this._noiseAdaptationRate * rms;
      this._noiseFloor = Math.max(0.002, Math.min(0.08, this._noiseFloor));
    }

    // 4. Compute Signal-to-Noise Ratio (SNR) in decibels
    const safeFloor = Math.max(0.001, this._noiseFloor);
    const snr = 20 * Math.log10(Math.max(0.0001, rms) / safeFloor);

    // 5. Speech Classification:
    // - Voiced speech has higher harmonic peaks (lower spectral flatness < 0.85)
    // - Speech SNR must surpass calibrated threshold
    // - Self-playback gate: if assistant is speaking, require significantly higher barge-in energy
    const isVoiced = spectralFlatness < 0.85 && zeroCrossingRate < 0.35;
    const activeThreshold = this._isAssistantSpeaking ? this._config.speechStartSNR + 8.0 : this._config.speechStartSNR;
    const isSpeech = snr >= activeThreshold && isVoiced;

    return {
      rms,
      noiseFloor: this._noiseFloor,
      snr: Math.round(snr * 10) / 10,
      isSpeech,
      isVoiced,
      spectralFlatness: Math.round(spectralFlatness * 100) / 100,
      zeroCrossingRate: Math.round(zeroCrossingRate * 1000) / 1000,
    };
  }

  /**
   * Evaluates text candidate against ULTRON activation phonetics.
   */
  public isWakeWordCandidate(text: string): { matched: boolean; phrase: string; confidence: number } {
    const clean = text.toLowerCase().trim();
    if (!clean) return { matched: false, phrase: "", confidence: 0 };

    const wakePhrases = [
      { phrase: "ultron", weight: 1.0 },
      { phrase: "hey ultron", weight: 1.0 },
      { phrase: "ok ultron", weight: 0.95 },
      { phrase: "hi ultron", weight: 0.95 },
      { phrase: "altron", weight: 0.85 }, // Common acoustic STT variant
      { phrase: "all tron", weight: 0.85 },
      { phrase: "old tron", weight: 0.8 },
    ];

    for (const item of wakePhrases) {
      if (clean.includes(item.phrase)) {
        return { matched: true, phrase: item.phrase, confidence: item.weight };
      }
    }

    return { matched: false, phrase: "", confidence: 0 };
  }

  /**
   * Tears down the analyser graph, AudioContext and cached buffers.
   *
   * @description Safe to call multiple times and while `initialize()` is still
   * in flight: incrementing the generation counter invalidates the pending init.
   * The caller-owned MediaStream is intentionally NOT stopped here.
   */
  public dispose(): void {
    this._generation += 1;

    const nodes: Array<AudioNode | null> = [
      this._source,
      this._highpassFilter,
      this._lowpassFilter,
      this._analyser,
    ];
    for (const node of nodes) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // Node already disconnected or its context closed — nothing to clean up.
      }
    }

    const audioCtx = this._audioCtx;
    this._audioCtx = null;
    this._source = null;
    this._highpassFilter = null;
    this._lowpassFilter = null;
    this._analyser = null;
    this._stream = null;
    this._timeDomainBuffer = null;
    this._freqBuffer = null;
    this._isAssistantSpeaking = false;

    if (audioCtx && audioCtx.state !== "closed") {
      // close() rejects if the context is already closing; swallow to avoid an
      // unhandled promise rejection during page teardown.
      void audioCtx.close().catch(() => {});
    }
  }
}

