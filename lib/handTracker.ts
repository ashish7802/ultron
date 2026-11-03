/**
 * @file lib/handTracker.ts
 * @description Real-time webcam hand tracking & gesture recognition using MediaPipe Vision.
 * 
 * Subsystem:
 * Holographic Visual Perception & Gesture Interaction Core.
 * 
 * Responsibilities:
 * - Initializes MediaPipe HandLandmarker with local WASM binaries and offline fallback.
 * - Tracks 21 3D hand landmarks from webcam video frames.
 * - Detects interaction gestures: Pinch (drag/rotate), Open Palm, and Closed Fist.
 * - Maps normalized coordinates to 3D Three.js orb Euler rotations with smoothing.
 * 
 * Safety & Privacy:
 * - Video frames are processed 100% locally in browser memory via WebAssembly; no frames leave the host.
 */

import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Local WASM and model asset paths for offline inference
const LOCAL_WASM_PATH = "/wasm";
const LOCAL_MODEL_PATH = "/models/hand_landmarker.task";
const FALLBACK_WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FALLBACK_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Landmark indices (MediaPipe hand model)
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// Pinch hysteresis: thumb–index distance relative to hand size (relaxed for easier gestures)
const PINCH_ON = 0.48;
const PINCH_OFF = 0.65;

// How strongly hand movement rotates the orb (radians per normalized unit)
const ROTATE_SPEED = 6.5;
// Smoothing factor for grab-point tracking (0..1, higher = snappier)
const SMOOTHING = 0.5;

export type GestureMode = "idle" | "spin" | "zoom";

export interface TrackerStatus {
  hands: number;
  mode: GestureMode;
}

export interface HandTrackerCallbacks {
  /** Called when a single pinched hand drags: deltas in mirrored normalized coords. */
  onRotate(deltaTheta: number, deltaPhi: number): void;
  /** Called when both hands pinch and spread/close: multiply camera distance by factor. */
  onZoom(factor: number): void;
  onStatus(status: TrackerStatus): void;
}

interface Point {
  x: number;
  y: number;
}

interface HandState {
  pinching: boolean;
  grab: Point; // smoothed pinch midpoint, mirrored
}

export class HandTracker {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private callbacks: HandTrackerCallbacks;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;

  /**
   * Monotonic start/stop generation counter.
   *
   * @description `start()` awaits getUserMedia, video playback and MediaPipe model
   * creation. A `stop()` (or a second `start()`) issued during those awaits must
   * cancel the pending start, otherwise the async continuation would re-enable the
   * camera and animation loop after the caller asked for shutdown.
   */
  private generation = 0;

  // keyed by handedness label so state survives re-ordering between frames
  private handStates = new Map<string, HandState>();
  private prevMode: GestureMode = "idle";
  private prevSpinGrab: Point | null = null;
  private prevZoomDist: number | null = null;
  private lastStatus: TrackerStatus = { hands: 0, mode: "idle" };

  constructor(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    callbacks: HandTrackerCallbacks,
  ) {
    this.video = video;
    this.overlay = overlay;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.running) return;

    const generation = ++this.generation;
    const isCancelled = () => generation !== this.generation;

    let initialStream: MediaStream | null = null;
    let selectedDeviceId: string | null = null;

    const isVirtualOrPhone = (label: string) =>
      /virtual|phone|link\s*to\s*windows|droid|iriun|camo|epoccam|obs|vcam|remote|connected\s*device|galaxy|pixel|oneplus|xiaomi|redmi|oppo|vivo|android/i.test(label);

    const isLaptopHardware = (label: string) =>
      /integrated|internal|built-in|front|laptop|webcam|camera|hp|lenovo|dell|acer|asus|chicony|sunplus|realtek|bison|intel/i.test(label) &&
      !isVirtualOrPhone(label);

    try {
      // 1. Check if we already have a saved laptop camera deviceId in localStorage
      const savedCameraId = typeof window !== "undefined" ? localStorage.getItem("ultron_laptop_camera_id") : null;

      // 2. Enumerate existing devices before opening stream
      const initialDevices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const videoDevices = initialDevices.filter((d) => d.kind === "videoinput");
      const hasLabels = videoDevices.some((d) => Boolean(d.label));

      if (hasLabels) {
        // Find best physical laptop camera directly
        const laptopCam = videoDevices.find((d) => isLaptopHardware(d.label));
        const nonVirtualCam = videoDevices.find((d) => !isVirtualOrPhone(d.label));
        const bestCam = laptopCam || nonVirtualCam;
        if (bestCam && bestCam.deviceId) {
          selectedDeviceId = bestCam.deviceId;
          if (typeof window !== "undefined") {
            localStorage.setItem("ultron_laptop_camera_id", bestCam.deviceId);
          }
        }
      } else if (savedCameraId && videoDevices.some((d) => d.deviceId === savedCameraId)) {
        selectedDeviceId = savedCameraId;
      }

      // 3. Open media stream requesting strictly user-facing laptop camera or exact hardware ID
      const initialConstraints: MediaTrackConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: 640, height: 480 }
        : { facingMode: "user", width: 640, height: 480 };

      initialStream = await navigator.mediaDevices.getUserMedia({
        video: initialConstraints,
        audio: false,
      });

      // 4. Re-check labels now that permission has been granted
      const activeTrack = initialStream.getVideoTracks()[0];
      const activeLabel = activeTrack?.label || "";

      // If Windows assigned a virtual/phone camera, immediately find and switch to laptop hardware
      if (isVirtualOrPhone(activeLabel) || !selectedDeviceId) {
        const freshDevices = await navigator.mediaDevices.enumerateDevices();
        const freshVideo = freshDevices.filter((d) => d.kind === "videoinput");
        const realLaptopCam = freshVideo.find((d) => isLaptopHardware(d.label)) || freshVideo.find((d) => !isVirtualOrPhone(d.label));

        if (realLaptopCam && realLaptopCam.deviceId && realLaptopCam.deviceId !== activeTrack?.getSettings()?.deviceId) {
          selectedDeviceId = realLaptopCam.deviceId;
          if (typeof window !== "undefined") {
            localStorage.setItem("ultron_laptop_camera_id", realLaptopCam.deviceId);
          }
          initialStream.getTracks().forEach((t) => t.stop());
          initialStream = null;
        }
      }
    } catch {
      // If enumerate or permission fails, proceed to standard request
    }

    // A stop()/restart issued while probing devices invalidates this start.
    if (isCancelled()) {
      initialStream?.getTracks().forEach((t) => t.stop());
      return;
    }

    if (!initialStream) {
      const constraints: MediaTrackConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: 640, height: 480 }
        : { width: 640, height: 480, facingMode: "user" };

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false,
      });
    } else {
      this.stream = initialStream;
    }

    if (isCancelled()) {
      this.releaseStream();
      return;
    }

    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch (playErr) {
      // Autoplay was blocked or the element was unmounted: never leave the camera on.
      this.releaseStream();
      throw playErr;
    }

    if (isCancelled()) {
      this.releaseStream();
      return;
    }

    try {
      let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
      try {
        // Offline-first: load local bundled WASM files
        fileset = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
      } catch (wasmErr) {
        console.warn("[HandTracker] Local WASM failed, falling back to CDN:", wasmErr);
        fileset = await FilesetResolver.forVisionTasks(FALLBACK_WASM_CDN);
      }

      const tryCreate = async (modelPath: string, delegate: "GPU" | "CPU") => {
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      };

      try {
        // Offline-first: load local bundled hand landmarker task model
        this.landmarker = await tryCreate(LOCAL_MODEL_PATH, "GPU");
      } catch {
        try {
          this.landmarker = await tryCreate(LOCAL_MODEL_PATH, "CPU");
        } catch (localModelErr) {
          console.warn("[HandTracker] Local model failed, falling back to CDN:", localModelErr);
          try {
            this.landmarker = await tryCreate(FALLBACK_MODEL_URL, "GPU");
          } catch {
            this.landmarker = await tryCreate(FALLBACK_MODEL_URL, "CPU");
          }
        }
      }
    } catch (modelErr) {
      // WASM/model initialisation failed after the camera was already opened:
      // release the stream before propagating so the camera indicator turns off.
      this.releaseStream();
      throw modelErr;
    }

    if (isCancelled()) {
      this.landmarker?.close();
      this.landmarker = null;
      this.releaseStream();
      return;
    }

    this.running = true;
    this.loop();
  }

  /**
   * Stops media capture and clears any video element binding.
   *
   * @description Does not touch the MediaPipe landmarker; callers that own a
   * created model should use {@link HandTracker.stop}.
   */
  private releaseStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video.srcObject) {
      this.video.srcObject = null;
    }
  }

  stop(): void {
    // Invalidate any start() that is still awaiting getUserMedia / model loading.
    this.generation += 1;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.releaseStream();
    this.handStates.clear();
    this.prevMode = "idle";
    this.prevSpinGrab = null;
    this.prevZoomDist = null;
    this.lastVideoTime = -1;
    const ctx = this.overlay.getContext("2d");
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.emitStatus({ hands: 0, mode: "idle" });
  }

  private loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    try {
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      this.processHands(result.landmarks, result.handedness.map((h) => h[0]?.categoryName ?? "?"));
      this.drawOverlay(result.landmarks);
    } catch (frameErr) {
      // A single bad frame (GPU hiccup, detached video) must not kill the loop.
      console.warn("[HandTracker] Frame processing failed:", frameErr);
    }
  };

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const pinchedGrabs: Point[] = [];
    const seen = new Set<string>();

    landmarks.forEach((lm, i) => {
      const label = labels[i];
      seen.add(label);

      const handScale = dist2d(lm[WRIST], lm[MIDDLE_MCP]);
      if (handScale < 1e-6) return;
      const pinchRatio = dist2d(lm[THUMB_TIP], lm[INDEX_TIP]) / handScale;

      // Mirrored so hand-right = screen-right from the user's perspective
      const raw: Point = {
        x: 1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
        y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
      };

      let state = this.handStates.get(label);
      if (!state) {
        state = { pinching: false, grab: raw };
        this.handStates.set(label, state);
      }

      // Hysteresis so the pinch doesn't flicker on/off at the threshold
      if (state.pinching && pinchRatio > PINCH_OFF) state.pinching = false;
      else if (!state.pinching && pinchRatio < PINCH_ON) state.pinching = true;

      state.grab = {
        x: state.grab.x + (raw.x - state.grab.x) * SMOOTHING,
        y: state.grab.y + (raw.y - state.grab.y) * SMOOTHING,
      };

      if (state.pinching) pinchedGrabs.push(state.grab);
    });

    // Drop state for hands that left the frame
    for (const key of this.handStates.keys()) {
      if (!seen.has(key)) this.handStates.delete(key);
    }

    const mode: GestureMode =
      pinchedGrabs.length >= 2 ? "zoom" : pinchedGrabs.length === 1 ? "spin" : "idle";

    // Reset reference points on any mode change to avoid jumps
    if (mode !== this.prevMode) {
      this.prevSpinGrab = null;
      this.prevZoomDist = null;
      this.prevMode = mode;
    }

    if (mode === "spin") {
      const grab = pinchedGrabs[0];
      if (this.prevSpinGrab) {
        const dx = grab.x - this.prevSpinGrab.x;
        const dy = grab.y - this.prevSpinGrab.y;
        if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
          this.callbacks.onRotate(dx * ROTATE_SPEED, dy * ROTATE_SPEED);
        }
      }
      this.prevSpinGrab = grab;
    } else if (mode === "zoom") {
      const d = Math.hypot(
        pinchedGrabs[0].x - pinchedGrabs[1].x,
        pinchedGrabs[0].y - pinchedGrabs[1].y,
      );
      if (this.prevZoomDist && d > 1e-4) {
        // Spread hands apart -> factor < 1 -> camera moves closer
        const factor = Math.min(1.18, Math.max(0.85, this.prevZoomDist / d));
        this.callbacks.onZoom(factor);
      }
      this.prevZoomDist = d;
    }

    this.emitStatus({ hands: landmarks.length, mode });
  }

  private emitStatus(status: TrackerStatus): void {
    if (
      status.hands !== this.lastStatus.hands ||
      status.mode !== this.lastStatus.mode
    ) {
      this.lastStatus = status;
      this.callbacks.onStatus(status);
    }
  }

  private drawOverlay(landmarks: NormalizedLandmark[][]): void {
    const ctx = this.overlay.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.overlay;
    ctx.clearRect(0, 0, width, height);

    for (const lm of landmarks) {
      const thumb = lm[THUMB_TIP];
      const index = lm[INDEX_TIP];
      // Overlay canvas sits on the mirrored video preview, so mirror x here too
      const tx = (1 - thumb.x) * width;
      const ty = thumb.y * height;
      const ix = (1 - index.x) * width;
      const iy = index.y * height;

      const handScale = dist2d(lm[WRIST], lm[MIDDLE_MCP]);
      const pinched =
        handScale > 1e-6 && dist2d(thumb, index) / handScale < PINCH_ON;

      ctx.strokeStyle = pinched ? "#ffcc66" : "rgba(255,170,48,0.5)";
      ctx.lineWidth = pinched ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(ix, iy);
      ctx.stroke();

      ctx.fillStyle = pinched ? "#ffcc66" : "rgba(255,170,48,0.7)";
      for (const [x, y] of [
        [tx, ty],
        [ix, iy],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, pinched ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function dist2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
