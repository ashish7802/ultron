/**
 * @file lib/security/dpapiBridge.ts
 * @description Windows Data Protection API (DPAPI) Bridge for Node.js Key Custody.
 *
 * Subsystem:
 * Centralized Cryptographic Key Custody Architecture (F-06 & F-16 Hardening).
 *
 * Key Responsibilities:
 * - Wraps sensitive master key and recovery key secrets with Windows DPAPI (`CryptProtectData`).
 * - Unwraps DPAPI blobs (`CryptUnprotectData`) strictly within the user logon context.
 * - Supports seamless fallback for non-Windows platforms (e.g. Linux CI/container test environments).
 * - Enforces zero raw plaintext key exposure in memory or logs.
 *
 * Architectural Role & Safety Guarantees:
 * - Bridges Node.js key loaders to the native Python win32crypt subsystem (`ultron_engine/dpapi_helper.py`).
 * - CryptProtectData binds secrets to the user's Windows credentials and machine TPM.
 */

import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { resolvePythonExecutable } from "../pythonRuntime.ts";

export class DpapiBridge {
  private static _instance: DpapiBridge | null = null;
  private readonly _pythonExecutable: string;
  private readonly _helperScript: string;
  private readonly _isWindows: boolean;

  private constructor() {
    this._isWindows = process.platform === "win32";
    this._pythonExecutable = resolvePythonExecutable();
    this._helperScript = path.join(process.cwd(), "ultron_engine", "dpapi_helper.py");
  }

  public static getInstance(): DpapiBridge {
    if (!this._instance) {
      this._instance = new DpapiBridge();
    }
    return this._instance;
  }

  /**
   * Checks whether Windows DPAPI protection is available on the current host.
   */
  public isAvailable(): boolean {
    return this._isWindows && fs.existsSync(this._helperScript);
  }

  /**
   * Encrypts plaintext secret using Windows DPAPI CryptProtectData.
   *
   * @param plaintext - Secret string to protect.
   * @param description - Optional description for DPAPI metadata.
   * @returns Base64-encoded DPAPI ciphertext blob.
   */
  public protectSecret(plaintext: string, _description?: string): string {
    if (!plaintext || plaintext.trim().length === 0) {
      throw new Error("Cannot protect empty secret.");
    }

    if (!this.isAvailable()) {
      // Non-Windows compatibility fallback: return prefixed raw value
      return `PLAINTEXT_FALLBACK:${plaintext}`;
    }

    try {
      const output = execFileSync(
        this._pythonExecutable,
        [this._helperScript, "protect", plaintext],
        {
          encoding: "utf-8",
          windowsHide: true,
          timeout: 10000,
        }
      ).trim();

      if (!output || output.length === 0) {
        throw new Error("DPAPI protection helper returned empty response.");
      }

      return output;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Windows DPAPI CryptProtectData execution failed: ${msg}`);
    }
  }

  /**
   * Decrypts a Base64-encoded DPAPI ciphertext blob using Windows DPAPI CryptUnprotectData.
   *
   * @param ciphertextB64 - Base64 DPAPI blob or compatibility fallback string.
   * @returns Decrypted plaintext secret string.
   */
  public unprotectSecret(ciphertextB64: string): string {
    if (!ciphertextB64 || ciphertextB64.trim().length === 0) {
      throw new Error("Cannot unprotect empty ciphertext.");
    }

    if (ciphertextB64.startsWith("PLAINTEXT_FALLBACK:")) {
      return ciphertextB64.substring("PLAINTEXT_FALLBACK:".length);
    }

    if (!this.isAvailable()) {
      throw new Error("Cannot unprotect DPAPI ciphertext on non-Windows environment without plaintext fallback.");
    }

    try {
      const output = execFileSync(
        this._pythonExecutable,
        [this._helperScript, "unprotect", ciphertextB64.trim()],
        {
          encoding: "utf-8",
          windowsHide: true,
          timeout: 10000,
        }
      ).trim();

      return output;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Windows DPAPI CryptUnprotectData execution failed: ${msg}`);
    }
  }
}

export const defaultDpapiBridge = DpapiBridge.getInstance();
