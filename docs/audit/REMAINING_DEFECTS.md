# ULTRON — Remaining Defects & Investigation Register

**Date:** 20 November 2026  
**Scope:** Runtime-dependent items, third-party limitations, and deferred tasks.

---

## 1. Runtime & External Limitations

| Item ID | Area | Current Status | Description & Limitation |
| :--- | :--- | :--- | :--- |
| **DEF-001** | Cloud Google Docs Integration | **LIMITATION BY DESIGN** | ULTRON currently reads and previews local project documentation files in `docs/`. Cloud Google Docs API integration requires user-provided OAuth credentials (`credentials.json`), which are not configured by default. ULTRON now honestly reports this boundary. |
| **DEF-002** | Live Web Search Rate Limiting | **HANDLED / RESILIENT** | Public search providers (DuckDuckGo HTML/Instant Answer) intermittently throttle automated crawlers during high-frequency scraping. Resilient retry loops and honest degraded reporting are now implemented. |
| **DEF-003** | Local Ollama Model Size | **CONFIGURATION BOUNDARY** | The active model is `qwen2.5:0.5b` (398 MB), which executes extremely fast on consumer laptops with minimal RAM footprint. Deep multi-step analytical synthesis performs better on 7B/14B models if sufficient RAM (>= 16GB) is available. |
| **DEF-004** | Multimodal Vision OCR | **DEGRADED BY DESIGN** | Visual OCR and window title extraction are operational. Full visual scene understanding (diagrams, button recognition) requires pulling a dedicated vision model (e.g. `llama3.2-vision`), which is deferred to prevent excessive disk/RAM usage. |

---

## 2. Completed Remediations (0 Open Critical P0 Bugs)
All P0 and P1 bugs identified in the audit order (BUG-001 through BUG-022) have been verified, repaired, and re-tested.
