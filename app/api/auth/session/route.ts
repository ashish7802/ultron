/**
 * @file app/api/auth/session/route.ts
 * @description Local Desktop Session Handshake & Token Dispenser API for ULTRON.
 *
 * Subsystem:
 * Boundary Security & Authentication Lifecycle.
 *
 * Key Responsibilities:
 * - GET: Preserves a valid session or initializes the desktop session for the local UI on loopback.
 * - Sets an HttpOnly, SameSite=Strict cookie `ultron_session` to protect against script theft.
 * - Enforces loopback Origin verification (rejects any foreign origin trying to get tokens).
 * - Issues short-lived action tokens for high-risk operations upon valid session verification.
 *
 * Architectural Role & Interactions:
 * - Handshakes with `components/UltronOrb.tsx`, `components/UltronChat.tsx`, and Electron.
 * - Managed by `lib/sessionGate.ts`.
 *
 * Safety / Security Guarantees:
 * - Only callable from loopback origins (`localhost:3000`, `127.0.0.1:3000`).
 * - Rejects any cross-site request forgery attempt.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreatePrimarySessionToken,
  validateDesktopSession,
  createSingleUseActionToken,
  createAuthErrorResponse,
} from "@/lib/sessionGate";

/**
 * Handles GET requests to initialize or retrieve the desktop session token.
 *
 * @param req - Incoming NextRequest.
 * @returns NextResponse with session status and secure cookie.
 */
export async function GET(req: NextRequest) {
  // Validate that request originated from valid local origin (loopback)
  const validation = validateDesktopSession(req, { allowBootstrap: true });
  if (!validation.valid) {
    return createAuthErrorResponse(validation);
  }

  const providedToken =
    req.headers.get("x-ultron-session-token") ||
    req.cookies.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const existingSession = providedToken ? validateDesktopSession(req) : null;
  const reuseExistingSession = Boolean(providedToken && existingSession?.valid);
  const token =
    providedToken && existingSession?.valid
      ? providedToken
      : getOrCreatePrimarySessionToken();

  const response = NextResponse.json({
    ok: true,
    ...(!reuseExistingSession ? { sessionToken: token } : {}),
    expiresInMs: 24 * 60 * 60 * 1000,
    domain: "localhost",
  });

  // Set secure SameSite=Strict cookie
  response.cookies.set("ultron_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  return response;
}

/**
 * Handles POST requests to request a short-lived single-use action token.
 *
 * @param req - NextRequest containing JSON `{ action: string }`.
 * @returns NextResponse with action token.
 */
export async function POST(req: NextRequest) {
  const validation = validateDesktopSession(req);
  if (!validation.valid) {
    return createAuthErrorResponse(validation);
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json({ ok: false, error: "Action identifier is required" }, { status: 400 });
    }

    const actionToken = createSingleUseActionToken(action);

    return NextResponse.json({
      ok: true,
      actionToken,
      action,
      expiresInMs: 2 * 60 * 1000,
    });
  } catch (err) {
    console.error("[AUTH SESSION] Error issuing action token:", err);
    return NextResponse.json({ ok: false, error: "Failed to issue action token" }, { status: 500 });
  }
}
