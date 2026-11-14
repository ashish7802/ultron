# ULTRON Phase 2 Key Migration & Preservation Report

## 1. Baseline Inventory & Integrity Verification

To adhere strictly to Rule 15 and user data preservation guarantees, cryptographic hashes and byte lengths were cataloged before and after all Phase 2 modifications:

| Artifact | Purpose | Size | Baseline SHA-256 | Post-Phase 2 SHA-256 | Preservation Status |
|---|---|---|---|---|---|
| `ultron_memory_vault.json` | User Memory Vault ("Ashish") | 29,103 bytes | `cfad9fbf6569db52c3f393a534b62fadc6ffea74ea87df9e1679efcd93d54bdc` | `cfad9fbf6569db52c3f393a534b62fadc6ffea74ea87df9e1679efcd93d54bdc` | **PRESERVED (100% Intact)** |
| `.vault_key` | Master Encryption Key | 64 bytes | `98957f647f5171b8e2bd4422e2ad606c9c600192af5a140cc4ec08aee3277cb3` | `98957f647f5171b8e2bd4422e2ad606c9c600192af5a140cc4ec08aee3277cb3` | **PRESERVED (100% Intact)** |
| `.security_vault/recovery.key` | Founder Recovery Key | 64 bytes | `d72d46d4e39392c855ad862aa878ddd9a2fbb1b47b76a875bdbe22860b294ab9` | `d72d46d4e39392c855ad862aa878ddd9a2fbb1b47b76a875bdbe22860b294ab9` | **PRESERVED (100% Intact)** |

---

## 2. Windows DPAPI Key Wrapping Architecture

To address Findings F-06 and F-16 (Master Key & Recovery Key Custody Hardening), sensitive key material is now bound to the active Windows user logon session and TPM using `CryptProtectData`:

1. **Master Key (`.vault_key` -> `.vault_key.dpapi`):**
   - When `getActiveMasterSecret()` is called, it checks for `.vault_key.dpapi`.
   - If present, `defaultDpapiBridge.unprotectSecret()` decrypts the blob in-memory without exposing plaintext keys to unauthorized external processes.
   - If only `.vault_key` exists, it loads the key and opportunistically generates `.vault_key.dpapi` with `0600` mode.
   - Plaintext `.vault_key` is retained so that fallback recovery is possible and existing processes do not crash.

2. **Founder Recovery Key (`recovery.key` -> `recovery.key.dpapi`):**
   - `getEffectiveRecoveryKey()` checks `.security_vault/recovery.key.dpapi`.
   - If present, unprotects via DPAPI bridge.
   - If plaintext `recovery.key` is present, it wraps and creates `recovery.key.dpapi` opportunistically.

3. **Fallback Guarantee:**
   - In containerized environments or Linux CI pipelines without Windows DPAPI, `DpapiBridge` automatically uses restricted file-permission fallback mode.

---

## 3. Cryptographic Confinement (F-08)

1. `LEGACY_MIGRATION_KEY` is documented and restricted to historical envelope decryption in `decryptPayload()`.
2. All new payload encryptions (`sealPayload()`) use dynamic keys derived from the master secret.
3. Prohibited static keys (`FOUNDER_RECOVERY_OVERRIDE_KEY`, `TEST_RECOVERY_KEY_ULTRON_FOUNDER`) are strictly rejected during recovery attempts.
