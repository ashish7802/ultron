# ULTRON Local Desktop Authentication & Session Lifecycle

## Architectural Overview

ULTRON is an autonomous local-first cybernetic intelligence running as an Electron desktop host with a Next.js presentation frontend (`localhost:3000`) and a local Python FastAPI backend (`127.0.0.1:8000`).

To protect against Cross-Site Request Forgery (CSRF), malicious websites querying loopback services, and unauthorized IPC triggers, ULTRON enforces a strict local desktop boundary.

```mermaid
flowchart TD
    Client[Browser / Electron Window] -->|Origin: localhost:3000| SG[SessionGate (lib/sessionGate.ts)]
    Foreign[Untrusted Website: evil.com] -->|Origin: evil.com / Sec-Fetch-Site: cross-site| SG
    SG -->|Reject 403 Forbidden| Drop[Immediate Drop]
    SG -->|Validate X-ULTRON-Session-Token| API[API Endpoints]
```

---

## 1. Trust Boundaries & Network Perimeter

- **Loopback-Only Binding:** All services bind strictly to `127.0.0.1` and `localhost`. External network binding is forbidden.
- **Origin & Referer Gating:** Permitted origins are strictly matched against `^https?://(localhost|127\.0\.0\.1)(:\d{1,5})?$`. Untrusted external origins receive an immediate HTTP 403 Forbidden.
- **Sec-Fetch-Site Enforcement:** Any request marked with `Sec-Fetch-Site: cross-site` is rejected to prevent CSRF.

---

## 2. Token Lifecycle

1. **Bootstrap Handshake (`GET /api/auth/session`):**
   - Issued to local loopback UI during application initialization.
   - Generates a 256-bit CSPRNG token (`crypto.randomBytes(32).toString('hex')`).
   - Sets an `HttpOnly`, `SameSite=Strict` cookie (`ultron_session`).
2. **Session Verification (`validateDesktopSession`):**
   - Validates header `X-ULTRON-Session-Token` or cookie against active sessions registry.
   - TTL: 24 hours with active sliding expiration.
3. **Single-Use Action Tokens:**
   - High-risk operations (such as memory deletion) require short-lived, single-use action tokens (`createSingleUseActionToken` / `consumeSingleUseActionToken`).
   - TTL: 2 minutes. Consumed immediately on first presentation to prevent replay.

---

## 3. Rate Limiting & Fail-Closed Behavior

- Sliding-window rate limiter enforces a cap of 120 requests/minute per client bucket.
- Any integrity failure or expired session defaults to denying access (HTTP 401/403).
