/**
 * @file app/api/security/auth/route.ts
 * @description Identity, Authentication & Windows Hello API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Identity & Authentication Subsystem (Module 1).
 *
 * Key Responsibilities:
 * - GET: Retrieves active session details, founder identity, and Windows Hello hardware status.
 * - POST: Handles login, logout, sensitive-action challenges, and native Windows Hello verification.
 *
 * Safety / Security Guarantees:
 * - Only callable from loopback origins (`localhost`, `127.0.0.1`).
 * - Employs HttpOnly SameSite=Strict cookies to protect against script theft.
 * - Zero raw biometric storage: biometrics verified strictly via OS UserConsentVerifier.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createAuthenticatedSession,
  validateSessionToken,
  revokeSession,
  revokeAllSessions,
  createSensitiveActionChallenge,
  verifySensitiveActionChallenge,
  elevateSessionWithBiometricChallenge,
  recordAuthFailure,
  resetAuthFailure,
  FOUNDER_IDENTITY,
  listActiveSessions,
} from "@/lib/security/identityEngine";
import {
  getWindowsHelloStatus,
  verifyWindowsHelloConsent,
} from "@/lib/security/windowsHelloBridge";
import { isSystemLockedDown } from "@/lib/security/emergencyEngine";
import { verifyRecoveryKey } from "@/lib/security/recoveryKey";

/**
 * Validates loopback origin to prevent CSRF / DNS rebinding.
 */
function isLoopbackRequest(req: NextRequest): boolean {
  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin") || "";
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) &&
    (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
}

/**
 * Handles GET requests: returns authentication status and Windows Hello readiness.
 */
export async function GET(req: NextRequest) {
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ ok: false, error: "Access Denied: Loopback origin required." }, { status: 403 });
  }

  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const sessionCheck = validateSessionToken(token);
  const windowsHello = await getWindowsHelloStatus();
  const lockedDown = isSystemLockedDown();

  const activeSessions = listActiveSessions();

  return NextResponse.json({
    ok: true,
    authenticated: sessionCheck.isValid,
    session: sessionCheck.session ? {
      sessionId: sessionCheck.session.sessionId,
      userId: sessionCheck.session.userId,
      userRole: sessionCheck.session.userRole,
      authenticationLevel: sessionCheck.session.authenticationLevel,
      expiresAt: sessionCheck.session.expiresAt,
    } : null,
    founder: FOUNDER_IDENTITY,
    windowsHello,
    isEmergencyLocked: lockedDown,
    activeSessionsCount: activeSessions.length,
    // Security Fix (SEC-004): Only expose session inventory details to authenticated sessions.
    activeSessions: sessionCheck.isValid ? activeSessions : [],
  });
}

/**
 * Handles POST requests: login, logout, challenges, and Windows Hello prompts.
 */
export async function POST(req: NextRequest) {
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ ok: false, error: "Access Denied: Loopback origin required." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "login": {
        const { authMethod, recoveryKey, promptReason } = body;
        const clientIp = req.headers.get("x-forwarded-for") || "127.0.0.1";

        // Check progressive rate limiting / lockout
        const lockoutCheck = recordAuthFailure(clientIp);
        if (lockoutCheck.isLockedOut) {
          return NextResponse.json(
            { ok: false, error: "Too many consecutive authentication failures. Client temporarily locked out." },
            { status: 429 }
          );
        }

        let bioResult: Awaited<ReturnType<typeof verifyWindowsHelloConsent>> | undefined = undefined;

        if (authMethod === "recovery_key") {
          // Cryptographic founder recovery passphrase verification
          if (!recoveryKey || typeof recoveryKey !== "string" || !verifyRecoveryKey(recoveryKey)) {
            return NextResponse.json(
              { ok: false, error: "Authentication Failed: Invalid founder recovery passphrase." },
              { status: 401 }
            );
          }
          resetAuthFailure(clientIp);
        } else {
          // Mandatory Genuine OS-Backed User Verification via Windows Hello (Finding F-01)
          const prompt = promptReason || "ULTRON Founder Security Gate: Verify biometric identity.";
          bioResult = await verifyWindowsHelloConsent(prompt);

          if (!bioResult.success || bioResult.result !== "Verified") {
            return NextResponse.json(
              {
                ok: false,
                error: bioResult.message || `Biometric verification failed (${bioResult.result}).`,
                result: bioResult.result,
              },
              { status: 401 }
            );
          }

          resetAuthFailure(clientIp);
        }

        const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId, {
          biometricResult: bioResult,
          recoveryKey: authMethod === "recovery_key" ? recoveryKey : undefined,
        });
        const resp = NextResponse.json({
          ok: true,
          message: "Authenticated successfully as Founder.",
          session: {
            sessionId: session.sessionId,
            sessionToken: session.sessionToken,
            userRole: session.userRole,
            expiresAt: session.expiresAt,
            lastBiometricVerificationAt: session.lastBiometricVerificationAt,
          },
        });

        // Set HttpOnly SameSite=Strict cookie
        resp.cookies.set("ultron_session", session.sessionToken, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 24 * 60 * 60,
        });

        return resp;
      }

      case "logout": {
        const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
        if (token) {
          revokeSession(token, "User logged out");
        }
        const resp = NextResponse.json({ ok: true, message: "Logged out successfully." });
        resp.cookies.delete("ultron_session");
        return resp;
      }

      case "revoke_session": {
        const callerToken = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const auth = validateSessionToken(callerToken);
        if (!auth.isValid || !auth.session) {
          return NextResponse.json({ ok: false, error: "Authentication required to revoke sessions." }, { status: 401 });
        }

        const { targetToken } = body;
        if (!targetToken || typeof targetToken !== "string") {
          return NextResponse.json({ ok: false, error: "targetToken required." }, { status: 400 });
        }

        // Only Founder, Admin, or the session owner can revoke a session
        const isOwner = auth.session.sessionToken === targetToken;
        const isPrivileged = auth.session.userRole === "founder" || auth.session.userRole === "admin";
        if (!isOwner && !isPrivileged) {
          return NextResponse.json({ ok: false, error: "Forbidden: Cannot revoke another user's session." }, { status: 403 });
        }

        const success = revokeSession(targetToken, `Revoked by ${auth.session.userId} via Session Management HUD`);
        return NextResponse.json({ ok: success });
      }

      case "revoke_all_sessions": {
        const callerToken = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const auth = validateSessionToken(callerToken);
        if (!auth.isValid || !auth.session) {
          return NextResponse.json({ ok: false, error: "Authentication required to revoke sessions." }, { status: 401 });
        }

        if (auth.session.userRole !== "founder" && auth.session.userRole !== "admin") {
          return NextResponse.json({ ok: false, error: "Forbidden: Only Founder or Admin can perform global session revocation." }, { status: 403 });
        }

        const count = revokeAllSessions(`Global Session Revocation by ${auth.session.userId}`);
        return NextResponse.json({ ok: true, revokedCount: count });
      }

      case "challenge": {
        const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
        const auth = validateSessionToken(token);
        if (!auth.isValid) {
          return NextResponse.json({ ok: false, error: "Authentication required to request challenge." }, { status: 401 });
        }

        const { targetAction, resource, method } = body;
        const challenge = createSensitiveActionChallenge(
          targetAction || "sensitive_action",
          resource || "system",
          method || "windows_hello"
        );

        return NextResponse.json({ ok: true, challenge });
      }

      case "verify_challenge": {
        const { challengeId, proof } = body;
        const result = await verifySensitiveActionChallenge(challengeId, proof);
        return NextResponse.json({ ok: result.success, error: result.error });
      }

      case "windows_hello_verify": {
        const { promptReason } = body;
        const bioResult = await verifyWindowsHelloConsent(promptReason || "ULTRON Security Authorization");
        return NextResponse.json({ ok: bioResult.success, result: bioResult });
      }

      case "elevate_founder": {
        const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
        if (!token) {
          return NextResponse.json({ ok: false, error: "Authentication token required." }, { status: 401 });
        }
        const { challengeId, proof } = body;
        const result = elevateSessionWithBiometricChallenge(token, challengeId, proof);
        if (!result.success) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
        }
        return NextResponse.json({
          ok: true,
          message: "Session elevated to Founder Authorized.",
          session: {
            sessionId: result.session?.sessionId,
            userRole: result.session?.userRole,
            authenticationLevel: result.session?.authenticationLevel,
            lastBiometricVerificationAt: result.session?.lastBiometricVerificationAt,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unrecognized action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Auth error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
