# ULTRON Cryptographic Key Management & Storage Architecture

## Overview
ULTRON enforces End-to-End Encryption (E2EE) and Authenticated Encryption with Associated Data (AEAD) across memory storage at rest and IPC transport.

---

## 1. Cryptographic Primitives

| Component | Primitive | Key Derivation / Protection | Nonce / IV | Integrity Tag |
|---|---|---|---|---|
| **Python SecureVault** | AES-256-GCM | Windows DPAPI (Host & User Bound) | 96-bit CSPRNG | 128-bit GCM MAC |
| **Next.js Transport** | AES-256-GCM | CSPRNG In-Process / Ephemeral Master Key | 96-bit CSPRNG | 128-bit WebCrypto Tag |
| **Memory Vault (`.json`)** | AES-256-GCM | SHA-256 Derived Platform Key | 96-bit CSPRNG | 128-bit Auth Tag |
| **Deduplication** | HMAC-SHA256 | Blind Indexing Hashing | N/A | 256-bit Digest |

---

## 2. Hardcoded Secret Elimination

- Previously, `lib/crypto.ts` contained a static string `STARK_ULTRON_MARK_LXXXV_OMEGA_SEC_256BIT_KEY`.
- In this remediation, all hardcoded secrets were removed from production key derivation.
- Active master transport keys are generated using CSPRNG (`crypto.getRandomValues`) or loaded from `process.env.ULTRON_MASTER_KEY`.
- Legacy keys are preserved strictly as fallback decoders during unsealing of historical envelopes to prevent migration data loss.

---

## 3. Tamper Resistance & Recovery

- Any 1-bit modification to ciphertext or authentication tag results in immediate rejection (`InvalidTag` / `StarkShield: Envelope invalid`).
- The persistent memory vault maintains an atomic rolling backup (`ultron_memory_vault.json.bak`) prior to writing version 2 ciphertext envelopes.
