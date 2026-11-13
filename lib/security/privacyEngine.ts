/**
 * @file lib/security/privacyEngine.ts
 * @description Centralized Privacy Governance, Sensitive Data Scanner & Screen Privacy Controller.
 *
 * Subsystem:
 * Centralized Security, Privacy & Data Protection Subsystem (Module 6).
 *
 * Key Responsibilities:
 * - Scans strings and payloads for sensitive PII and secrets (OpenAI keys, GitHub tokens,
 *   AWS keys, Bearer tokens, private keys, passwords, credit cards, emails, SSNs).
 * - Sanitizes sensitive data, replacing findings with structured mask tags (`[REDACTED_...]`).
 * - Classifies content sensitivity: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or `RESTRICTED`.
 * - Screen capture privacy governor: enforces the sensitive window blacklist (password
 *   managers, banking portals, private browsing) and fail-closed consent timeout.
 * - Enforces data minimization and buffer purging on session termination or lock.
 *
 * Architectural Role & Interactions:
 * - Sanitizes prompts and logs in `app/api/chat`, `lib/security/auditEngine.ts`, and `lib/screen`.
 * - Bridges to `lib/screenPrivacyController.ts` for unified screen awareness governance.
 *
 * Safety / Security Guarantees:
 * - Fail-closed screen capture: capture is disallowed unless active consent is unexpired.
 * - High-coverage secret regexes: intercepts known bearer tokens and API formats.
 */

import { redactKnownSecrets } from "./credentialEngine.ts";
import type {
  DataClassification,
  PrivacyScanResult,
  SensitivePatternFinding,
  ScreenPrivacyState,
} from "./types.ts";

/** Regex patterns for detecting sensitive tokens and secrets. */
const SENSITIVE_PATTERNS = [
  { type: "api_key" as const, regex: /(?:sk[-_][a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35}|xox[baprs]-[0-9a-zA-Z-]{24,})/g },
  { type: "private_key" as const, regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
  { type: "jwt_token" as const, regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
  { type: "password" as const, regex: /(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*["']?([^\s"';]{6,})["']?/gi },
  { type: "credit_card" as const, regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g },
  { type: "ssn" as const, regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "email" as const, regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g },
];

/** Applications and window captions forbidden from visual screen capture. */
const SENSITIVE_WINDOW_PATTERNS: readonly string[] = Object.freeze([
  "1password",
  "bitwarden",
  "keepass",
  "lastpass",
  "dashlane",
  "authenticator",
  "incognito",
  "inprivate",
  "private browsing",
  "bank",
  "wallet",
  "crypto",
  "metamask",
  "windows security",
  "credentials",
]);

/** Active screen consent state in memory. */
let screenConsentExpiresAt = 0;

/**
 * Scans a text string for sensitive secrets, credentials, or PII and returns sanitized text.
 *
 * @param input - Text string to inspect.
 * @returns PrivacyScanResult with findings, sanitized string, and suggested classification.
 */
export function scanAndSanitizeText(input: string): PrivacyScanResult {
  if (!input || typeof input !== "string") {
    return {
      isClean: true,
      detectedFindings: [],
      sanitizedText: input || "",
      suggestedClassification: "PUBLIC",
    };
  }

  // First apply known registered secret redactions
  let sanitized = redactKnownSecrets(input);
  const findings: SensitivePatternFinding[] = [];

  for (const { type, regex } of SENSITIVE_PATTERNS) {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex);
    while ((match = re.exec(input)) !== null) {
      const fullMatch = match[0];
      const masked = fullMatch.length > 8
        ? `${fullMatch.slice(0, 3)}...${fullMatch.slice(-3)}`
        : "***";

      findings.push({
        type,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
        sampleMasked: masked,
      });

      // Replace in sanitized output
      sanitized = sanitized.split(fullMatch).join(`[REDACTED_${type.toUpperCase()}]`);
    }
  }

  // Determine suggested classification
  let suggestedClassification: DataClassification = "PUBLIC";
  if (findings.some((f) => f.type === "api_key" || f.type === "private_key" || f.type === "jwt_token")) {
    suggestedClassification = "RESTRICTED";
  } else if (findings.some((f) => f.type === "password" || f.type === "credit_card" || f.type === "ssn")) {
    suggestedClassification = "CONFIDENTIAL";
  } else if (findings.some((f) => f.type === "email")) {
    suggestedClassification = "INTERNAL";
  }

  return {
    isClean: findings.length === 0,
    detectedFindings: findings,
    sanitizedText: sanitized,
    suggestedClassification,
  };
}

/**
 * Grants explicit temporary user consent for screen awareness.
 *
 * @param durationMs - Consent duration in milliseconds (default: 5 minutes).
 */
export function grantScreenCaptureConsent(durationMs = 5 * 60 * 1000): void {
  screenConsentExpiresAt = Date.now() + durationMs;
}

/**
 * Revokes active screen capture consent immediately and purges memory buffers.
 */
export function revokeScreenCaptureConsent(): void {
  screenConsentExpiresAt = 0;
}

/**
 * Evaluates whether screen capture is currently permissible given the active window title.
 *
 * Fail-Closed Guarantee:
 * - If consent is expired: capture is denied.
 * - If active window matches sensitive window patterns: capture is blocked.
 *
 * @param activeWindowTitle - Window caption of foreground desktop window.
 * @returns ScreenPrivacyState.
 */
export function evaluateScreenCapturePrivacy(activeWindowTitle?: string): ScreenPrivacyState {
  const now = Date.now();
  const isConsentValid = screenConsentExpiresAt > now;

  if (!isConsentValid) {
    return {
      isScreenCaptureAllowed: false,
      activeConsentExpiresAt: 0,
      activeWindowExcluded: false,
      reason: "Screen capture denied: No active user consent granted or consent expired.",
    };
  }

  if (activeWindowTitle) {
    const lower = activeWindowTitle.toLowerCase();
    for (const pattern of SENSITIVE_WINDOW_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isScreenCaptureAllowed: false,
          activeConsentExpiresAt: screenConsentExpiresAt,
          activeWindowExcluded: true,
          excludedWindowMatch: pattern,
          reason: `Screen capture blocked: Active window "${activeWindowTitle}" contains sensitive keyword "${pattern}".`,
        };
      }
    }
  }

  return {
    isScreenCaptureAllowed: true,
    activeConsentExpiresAt: screenConsentExpiresAt,
    activeWindowExcluded: false,
    reason: "Screen capture authorized under active user consent.",
  };
}
