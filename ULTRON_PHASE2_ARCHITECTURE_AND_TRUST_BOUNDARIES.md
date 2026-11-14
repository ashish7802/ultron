# ULTRON Phase 2 Architecture & Trust Boundaries

```mermaid
flowchart TD
    subgraph ClientUI["Client Layer (Browser & Electron Frontend)"]
        UI["UltronChat & UI Components"]
        SessionCookie["Session Token (Bearer / Header)"]
    end

    subgraph PerimeterGateway["Security Perimeter & Gateways"]
        OriginGate["Origin Gate (Loopback & CSRF Checks)"]
        SessionGate["SessionGate (Validation & Rate Limiting)"]
        AuthLevelGate["AuthenticationLevel Check (F-01/F-11)"]
    end

    subgraph CoreServices["Subsystem Engines"]
        PermGateway["PermissionGateway (F-02, F-04)"]
        EmergencyEng["EmergencyEngine (F-10)"]
        IdentEng["IdentityEngine (F-01)"]
        MemMgr["MemoryManager & Coordinator"]
    end

    subgraph CustodyLayer["Cryptographic Custody & Storage (F-06, F-07, F-16)"]
        PathService["AppPathService (UserData Isolation)"]
        DPAPI["Windows DPAPI Bridge (win32crypt)"]
        EncVault["ultron_memory_vault.json (AES-256-GCM)"]
        DPAPIKeys[".vault_key.dpapi & recovery.key.dpapi"]
    end

    subgraph ExecutionSubprocess["OS Execution Boundary (F-03, F-15)"]
        PythonBridge["Python Bridge (Stdin Stream)"]
        FSDriver["Filesystem Driver (Backup & Overwrite HMAC Gate)"]
        AppDriver["Application Launcher (Parameter Bound)"]
    end

    UI -->|HTTP / API Call| OriginGate
    OriginGate --> SessionGate
    SessionGate --> AuthLevelGate

    AuthLevelGate -->|Founder / Operator Authorized| PermGateway
    AuthLevelGate -->|Authorized Recovery| EmergencyEng
    AuthLevelGate -->|Interactive Chat| MemMgr

    PermGateway -->|Cryptographic Grant HMAC| PythonBridge
    PythonBridge --> FSDriver
    PythonBridge --> AppDriver

    MemMgr --> PathService
    DPAPI --> PathService
    PathService --> EncVault
    PathService --> DPAPIKeys
```

---

## Trust Boundaries & Security Enforcements

### 1. The Network / Client Boundary
- **Threat:** Malicious web page making cross-origin requests to local port 3000.
- **Defense:** Strict origin validation blocks non-loopback domains; `sec-fetch-site === "cross-site"` requests are rejected with HTTP 403 Forbidden.

### 2. The Identity & Role Boundary (F-01, F-11)
- **Threat:** Normal loopback bootstrap session attempting to approve privileged OS actions without biometric founder authorization.
- **Defense:** Bootstrap session is locked to `userRole: "operator"` and `authenticationLevel: "CHAT_AUTHENTICATED"`. Approving execution plans on `/api/permission` requires `founder` or elevated role.

### 3. The Execution Boundary (F-03, F-15)
- **Threat:** Internal Node.js or compromised code calling Python driver directly to overwrite files or launch arbitrary commands.
- **Defense:** Python bridge verifies cryptographic execution grant tokens containing SHA-256 parameter hashes, strict TTL, and HMAC signatures.

### 4. The Key Custody Boundary (F-06, F-07, F-16)
- **Threat:** Untrusted non-elevated process reading plaintext keys from disk.
- **Defense:** Keys are protected via Windows DPAPI (`CryptProtectData`), binding secrets to the user's logon session and machine TPM.
