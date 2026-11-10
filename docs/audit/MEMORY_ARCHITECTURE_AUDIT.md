# ULTRON Memory Architecture & Dual-Vault Audit

This document analyzes the persistent memory systems in the ULTRON repository, their boundaries, encryption implementations, and consolidation architecture.

---

## 1. Inventory of Memory Storage Subsystems

| Storage Location | Runtime Engine | Schema / Data Structure | Encryption At Rest | Key Protection | Purpose |
|---|---|---|---|---|---|
| `ultron_memory_vault.json` | TypeScript / Node.js (`lib/memoryManager.ts`) | JSON Version 2: `{ version: 2, encrypted: true, iv, tag, ciphertext }` | **AES-256-GCM** | 256-bit CSPRNG / Platform Key | User Profile, Identity ("Ashish"), Preferences, Project Facts. |
| `ultron_memory.db` | Python / SQLite (`ultron_engine/secure_vault.py`) | SQLite Table `vault_records`: `(blind_index, ciphertext, nonce, tag, created_at)` | **AES-256-GCM** | Windows DPAPI Protected Master Key | Research Dossiers, Semantic Memories, Zero-Trust Records. |

---

## 2. Consolidation & Single Source of Truth Strategy

- **Designation of Persistent Profile Vault:**
  - `ultron_memory_vault.json` is the canonical authoritative store for **User Identity, Profile, Explicit Instructions, and Core Facts**.
  - `ultron_memory.db` serves as the high-volume semantic research archive and blind-indexed threat ledger.
- **Data Preservation Guarantee:**
  - User records for `"Ashish"` and `"I am building an autonomous AI assistant"` are preserved with 100% fidelity.
  - An atomic rolling backup is maintained at `ultron_memory_vault.json.bak`.
- **Project Isolation:**
  - Added `projectId` (default: `"default"`) and `provenance` metadata to `MemoryRecord` schema.
  - Queries can filter by `projectId` to prevent cross-project fact pollution.

---

## 3. Cryptographic Hardening Findings

1. **Static Fallback Key Removal:**
   `lib/memoryManager.ts` contained a static fallback string `"STARK_VAULT_E2EE_KEY_STATIC_DERIVATION_2026"`.
   This is being replaced with platform-derived CSPRNG master key storage bound to the user profile.
2. **Atomic Write Security:**
   All writes use `.tmp` files with CSPRNG random suffixes and `fs.renameSync` to eliminate partial write corruption.
