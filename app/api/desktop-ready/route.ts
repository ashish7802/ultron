/**
 * @file app/api/desktop-ready/route.ts
 * @description Authenticates Electron's embedded Next.js server during startup.
 *
 * Responsibilities:
 * - Signs a fresh challenge using a secret injected only into the child process.
 * - Allows Electron to distinguish ULTRON from an unrelated service on loopback.
 *
 * Safety guarantees:
 * - The secret is never returned, logged, or exposed to the renderer.
 * - Invalid requests receive no signature.
 */

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Responds only when Electron's challenge is well-formed and the child secret exists.
 *
 * @param request - Challenge request from the Electron main process.
 * @returns A no-content response carrying an HMAC signature, or 404.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const challenge = request.headers.get("x-ultron-challenge") || "";
  const secret = process.env.ULTRON_DESKTOP_STARTUP_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(challenge)) {
    return new NextResponse(null, { status: 404 });
  }

  const signature = createHmac("sha256", secret).update(challenge).digest("hex");
  return new NextResponse(null, {
    status: 204,
    headers: { "X-Ultron-Ready": signature, "Cache-Control": "no-store" },
  });
}
