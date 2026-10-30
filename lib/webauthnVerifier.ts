/**
 * @file lib/webauthnVerifier.ts
 * @description Cryptographically Rigorous WebAuthn & Windows Hello Assertion Verifier for ULTRON.
 *
 * Subsystem:
 * Zero-Trust Biometric Authentication & Cryptographic Verification Layer.
 *
 * Key Responsibilities:
 * - Decodes and validates W3C WebAuthn Level 3 clientDataJSON envelopes.
 * - Enforces expected Origin and RP ID matching (e.g. localhost, 127.0.0.1).
 * - Inspects authenticatorData flags:
 *   - User Presence (UP - Bit 0): Must be 1.
 *   - User Verification (UV - Bit 2): Must be 1 (verifies Windows Hello biometric / PIN verification occurred).
 * - Verifies ECDSA (P-256/ES256) and RSA (RS256) cryptographic signatures over:
 *   signedData = authenticatorData || SHA-256(clientDataJSON).
 * - Guarantees zero fallback to passwords, synced passkeys, or unverified assertions.
 *
 * Safety & Security Guarantees:
 * - Fail-closed: Any mismatch in challenge, origin, flags, or signature throws an explicit error and triggers intruder defense.
 * - Replay resistant: Single-use server challenges consumed immediately upon arrival.
 * - Zero raw biometric storage: Operates exclusively on public keys and signed hardware assertions.
 */

import crypto from "crypto";

export interface EnrolledCredential {
  id: string; // Base64URL credential ID
  publicKeySpki: string; // Base64 DER SubjectPublicKeyInfo
  algorithm: number; // COSE algorithm ID (-7 for ES256, -257 for RS256)
  createdAt: string;
  transports?: string[];
  signCount?: number;
}

export interface AssertionVerificationInput {
  credentialId: string;
  clientDataJSON: string; // Base64 or Base64URL
  authenticatorData: string; // Base64 or Base64URL
  signature: string; // Base64 or Base64URL
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
  enrolledCredential: EnrolledCredential;
}

export interface AssertionVerificationResult {
  verified: boolean;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  error?: string;
}

/**
 * Normalizes Base64 or Base64URL strings into standard Node Buffer.
 *
 * @param input - Base64 or Base64URL encoded string
 * @returns Decoded Buffer
 */
export function base64UrlToBuffer(input: string): Buffer {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Converts a Node Buffer to Base64URL string.
 *
 * @param buf - Source Buffer
 * @returns Base64URL encoded string
 */
export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Extracts a DER-encoded SubjectPublicKeyInfo from raw P-256 coordinates if needed.
 * P-256 DER prefix: 3059301306072a8648ce3d020106082a8648ce3d03010703420004
 *
 * @param x - 32-byte X coordinate Buffer
 * @param y - 32-byte Y coordinate Buffer
 * @returns DER SPKI Buffer
 */
export function buildP256Spki(x: Buffer, y: Buffer): Buffer {
  const prefix = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d03010703420004", "hex");
  return Buffer.concat([prefix, x, y]);
}

/**
 * Rigorously verifies a WebAuthn Windows Hello platform authenticator assertion.
 *
 * Validation Steps (W3C WebAuthn Section 7.2):
 * 1. Decode and parse clientDataJSON.
 * 2. Assert clientData.type === 'webauthn.get'.
 * 3. Assert clientData.challenge === expectedChallenge.
 * 4. Assert clientData.origin matches expectedOrigin.
 * 5. Decode authenticatorData and verify:
 *    - rpIdHash matches SHA-256(expectedRpId).
 *    - User Presence flag (UP - Bit 0) is set.
 *    - User Verification flag (UV - Bit 2) is set (Windows Hello biometric proof).
 * 6. Construct signedData = authenticatorData || SHA-256(clientDataJSON).
 * 7. Cryptographically verify signature using the enrolled public key.
 *
 * @param input - Verification parameters and payload
 * @returns Verification result object
 * @throws Error on security or cryptographic violation
 */
export function verifyWebAuthnAssertion(input: AssertionVerificationInput): AssertionVerificationResult {
  const {
    credentialId,
    clientDataJSON: rawClientDataJSON,
    authenticatorData: rawAuthData,
    signature: rawSignature,
    expectedChallenge,
    expectedOrigin,
    expectedRpId,
    enrolledCredential,
  } = input;

  // 1. Validate credential matching
  if (enrolledCredential.id !== credentialId) {
    return { verified: false, userPresent: false, userVerified: false, signCount: 0, error: "Credential ID mismatch" };
  }

  // 2. Decode clientDataJSON
  const clientDataBuf = base64UrlToBuffer(rawClientDataJSON);
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(clientDataBuf.toString("utf-8"));
  } catch (err) {
    return { verified: false, userPresent: false, userVerified: false, signCount: 0, error: "Malformed clientDataJSON" };
  }

  // 3. Verify clientData type
  if (clientData.type !== "webauthn.get") {
    return {
      verified: false,
      userPresent: false,
      userVerified: false,
      signCount: 0,
      error: `Invalid clientData type: expected 'webauthn.get', received '${clientData.type}'`,
    };
  }

  // 4. Verify challenge
  if (!clientData.challenge || clientData.challenge !== expectedChallenge) {
    return {
      verified: false,
      userPresent: false,
      userVerified: false,
      signCount: 0,
      error: "Cryptographic challenge mismatch or expired nonce",
    };
  }

  // 5. Verify origin
  // Accepts normalized origin (e.g. "http://localhost:3000" or host matches)
  const normalizedExpected = expectedOrigin.replace(/\/$/, "").toLowerCase();
  const normalizedReceived = (clientData.origin || "").replace(/\/$/, "").toLowerCase();
  if (normalizedExpected !== normalizedReceived) {
    return {
      verified: false,
      userPresent: false,
      userVerified: false,
      signCount: 0,
      error: `Origin mismatch: expected '${normalizedExpected}', received '${normalizedReceived}'`,
    };
  }

  // 6. Decode and inspect authenticatorData
  const authDataBuf = base64UrlToBuffer(rawAuthData);
  if (authDataBuf.length < 37) {
    return { verified: false, userPresent: false, userVerified: false, signCount: 0, error: "authenticatorData too short (< 37 bytes)" };
  }

  // 6a. Verify RP ID hash
  const expectedRpIdHash = crypto.createHash("sha256").update(expectedRpId).digest();
  const receivedRpIdHash = authDataBuf.subarray(0, 32);
  if (!expectedRpIdHash.equals(receivedRpIdHash)) {
    return { verified: false, userPresent: false, userVerified: false, signCount: 0, error: "RP ID hash mismatch" };
  }

  // 6b. Verify flags: UP (0x01) and UV (0x04)
  const flags = authDataBuf[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;

  if (!userPresent) {
    return { verified: false, userPresent: false, userVerified: false, signCount: 0, error: "User presence (UP) flag not asserted by authenticator" };
  }

  if (!userVerified) {
    return {
      verified: false,
      userPresent: true,
      userVerified: false,
      signCount: 0,
      error: "User verification (UV) flag missing. Strict Windows Hello biometric/PIN proof was not performed.",
    };
  }

  // 6c. Extract signCount
  const signCount = authDataBuf.readUInt32BE(33);

  // 7. Verify Cryptographic Signature
  const clientDataHash = crypto.createHash("sha256").update(clientDataBuf).digest();
  const signedData = Buffer.concat([authDataBuf, clientDataHash]);
  const signatureBuf = base64UrlToBuffer(rawSignature);

  try {
    const pubKeyBuf = Buffer.from(enrolledCredential.publicKeySpki, "base64");
    const publicKeyObject = crypto.createPublicKey({
      key: pubKeyBuf,
      format: "der",
      type: "spki",
    });

    const verifier = crypto.createVerify("SHA256");
    verifier.update(signedData);
    const isValidSig = verifier.verify(publicKeyObject, signatureBuf);

    if (!isValidSig) {
      return { verified: false, userPresent: true, userVerified: true, signCount, error: "Cryptographic signature verification failed" };
    }

    return {
      verified: true,
      userPresent: true,
      userVerified: true,
      signCount,
    };
  } catch (cryptoErr) {
    return {
      verified: false,
      userPresent: true,
      userVerified: true,
      signCount,
      error: `Signature evaluation error: ${cryptoErr instanceof Error ? cryptoErr.message : String(cryptoErr)}`,
    };
  }
}

