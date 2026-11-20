# ULTRON — Complete Bug Register

**Repository:** `https://github.com/ashish7802/ultron`  
**Date:** November 20, 2026  
**Auditor:** QA Engineering Lead  

---

## Registered Defects & Root Cause Analysis

### BUG-01: Capability Discovery Hijacked by Filesystem Search Regex
- **Severity**: HIGH
- **Location**: `app/api/chat/route.ts` (lines 846–855)
- **Symptom**: User asking *"What desktop and research tools are currently available, and which actions require approval?"* received *"No files found."*
- **Root Cause**: The regex `/(?:search|find)/i` matched "search" in "research", and `([^\s,;]+)` matched "tools", causing the engine to search for a local file named `tools`.
- **Classification**: Intent Routing Conflict.

### BUG-02: Identity Query Leaked Procedural Rules and Research Dossiers
- **Severity**: HIGH
- **Location**: `lib/memoryManager.ts` (lines 657–675)
- **Symptom**: Querying *"who am i"* dumped the entire memory vault into the conversation, including procedural instructions (`ACME_LETSENCRYPT`), research dossiers (`Wasm SIMD`, `SQLite WAL`), and malformed strings (`ne to ye nahi bola`).
- **Root Cause**: `all.filter((m) => m.key !== "user_name" && m.key !== "user_role")` returned all vault entries indiscriminately without category or provenance filtering.
- **Classification**: Privacy & Memory Vault Boundary Violation.

### BUG-03: Combined Desktop App Launch & Document Reading Hallucinated / Failed
- **Severity**: HIGH
- **Location**: `app/api/chat/route.ts` (lines 735–777)
- **Symptom**: Natural language requests like *"ultron me chrome me docss open karo or sari docs files pado"* failed or produced vague non-factual statements when Ollama was stopped.
- **Root Cause**: Dual-intent requests combining application launching and batch document discovery/reading were not intercepted by the local tool orchestrator, falling through to offline model inference.
- **Classification**: Multi-Action Intent Routing Failure.

### BUG-04: Chat Request Misinterpreted as Voice Wake-Word Ping
- **Severity**: MEDIUM
- **Location**: `app/api/chat/route.ts` (lines 1467–1495)
- **Symptom**: Plain text message *"hey ultron"* returned *"I'm listening."* with action `REACT`, failing to provide a natural greeting.
- **Root Cause**: When `activationMode` was omitted in chat request payloads, it defaulted to `"WAKE_WORD"` and treated the text turn as an audio wake-word trigger.
- **Classification**: Protocol & Activation Mode Default Conflict.

### BUG-05: Missing Node.js `fs` and `path` Module Imports in Chat Route
- **Severity**: HIGH
- **Location**: `app/api/chat/route.ts` (line 31)
- **Symptom**: Document scanning logic threw `ReferenceError: path is not defined`, caught silently by `catch (compErr)` and masking the execution failure.
- **Root Cause**: `import fs from "fs"` and `import path from "path"` were missing from top-level imports in `app/api/chat/route.ts`.
- **Classification**: Missing Runtime Dependency Import.

### BUG-06: Typo in `CommandCenterView.tsx` Imports
- **Severity**: LOW
- **Location**: `components/views/CommandCenterView.tsx` (line 28)
- **Symptom**: Syntax error `ArrowRight,b` on Lucide icon import.
- **Root Cause**: Accidental character insertion during editor navigation.
- **Classification**: Syntax Typo.

### BUG-07: Dev Server Junction Prohibitions in Turbopack
- **Severity**: MEDIUM
- **Location**: Development workspace junction
- **Symptom**: Next.js Turbopack failed with error `symlink points outside project root`.
- **Root Cause**: Symlinked `node_modules` between Documents and OneDrive directories.
- **Classification**: Environment / Build System Constraint.
