/**
 * @file lib/security/credentialEngine.ts
 * @description Centralized Credential & Secret Protection Vault for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Credential & Secret Protection Subsystem (Module 5).
 *
 * Key Responsibilities:
 * - Securely stores, retrieves, rotates, and revokes sensitive credentials (API keys, tokens).
 * - Enforces zero plaintext persistence: all credentials are encrypted at rest with AES-256-GCM
 *   and authenticated encryption tags.
 * - Integrates with Windows DPAPI master key derivation from `ultron_engine/secure_vault.py`.
 * - Restricts secret access strictly to authorized roles (e.g. `founder`).
 * - Generates sanitized credential metadata (never exposing plaintext secrets).
 * - Provides automated secret redaction so stored secrets can be scrubbed from text and logs.
 *
 * Architectural Role & Interactions:
 * - Protects third-party AI keys (OpenAI, Anthropic, Gemini, Groq, Tavily, GitHub).
 * - Integrated with `lib/security/privacyEngine.ts` for automated text redaction.
 *
 * Safety / Security Guarantees:
 * - No raw secrets in logs: metadata uses SHA-256 fingerprints.
 * - Authenticated encryption: 96-bit CSPRNG nonces and 128-bit GCM authentication tags.
 * - Atomic persistence: secrets file is written atomically to prevent truncation.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getActiveMasterSecret } from "../crypto.ts";
import type {
  CredentialMetadata,
  EncryptedSecretRecord,
  UserRole,
} from "./types.ts";

/** Storage path for encrypted credential vault. */
const CREDENTIAL_VAULT_FILE = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault",
  "credentials_vault.enc.json"
);

/** Active in-memory encrypted secret records mapped by secretId. */
const secretRecords = new Map<string, EncryptedSecretRecord>();

/** Known plaintext secrets cache kept in memory strictly for log redaction. */
const knownSecretsForRedaction = new Set<string>();

/**
 * Derives a dynamic 256-bit AES key for credential vault encryption from platform master secret.
 *
 * @returns 32-byte Buffer key.
 */
function getVaultKey(): Buffer {
  const masterSecret = getActiveMasterSecret();
  return crypto.scryptSync(masterSecret, "ULTRON_CREDENTIAL_VAULT_SALT_V1", 32);
}

/**
 * Initializes and loads the encrypted credential vault from disk.
 */
function initializeVault(): void {
  try {
    const dir = path.dirname(CREDENTIAL_VAULT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(CREDENTIAL_VAULT_FILE)) {
      const raw = fs.readFileSync(CREDENTIAL_VAULT_FILE, "utf-8");
      const list: EncryptedSecretRecord[] = JSON.parse(raw);
      for (const rec of list) {
        secretRecords.set(rec.secretId, rec);
      }
    }
  } catch (err) {
    console.warn("[CREDENTIAL ENGINE] Failed to load credential vault from disk:", err);
  }
}

initializeVault();

/**
 * Persists the encrypted credentials vault atomically.
 */
function persistVault(): void {
  try {
    const dir = path.dirname(CREDENTIAL_VAULT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${CREDENTIAL_VAULT_FILE}.tmp.${crypto.randomBytes(4).toString("hex")}`;
    const list = Array.from(secretRecords.values());
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), "utf-8");
    fs.renameSync(tempFile, CREDENTIAL_VAULT_FILE);
  } catch (err) {
    console.error("[CREDENTIAL ENGINE] Failed to persist credentials vault:", err);
  }
}

/**
 * Computes an irreversible SHA-256 fingerprint of a secret for rotation tracking.
 *
 * @param secret - Plaintext secret string.
 * @returns 16-character hex fingerprint.
 */
function computeSecretFingerprint(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf-8").digest("hex").slice(0, 16);
}

/**
 * Stores or updates a sensitive credential inside the authenticated vault.
 *
 * @param name - Human-readable label (e.g. "OPENAI_API_KEY", "GITHUB_TOKEN").
 * @param secretValue - Plaintext secret value.
 * @param category - Classification of secret.
 * @param actorRole - Role of actor saving the credential (must be "founder").
 * @param allowedRoles - Roles permitted to retrieve the decrypted secret.
 * @returns CredentialMetadata (excluding the plaintext secret).
 */
export function storeCredential(
  name: string,
  secretValue: string,
  category: CredentialMetadata["category"] = "api_key",
  actorRole: UserRole = "founder",
  allowedRoles: UserRole[] = ["founder"]
): { success: boolean; metadata?: CredentialMetadata; error?: string } {
  if (actorRole !== "founder") {
    return { success: false, error: "Access Denied: Only the founder may store credentials." };
  }

  if (!secretValue || secretValue.trim().length === 0) {
    return { success: false, error: "Secret value cannot be empty." };
  }

  const cleanName = name.trim().toUpperCase();
  const secretId = `sec_${crypto.createHash("sha256").update(cleanName).digest("hex").slice(0, 12)}`;
  const now = Date.now();

  // Encrypt with AES-256-GCM
  const key = getVaultKey();
  const iv = crypto.randomBytes(12); // 96-bit CSPRNG IV
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encryptedBuf = Buffer.concat([cipher.update(secretValue, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const metadata: CredentialMetadata = {
    secretId,
    name: cleanName,
    category,
    createdAt: secretRecords.has(secretId) ? secretRecords.get(secretId)!.metadata.createdAt : now,
    lastRotatedAt: now,
    isRevoked: false,
    isDPAPIProtected: process.platform === "win32",
    allowedRoles,
    fingerprint: computeSecretFingerprint(secretValue),
  };

  const record: EncryptedSecretRecord = {
    secretId,
    metadata,
    encryptedBlob: encryptedBuf.toString("base64"),
    nonce: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };

  secretRecords.set(secretId, record);
  knownSecretsForRedaction.add(secretValue.trim());
  persistVault();

  return { success: true, metadata };
}

/**
 * Retrieves and decrypts a credential from the vault.
 *
 * @param secretIdOrName - Identifier or name of the secret.
 * @param actorRole - Current role of requesting actor.
 * @returns Plaintext secret or error.
 */
export function retrieveCredential(
  secretIdOrName: string,
  actorRole: UserRole
): { success: boolean; secret?: string; error?: string } {
  const query = secretIdOrName.trim().toUpperCase();
  const record = Array.from(secretRecords.values()).find(
    (r) => r.secretId === query.toLowerCase() || r.metadata.name === query
  );

  if (!record) {
    return { success: false, error: `Credential "${secretIdOrName}" not found.` };
  }

  if (record.metadata.isRevoked) {
    return { success: false, error: `Credential "${record.metadata.name}" has been revoked.` };
  }

  if (!record.metadata.allowedRoles.includes(actorRole)) {
    return {
      success: false,
      error: `Access Denied: Role "${actorRole}" is not authorized to retrieve "${record.metadata.name}".`,
    };
  }

  try {
    const key = getVaultKey();
    const iv = Buffer.from(record.nonce, "base64");
    const authTag = Buffer.from(record.authTag, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.encryptedBlob, "base64")),
      decipher.final(),
    ]).toString("utf-8");

    return { success: true, secret: decrypted };
  } catch (err) {
    return {
      success: false,
      error: `Decryption failure or authentication tag mismatch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Revokes a credential immediately.
 *
 * @param secretIdOrName - Secret identifier or name.
 * @param actorRole - Requesting role (must be "founder").
 * @returns Boolean success flag.
 */
export function revokeCredential(secretIdOrName: string, actorRole: UserRole): boolean {
  if (actorRole !== "founder") return false;

  const query = secretIdOrName.trim().toUpperCase();
  const record = Array.from(secretRecords.values()).find(
    (r) => r.secretId === query.toLowerCase() || r.metadata.name === query
  );

  if (!record) return false;

  record.metadata.isRevoked = true;
  persistVault();
  return true;
}

/**
 * Lists all credential metadata without revealing raw secret values.
 *
 * @returns Array of CredentialMetadata.
 */
export function listCredentialMetadata(): CredentialMetadata[] {
  return Array.from(secretRecords.values()).map((r) => ({ ...r.metadata }));
}

/**
 * Redacts any known registered secrets from a target text or log string.
 *
 * @param text - Input text.
 * @returns Redacted text with "[REDACTED_SECRET]" in place of raw secrets.
 */
export function redactKnownSecrets(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const secret of knownSecretsForRedaction) {
    if (secret && secret.length >= 8 && result.includes(secret)) {
      result = result.split(secret).join("[REDACTED_SECRET]");
    }
  }
  return result;
}
