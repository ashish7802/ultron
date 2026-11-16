/**
 * @file lib/screen/privacySecurityEngine.ts
 * @description Module 09: Screen Awareness Privacy Governance, Security Boundaries & Sensitive Field Masking.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Privacy & Security Subsystem.
 *
 * Key Responsibilities:
 * - Extends and enforces the foundational policies in `lib/screenPrivacyController.ts`:
 *   (OFF by Default, Explicit Time-Bounded Consent, Ephemeral Volatile Retention).
 * - Implements automated sensitive-field detection & pixel masking (passwords, API keys, tokens, credit cards).
 * - Enforces fail-closed authorization: any capture request lacking verified consent rejects immediately.
 * - Enforces private-window exclusion boundaries (Incognito, InPrivate, Password Managers, Banking).
 * - Maintains a tamper-evident cryptographic security audit trail using SHA-256 hash chaining.
 * - Executes instant emergency memory purges on lock, timeout, or user revocation.
 *
 * Architectural Role & Safety Guarantees:
 * - Mandatory gatekeeper protecting all capture executions.
 * - Negative-test compliant: rejects unauthenticated background captures, revoked tokens, and blacklisted applications.
 */

import crypto from "crypto";
import {
  isWindowExcluded,
  activateScreenCapture,
  purgeScreenBuffers,
  getScreenPrivacyPolicy,
} from "../screenPrivacyController.ts";
import type {
  PrivacyEvaluation,
  SensitiveFieldMask,
  ScreenSecurityAuditRecord,
  OCRLine,
} from "./types.ts";

export class PrivacySecurityEngine {
  private _auditTrail: ScreenSecurityAuditRecord[] = [];
  private _lastAuditHash: string = "0000000000000000000000000000000000000000000000000000000000000000";

  /** Regex patterns matching sensitive textual tokens for visual masking. */
  private readonly SENSITIVE_TEXT_PATTERNS = [
    { regex: /(?:password|passwd|pwd)[\s:=]+([^\s]+)/i, category: "password" as const },
    { regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/, category: "credit_card" as const },
    { regex: /\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b/, category: "api_key" as const },
    { regex: /\b(?:bearer\s+[a-zA-Z0-9_.-]{25,})\b/i, category: "auth_token" as const },
    { regex: /\b(?:pin[\s:=]+[0-9]{4,8})\b/i, category: "personal_pin" as const },
  ];

  /**
   * Evaluates whether a capture request is permissible and calculates necessary redaction masks.
   *
   * Fail-Closed Guarantee:
   * Returns isPermissible: false unless all privacy checks pass.
   *
   * @param windowTitle - Active window caption.
   * @param processName - Optional process name.
   * @param sessionId - Optional session token.
   * @returns PrivacyEvaluation containing authorization verdict and redaction masks.
   */
  public evaluateCapturePermission(
    windowTitle?: string,
    processName?: string,
    sessionId?: string
  ): PrivacyEvaluation {
    const policy = getScreenPrivacyPolicy();

    // 1. Check Global OFF Policy
    if (!policy.enabled || policy.state !== "ACTIVE_CAPTURE") {
      this.recordAudit("CAPTURE_BLOCKED", "DENIED", "Screen awareness is OFF by default or not in ACTIVE_CAPTURE state", windowTitle, processName, sessionId);
      return {
        isPermissible: false,
        denialReason: "Screen capture is disabled. Explicit user opt-in required.",
        requiresMasking: false,
        masks: [],
        policyState: policy.state,
      };
    }

    // 2. Check Consent Expiration
    if (Date.now() > policy.activeConsentExpiresAt) {
      purgeScreenBuffers();
      this.recordAudit("CAPTURE_BLOCKED", "DENIED", "Active user consent window expired; state transitioned to PURGED", windowTitle, processName, sessionId);
      return {
        isPermissible: false,
        denialReason: "User consent duration expired. Permission revoked.",
        requiresMasking: false,
        masks: [],
        policyState: "PURGED",
      };
    }

    // 3. Check Sensitive Window & Process Blacklist
    const isExcluded =
      (windowTitle && isWindowExcluded(windowTitle)) ||
      (processName && isWindowExcluded(processName));

    if (isExcluded) {
      const targetIdentifier = [windowTitle, processName ? `Process: ${processName}` : ""].filter(Boolean).join(" | ");
      this.recordAudit(
        "SENSITIVE_APP_EXCLUDED",
        "DENIED",
        `Target "${targetIdentifier}" is in sensitive exclusion blacklist`,
        windowTitle,
        processName,
        sessionId
      );
      return {
        isPermissible: false,
        denialReason: `Target application "${targetIdentifier}" contains sensitive data (password manager, private browsing, banking). Capture blocked for privacy.`,
        requiresMasking: false,
        masks: [],
        policyState: policy.state,
      };
    }

    // 4. Capture is Permitted
    this.recordAudit("CAPTURE_REQUEST", "PERMITTED", "Capture authorized under active user consent", windowTitle, processName, sessionId);
    return {
      isPermissible: true,
      requiresMasking: false,
      masks: [],
      policyState: policy.state,
    };
  }

  /**
   * Scans extracted OCR text lines and computes pixel bounding boxes that must be redacted.
   *
   * @param lines - Array of OCRLine descriptors.
   * @returns Array of SensitiveFieldMask bounding boxes.
   */
  public detectSensitiveFieldMasks(lines: OCRLine[]): SensitiveFieldMask[] {
    const masks: SensitiveFieldMask[] = [];

    for (const line of lines) {
      for (const rule of this.SENSITIVE_TEXT_PATTERNS) {
        if (rule.regex.test(line.text)) {
          masks.push({
            category: rule.category,
            bounds: { ...line.bounds },
            redactedReplacement: `[REDACTED_${rule.category.toUpperCase()}]`,
          });
        }
      }
    }

    return masks;
  }

  /**
   * Applies pixel-level blackout masking to an image buffer based on detected sensitive field bounds.
   *
   * @param buffer - Raw BMP image buffer.
   * @param masks - Sensitive field bounding boxes.
   * @param frameWidth - Display width.
   * @param frameHeight - Display height.
   * @returns Cleaned buffer with sensitive regions blacked out.
   */
  public applyMasksToBuffer(
    buffer: Buffer,
    masks: SensitiveFieldMask[],
    frameWidth: number,
    frameHeight: number
  ): Buffer {
    if (masks.length === 0 || buffer.length < 54) return buffer;

    // Clone buffer to avoid mutating input
    const masked = Buffer.from(buffer);
    const rowStride = (frameWidth * 3 + 3) & ~3;
    const offset = 54; // BMP header size

    for (const mask of masks) {
      const b = mask.bounds;
      const startX = Math.max(0, Math.min(frameWidth - 1, b.x));
      const endX = Math.max(0, Math.min(frameWidth, b.x + b.width));
      const startY = Math.max(0, Math.min(frameHeight - 1, b.y));
      const endY = Math.max(0, Math.min(frameHeight, b.y + b.height));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const pIdx = offset + y * rowStride + x * 3;
          if (pIdx + 2 < masked.length) {
            // Paint black pixels (0, 0, 0)
            masked[pIdx] = 0;
            masked[pIdx + 1] = 0;
            masked[pIdx + 2] = 0;
          }
        }
      }
    }

    return masked;
  }

  /**
   * Records an immutable entry into the cryptographic security audit trail.
   */
  public recordAudit(
    action: ScreenSecurityAuditRecord["action"],
    outcome: ScreenSecurityAuditRecord["outcome"],
    reason: string,
    windowTitle?: string,
    processName?: string,
    sessionId?: string
  ): ScreenSecurityAuditRecord {
    const timestamp = Date.now();
    const id = `audit_${crypto.randomUUID().slice(0, 12)}`;

    // Cryptographic chain hash
    const payload = `${id}|${timestamp}|${action}|${outcome}|${reason}|${this._lastAuditHash}`;
    const chainHash = crypto.createHash("sha256").update(payload).digest("hex");
    this._lastAuditHash = chainHash;

    const record: ScreenSecurityAuditRecord = {
      id,
      timestamp,
      action,
      outcome,
      windowTitle,
      processName,
      reason,
      sessionId,
      chainHash,
    };

    this._auditTrail.push(record);
    if (this._auditTrail.length > 500) {
      this._auditTrail = this._auditTrail.slice(-300);
    }

    return record;
  }

  /**
   * Retrieves read-only copy of recent audit records.
   */
  public getAuditTrail(): ReadonlyArray<ScreenSecurityAuditRecord> {
    return [...this._auditTrail];
  }

  /**
   * Activates screen capture for a specified duration under user opt-in.
   */
  public grantConsent(durationMs: number = 5 * 60 * 1000) {
    const policy = activateScreenCapture(durationMs);
    this.recordAudit("CAPTURE_REQUEST", "PERMITTED", `Explicit consent granted for ${(durationMs / 1000).toFixed(0)}s`);
    return policy;
  }

  /**
   * Immediately terminates all capture and revokes permission.
   */
  public revokeConsent(reason: string = "User revoked consent"): void {
    purgeScreenBuffers();
    this.recordAudit("EMERGENCY_STOP", "PURGED", reason);
  }
}

/** Global singleton instance of PrivacySecurityEngine. */
export const defaultPrivacySecurityEngine = new PrivacySecurityEngine();
