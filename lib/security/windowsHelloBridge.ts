/**
 * @file lib/security/windowsHelloBridge.ts
 * @description Native Windows Hello Biometric Bridge & Hardware Verification Adapter.
 *
 * Subsystem:
 * Centralized Security, Identity & Authentication Subsystem (Module 1).
 *
 * Key Responsibilities:
 * - Direct TypeScript interface to native Windows Biometric Framework (WinBio) and
 *   Windows Runtime UserConsentVerifier via `ultron_engine/windows_hello.py`.
 * - Queries and validates physical biometric sensors (Synaptics VFS7552 Touch Fingerprint Sensor).
 * - Triggers native Windows Hello biometric authentication prompts for founder verification.
 * - Enforces zero raw biometric storage: no templates, hashes, or images are ever stored in ULTRON.
 * - Distinguishes between hardware capabilities: Supported, Unavailable, and Unverified.
 * - Strictly fail-closed: execution failures or cancellations never pass.
 *
 * Architectural Role & Interactions:
 * - Called by `lib/security/identityEngine.ts` during sensitive action re-authentication.
 * - Exposes status to `/api/security/auth` for UI biometric status badges.
 *
 * Safety / Security Guarantees:
 * - Fail-closed: returns `success: false` on timeouts, cancellations, or errors.
 * - Hardware authenticity: verifies real device id and enrolled count from the OS.
 */

import { spawn } from "child_process";
import path from "path";
import os from "os";
import { resolvePythonExecutable } from "../pythonRuntime.ts";
import type { WindowsHelloStatus, BiometricVerificationResult } from "./types.ts";

/** Path to Python native Windows Hello engine script with packaged runtime resolution fallback. */
const WINDOWS_HELLO_SCRIPT = process.env.ULTRON_WINDOWS_HELLO_SCRIPT || path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "ultron_engine",
  "windows_hello.py"
);

/** Cache duration for hardware capability probe (30 seconds). */
const CACHE_TTL_MS = 30 * 1000;

let cachedStatus: { data: WindowsHelloStatus; expiresAt: number } | null = null;

/**
 * Queries Windows Hello hardware and driver availability from the operating system.
 *
 * WHY: High-frequency status queries (e.g. from UI polling or heartbeat) should not
 * invoke expensive PowerShell/WinRT introspection processes on every tick. Results are
 * cached for 30 seconds unless forceRefresh is true.
 *
 * @param forceRefresh - Bypass memory cache and query OS directly.
 * @returns WindowsHelloStatus structure.
 */
export async function getWindowsHelloStatus(forceRefresh = false): Promise<WindowsHelloStatus> {
  const now = Date.now();
  if (!forceRefresh && cachedStatus && cachedStatus.expiresAt > now) {
    return cachedStatus.data;
  }

  if (os.platform() !== "win32") {
    const nonWindowsStatus: WindowsHelloStatus = {
      supported: false,
      availability: "NonWindowsPlatform",
      deviceName: "None",
      manufacturer: "None",
      deviceId: "",
      hardwareStatus: "Unavailable",
      windowsHelloReady: false,
      isEnrolled: false,
      enrolledFingerprintsCount: 0,
      rawBiometricsStored: false,
      enclaveType: "None",
    };
    cachedStatus = { data: nonWindowsStatus, expiresAt: now + CACHE_TTL_MS };
    return nonWindowsStatus;
  }

  const pythonExec = resolvePythonExecutable();

  return new Promise((resolve) => {
    const child = spawn(pythonExec, [WINDOWS_HELLO_SCRIPT], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignored
      }
      resolve(getFallbackStatus("ProbeTimedOut"));
    }, 10000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        console.warn(`[WINDOWS HELLO] Probe returned code ${code}: ${stderr}`);
        resolve(getFallbackStatus("ProbeExecutionError"));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        const result: WindowsHelloStatus = {
          supported: Boolean(parsed.supported),
          availability: parsed.availability || "Unknown",
          deviceName: parsed.deviceName || "Unknown",
          manufacturer: parsed.manufacturer || "Unknown",
          deviceId: parsed.deviceId || "",
          hardwareStatus: parsed.hardwareStatus || "Unknown",
          windowsHelloReady: Boolean(parsed.windowsHelloReady),
          isEnrolled: Boolean(parsed.isEnrolled),
          enrolledFingerprintsCount: Number(parsed.enrolledFingerprintsCount) || 0,
          rawBiometricsStored: false, // Strict invariant: zero biometric data stored
          enclaveType: parsed.enclaveType || "Windows Biometric Framework Enclave",
        };

        cachedStatus = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
        resolve(result);
      } catch (err) {
        console.error("[WINDOWS HELLO] Failed to parse hardware probe output:", err);
        resolve(getFallbackStatus("JsonParseError"));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.warn("[WINDOWS HELLO] Subprocess launch error:", err);
      resolve(getFallbackStatus("LaunchError"));
    });
  });
}

/**
 * Generates safe fallback status when OS inspection is unavailable or fails.
 *
 * @param failureReason - Diagnostic failure token.
 * @returns Safe fail-closed WindowsHelloStatus.
 */
function getFallbackStatus(failureReason: string): WindowsHelloStatus {
  return {
    supported: false,
    availability: failureReason,
    deviceName: "Unknown (Unverified)",
    manufacturer: "Unknown",
    deviceId: "",
    hardwareStatus: "Unverified",
    windowsHelloReady: false,
    isEnrolled: false,
    enrolledFingerprintsCount: 0,
    rawBiometricsStored: false,
    enclaveType: "Unverified",
  };
}

/**
 * Triggers a native Windows Hello biometric authentication prompt directly on the Windows host.
 * Blocks until the user touches the physical sensor, cancels, or the prompt times out.
 *
 * Fail-Closed Guarantees:
 * - If user cancels or retries are exhausted, returns `success: false`.
 * - If process crashes or times out (60s), returns `success: false`.
 * - Does NOT mock success under any circumstances.
 *
 * @param promptReason - Descriptive explanation shown in the Windows Hello dialog.
 * @returns BiometricVerificationResult.
 */
export async function verifyWindowsHelloConsent(
  promptReason: string = "ULTRON Security Gate: Biometric authorization required."
): Promise<BiometricVerificationResult> {
  if (os.platform() !== "win32") {
    return {
      success: false,
      result: "NonWindowsPlatform",
      message: "Windows Hello biometric verification is only available on Windows operating systems.",
    };
  }

  const pythonExec = resolvePythonExecutable();

  return new Promise((resolve) => {
    const child = spawn(pythonExec, [WINDOWS_HELLO_SCRIPT, "--verify", "--reason", promptReason], {
      windowsHide: false, // Must be visible so the Windows Hello UI appears in the foreground
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const timeoutMs = 65000; // 65 seconds
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignored
      }
      resolve({
        success: false,
        result: "Timeout",
        message: "Biometric prompt timed out after 65 seconds.",
      });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        resolve({
          success: false,
          result: "Error",
          message: `Windows Hello process failed (code ${code}): ${stderr || "No error detail."}`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.success === true && parsed.result === "Verified") {
          resolve({
            success: true,
            result: "Verified",
            message: parsed.message || "Fingerprint verified successfully via Windows Hello.",
            hardwareBinding: parsed.hardwareBinding || "Synaptics VFS7552 Touch Fingerprint Sensor",
            verifiedAt: Date.now(),
          });
        } else {
          resolve({
            success: false,
            result: parsed.result || "Canceled",
            message: parsed.message || "Biometric verification failed or was canceled by user.",
          });
        }
      } catch (err) {
        resolve({
          success: false,
          result: "Error",
          message: `Failed to parse Windows Hello response: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        result: "Error",
        message: `Failed to spawn Windows Hello verification process: ${err.message}`,
      });
    });
  });
}
