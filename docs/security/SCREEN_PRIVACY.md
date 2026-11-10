# ULTRON Screen Awareness Privacy Lifecycle & Policy

## Architectural Status
**PHYSICAL SCREEN CAPTURE & VISION DRIVERS ARE NOT IMPLEMENTED IN THIS CODEBASE.**

To prevent privacy regressions or unauthorized desktop screen reading, the system implements a strict privacy lifecycle and policy controller in `lib/screenPrivacyController.ts`.

---

## 1. Privacy Guarantees

1. **OFF By Default:** Visual sensing defaults to `DISABLED`.
2. **Explicit User Opt-In:** Screen awareness cannot be enabled programmatically or via conversational prompt; it requires explicit user consent for a time-bounded window.
3. **Sensitive Window Blacklist:** The following window categories are strictly excluded from visual capture:
   - Password Managers (`1Password`, `Bitwarden`, `KeePass`, `LastPass`, `Dashlane`)
   - Authenticators & MFA apps
   - Private browser windows (`Incognito`, `InPrivate`)
   - Banking & financial web sessions
   - Windows Credential / Security dialogs
4. **Fail-Closed Execution:** All visual capture inquiries return `false` or empty buffers whenever the policy is not in `ACTIVE_CAPTURE`.
5. **No Persistent Screenshots:** Raw frame buffers are kept strictly in ephemeral volatile memory and purged upon session timeout, lock, or shutdown.
