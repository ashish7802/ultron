"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Package: ultron_engine
Purpose: Pure-Python cognition, security and automation engine layer
===============================================================================

Architectural Role & Interactions:
- Exposes the local engine runtime consumed by the Next.js/Electron UI through
  `ultron_engine.registry.build_orchestrator()` and the optional HTTP service in
  `ultron_engine.server`.
- Sub-packages: `ultron_engine.engines` (33 specialized engines), plus this package's
  core primitives (`core`, `crypto`, `secure_vault`, `intruder_defense`,
  `windows_hello`, `quantum_research_agent`).

Safety / Security Guarantees:
- Cryptographic keys are stored via Windows DPAPI (`secure_vault`); envelopes use
  AES-256-GCM (`crypto`). Zero-Trust gating, tamper detection and the encrypted
  audit ledger live in `intruder_defense` / `engines.security`.
- Importing a submodule must never require optional third-party web/storage stacks
  (FastAPI or Google client libraries) to be installed; those are guarded locally.
- This engine layer is intentionally LOCAL-ONLY: no remote cloud-provider client or
  third-party cloud storage integration ships with the application.
===============================================================================
"""
