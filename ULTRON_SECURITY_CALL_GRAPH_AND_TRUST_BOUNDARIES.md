# ULTRON Security Call Graph & Trust Boundaries

**Repository:** `https://github.com/ashish7802/ultron`  
**Audit Baseline Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Working Branch:** `fix/phase1-security-invariants`  
**Date:** 2026-11-14

---

## 1. Authentication & Session Trust Boundary

```mermaid
flowchart TD
    subgraph Client Layer
        UI[UltronChat Web UI]
        API_CALLER[Local Script / API Client]
    end

    subgraph Authentication Gateways
        BOOTSTRAP["/api/auth/session (GET)"]
        AUTH_LOGIN["/api/security/auth (POST 'login')"]
    end

    subgraph Security Engines
        SESSION_GATE["lib/sessionGate.ts<br>(getOrCreatePrimarySessionToken)"]
        IDENTITY_ENGINE["lib/security/identityEngine.ts<br>(createAuthenticatedSession)"]
        WIN_HELLO["ultron_engine/windows_hello.py<br>(Windows Hello Biometrics)"]
    end

    subgraph Protected Endpoints
        CHAT_API["/api/chat"]
        PERM_API["/api/permission"]
        MEM_API["/api/memory"]
    end

    UI -->|1. Mount Bootstrap| BOOTSTRAP
    BOOTSTRAP -->|Issues Token without Biometrics| SESSION_GATE
    SESSION_GATE -.->|Returns ultron_session Cookie| UI

    UI -->|2. Optional Explicit Founder Login| AUTH_LOGIN
    AUTH_LOGIN -->|Triggers Consent UI| WIN_HELLO
    WIN_HELLO -->|Verified| IDENTITY_ENGINE
    IDENTITY_ENGINE -->|Creates Founder Session| AUTH_LOGIN

    UI -->|3. Interacts with System| CHAT_API
    UI -->|4. Submits Plan Approvals| PERM_API
    CHAT_API -->|Validates Token| SESSION_GATE
    PERM_API -->|Validates Token| SESSION_GATE
```

### Architectural Finding (F-01 Trust Boundary)
- **Primary Chat & Computer Route Gate:** Protected by `sessionGate.ts:validateDesktopSession()`. This requires loopback origin, anti-CSRF headers, and a valid `ultron_session` cookie issued via `/api/auth/session` (bootstrap).
- **Founder Identity Gate:** Windows Hello biometrics are enforced on `/api/security/auth` (and sensitive security vault unlocks). However, chat interactions and computer action execution do NOT require Windows Hello biometrics on every startup; loopback session bootstrap grants access to `/api/chat` and `/api/permission`.

---

## 2. Action Authorization & Execution Lifecycle (F-02, F-04, F-15)

```mermaid
sequenceDiagram
    autonumber
    actor Founder as Founder / User
    participant Chat as components/UltronChat.tsx
    participant ChatAPI as app/api/chat/route.ts
    participant Registry as lib/computer/toolRegistry.ts
    participant Gateway as lib/permissionGateway.ts
    participant PermRoute as app/api/permission/route.ts
    participant OS as Host OS / Python Engine

    Founder->>Chat: Enters command ("launch notepad")
    Chat->>ChatAPI: POST /api/chat { message }
    ChatAPI->>Registry: executeTool("launch_application", { appName: "notepad" })
    Registry->>Registry: Check riskLevel === "high" || actionType === "app_launch"
    Registry->>Gateway: planAction("app_launch", "notepad", params)
    Gateway-->>Registry: Returns ActionPlan (planId, actionHash, approvalToken)
    Registry-->>ChatAPI: Returns { requiresPlan: true, permissionPlan }
    ChatAPI-->>Chat: Returns Permission Card with approvalToken
    
    Note over Founder,Chat: Founder inspects parameters and clicks "Approve"
    
    Chat->>PermRoute: POST /api/permission { planId, action: "approve", approvalToken }
    PermRoute->>Gateway: approveActionPlan(planId, approvalToken)
    Gateway->>Gateway: Single-use check: wipe approvalToken to ""
    Gateway-->>PermRoute: Returns executionGrantToken
    
    PermRoute->>Gateway: executeApprovedAction(planId, grantToken, executor, runtimeParams)
    Gateway->>Gateway: Assert runtimeHash(runtimeParams) === plan.actionHash
    alt Hash mismatch (F-15 Attack)
        Gateway-->>PermRoute: Abort! "Runtime parameter tampering detected"
    else Hash matches
        Gateway->>Registry: tool.execute(params, execContext)
        Registry->>OS: Execute physical process / command
        OS-->>Registry: Return execution result
        Registry-->>Gateway: Result object { success, exitCode, verified }
        Gateway->>Gateway: Deep outcome inspection (F-04)
        Gateway-->>PermRoute: Final verified outcome { success: true/false }
    end
    PermRoute-->>Chat: HTTP 200/500 JSON response with execution details
    Chat-->>Founder: Renders Verified Completion or Error Notice
```

---

## 3. Cryptographic Subprocess File Overwrite Boundary (F-03)

```mermaid
flowchart LR
    subgraph TypeScript Core
        TR[toolRegistry.ts]
        PG[permissionGateway.ts]
        FSI[fileSystemIntelligence.ts]
        PB[pythonBridge.ts]
    end

    subgraph Native Python Process
        CLI[computer_intelligence_cli.py]
        FSD[filesystem_driver.py]
        VAULT[(recovery.key in .security_vault)]
        NONCES[(.consumed_grants.log)]
    end

    subgraph Host Filesystem
        TARGET_FILE[(Target Physical File)]
        BACKUP[(backups/filesystem/*.bak)]
    end

    TR -->|1. Overwrite Requested| PG
    PG -->|2. Generate HMAC Grant| PG
    PG -->|3. { token: planId|op|path|exp|nonce|sig }| TR
    TR -->|4. writeFile(path, content, overwrite, grant)| FSI
    FSI -->|5. JSON Payload via Stdin| PB
    PB -->|6. Spawns Subprocess| CLI
    CLI -->|7. write_file(path, content, grant)| FSD
    
    FSD -->|8. Read Founder Secret| VAULT
    FSD -->|9. Verify HMAC-SHA256 & Canonical Path| FSD
    FSD -->|10. Check Nonce not in| NONCES
    
    alt Grant Invalid / Spoofed Boolean
        FSD -->|BLOCKED| CLI
        CLI -->|Error JSON| PB
    else Grant Authenticated
        FSD -->|11. Create Rolling Backup| BACKUP
        FSD -->|12. Commit Atomic Write| TARGET_FILE
        FSD -->|13. Record Nonce| NONCES
        FSD -->|14. Success JSON| CLI
    end
```

---

## 4. Key Storage & Encryption Trust Boundaries (F-06, F-08, F-16)

| Asset / Storage Path | Storage Format | Encryption / Protection | Threat Boundary & Access Rules |
| :--- | :--- | :--- | :--- |
| `.vault_key` | Raw 64-char Hex (UTF-8) | **None** (Filesystem ACLs only) | Readable by any process running as the current Windows user. Not DPAPI-encrypted in TypeScript. |
| `.security_vault/recovery.key` | Raw 64-char Hex (UTF-8) | **None** (0600 mode on Unix; normal ACL on Windows) | Plaintext founder recovery key. Used for HMAC-SHA256 signing of subprocess grants and emergency recovery. |
| `ultron_memory_vault.json` | AES-256-GCM Envelope | Key derived from `.vault_key` or `ULTRON_MASTER_KEY` | Encrypted at rest. However, any local process under same user can read `.vault_key` and decrypt the vault. |
| `ultron_engine/secure_vault.py` | Binary (`vault.bin`) | **Windows DPAPI** (`win32crypt`) | Used by Python engine for OS-bound key storage. Distinct from Node.js `.vault_key`. |
| Legacy Fallback Key | Static String in Code | Hardcoded in `lib/crypto.ts` | Dead code in new writes, but exists in fallback decryption branches for legacy migration. |
