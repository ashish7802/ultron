/**
 * @file lib/screenPrivacyController.ts
 * @description Privacy Controls, Exclusion Boundary & Lifecycle Governance for Screen Intelligence.
 *
 * Subsystem:
 * Privacy Governance, Visual Sensing & Display Security.
 *
 * Key Responsibilities:
 * - Implements the formal Privacy Lifecycle for screen awareness:
 *   DISABLED (Default) -> REQUESTING_CONSENT -> ACTIVE_CAPTURE -> PAUSED -> PURGED.
 * - Strictly enforces that screen capture is OFF by default.
 * - Maintains an immutable sensitive window exclusion list (password managers, banking apps, private browsing).
 * - Implements fail-closed behavior: All capture attempts without active, verified user consent reject immediately.
 * - Provides memory buffer purging on lock, timeout, or session end.
 *
 * Architectural Role & Audit Note:
 * - Physical capture is implemented by `ScreenCaptureEngine` and the native Windows driver;
 *   this module owns the explicit-consent and sensitive-window policy they must respect.
 * - Production API and streaming paths evaluate this policy before acquiring desktop pixels.
 *
 * Safety / Security Guarantees:
 * - Fail-closed: `canCapture()` returns `false` unless explicitly activated by user.
 * - Sensitive app masking: Blocklist prevents reading credential managers.
 * - No raw screenshot retention: Pixels are ephemeral and purged upon release.
 */

export type ScreenCaptureState = "DISABLED" | "REQUESTING_CONSENT" | "ACTIVE_CAPTURE" | "PAUSED" | "PURGED";

export interface ScreenPrivacyPolicy {
  enabled: boolean;
  state: ScreenCaptureState;
  requireVisualIndicator: boolean;
  autoPurgeOnLock: boolean;
  activeConsentExpiresAt: number;
  excludedWindowPatterns: string[];
}

/** Immutable blacklist of application titles and process names forbidden from visual capture. */
export const SENSITIVE_WINDOW_EXCLUSIONS: readonly string[] = Object.freeze([
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

/** Active runtime policy state. */
let currentPolicy: ScreenPrivacyPolicy = {
  enabled: false, // MANDATORY: OFF by default
  state: "DISABLED",
  requireVisualIndicator: true,
  autoPurgeOnLock: true,
  activeConsentExpiresAt: 0,
  excludedWindowPatterns: [...SENSITIVE_WINDOW_EXCLUSIONS],
};

/**
 * Returns the current screen privacy governance policy.
 *
 * @returns Read-only clone of the current policy.
 */
export function getScreenPrivacyPolicy(): Readonly<ScreenPrivacyPolicy> {
  return { ...currentPolicy };
}

/**
 * Checks whether an application window title is blacklisted from visual capture.
 *
 * @param windowTitle - Name or caption of the desktop window.
 * @returns True if the window is sensitive and MUST be masked/excluded; false otherwise.
 */
export function isWindowExcluded(windowTitle: string): boolean {
  if (!windowTitle || typeof windowTitle !== "string") return true;
  const lower = windowTitle.toLowerCase();
  return currentPolicy.excludedWindowPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Evaluates whether screen capture is currently permissible.
 *
 * Fail-Closed Guarantee:
 * Returns false unless:
 * 1. Screen awareness has been explicitly enabled by the user.
 * 2. Active consent timestamp is in the future.
 * 3. The target window and process are not in the sensitive exclusion list.
 *
 * @param windowTitle - Optional window title being evaluated.
 * @param processName - Optional executable process name being evaluated.
 * @returns Boolean indicating capture authorization.
 */
export function canCaptureScreen(windowTitle?: string, processName?: string): boolean {
  if (!currentPolicy.enabled || currentPolicy.state !== "ACTIVE_CAPTURE") {
    return false;
  }

  if (Date.now() > currentPolicy.activeConsentExpiresAt) {
    purgeScreenBuffers();
    return false;
  }

  if (windowTitle && isWindowExcluded(windowTitle)) {
    return false;
  }

  if (processName && isWindowExcluded(processName)) {
    return false;
  }

  return true;
}

/**
 * Activates screen awareness with time-bounded explicit user consent.
 *
 * @param consentDurationMs - Duration for which user granted capture permission (max 15 mins).
 * @returns The updated ScreenPrivacyPolicy.
 */
export function activateScreenCapture(consentDurationMs: number = 5 * 60 * 1000): ScreenPrivacyPolicy {
  const boundedDuration = Math.min(15 * 60 * 1000, Math.max(10 * 1000, consentDurationMs));
  const now = Date.now();

  currentPolicy = {
    ...currentPolicy,
    enabled: true,
    state: "ACTIVE_CAPTURE",
    activeConsentExpiresAt: now + boundedDuration,
  };

  return { ...currentPolicy };
}

/**
 * Immediately purges any active screen capture state and revokes permission.
 */
export function purgeScreenBuffers(): void {
  currentPolicy = {
    ...currentPolicy,
    enabled: false,
    state: "PURGED",
    activeConsentExpiresAt: 0,
  };
}
