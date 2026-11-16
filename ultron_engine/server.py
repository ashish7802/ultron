"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.server
Purpose: Optional FastAPI HTTP service exposing ULTRON engines to the UI
===============================================================================

Architectural Role & Interactions:
- Bridges the Python engine orchestrator to the Electron/Next.js UI over HTTP
  (`/health`, `/dispatch`, `/state`, `/engine/{name}/process`).
- FastAPI/uvicorn are OPTIONAL dependencies: this module must always be importable
  so audits, tests, and desktop voice paths that never start an HTTP server do not
  crash on a machine without the web stack. The FastAPI app is therefore built
  lazily by `create_app()`; accessing `app` without FastAPI raises an actionable
  RuntimeError instead of an ImportError at import time.
- The orchestrator singleton is built once, lazily, and shared by every route and by
  the legacy module-level `orch`/`bus`/`state` attributes (PEP 562 `__getattr__`).

Safety / Security Guarantees:
- No authentication middleware is defined here. Bind the service to loopback only
  (the UI runs on the same machine) and let the Zero-Trust engine layer gate
  sensitive operations; do not expose this port to untrusted networks.
- When FastAPI IS installed, route behavior is byte-for-byte the same contract as
  the previous module-level `app` object.
===============================================================================
"""

from typing import Any, Optional
import os

try:
    # Optional dependency: desktop/audit environments intentionally do not install it.
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware

    HAS_FASTAPI = True
except ImportError:  # pragma: no cover - exercised only when the web stack is absent
    FastAPI = None
    HTTPException = None
    Request = None
    CORSMiddleware = None
    HAS_FASTAPI = False

from .registry import build_orchestrator

_FASTAPI_HINT = (
    "ultron_engine.server requires the optional 'fastapi' package to build the HTTP "
    "service. Install it with: pip install fastapi uvicorn. The engine orchestrator "
    "and audit scripts work without it."
)
LOCAL_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d{1,5})?$"


class OptionalDependencyError(RuntimeError):
    """Raised when the optional web stack is required but not installed."""


# Lazily-built singletons. Kept module-private so `__getattr__` can distinguish
# "not built yet" from "built but empty".
_app: Optional[Any] = None
_orchestrator: Optional[Any] = None
_bus: Optional[Any] = None
_state: Optional[Any] = None


def _get_orchestrator():
    """
    Builds (once) and returns the shared `(orchestrator, bus, state)` triplet.

    Returns:
        tuple: `(OrchestratorEngine, EventBus, SharedState)`.

    Side Effects:
        Instantiates every registered engine on first call.
    """
    global _orchestrator, _bus, _state
    if _orchestrator is None:
        _orchestrator, _bus, _state = build_orchestrator()
    return _orchestrator, _bus, _state


def create_app():
    """
    Builds (once) and returns the FastAPI application.

    Returns:
        FastAPI: The configured engine HTTP service.

    Raises:
        OptionalDependencyError: If FastAPI is not installed. Callers that only
            need the engine layer should use `build_orchestrator()` instead.

    Side Effects:
        Constructs the orchestrator and registers startup/shutdown hooks.
    """
    global _app
    if not HAS_FASTAPI:
        raise OptionalDependencyError(_FASTAPI_HINT)
    if _app is not None:
        return _app

    orch, _bus_obj, state = _get_orchestrator()

    app = FastAPI(title="ULTRON Engine Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=LOCAL_CORS_ORIGIN_REGEX,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.on_event("startup")
    async def startup():
        await orch.start()

    @app.on_event("shutdown")
    async def shutdown():
        await orch.stop()

    @app.get("/health")
    async def health():
        return await orch.broadcast_health()

    import secrets
    _active_secret = (
        os.environ.get("ULTRON_ENGINE_SECRET")
        or os.environ.get("ULTRON_SESSION_SECRET")
        or secrets.token_hex(32)
    )

    def _verify_auth(req: Request):
        secret = req.headers.get("x-ultron-secret") or req.headers.get("authorization", "").replace("Bearer ", "")
        if not secret or secret != _active_secret:
            raise HTTPException(status_code=403, detail="Forbidden: Invalid engine authorization secret")
        return True

    @app.post("/dispatch")
    async def dispatch(body: dict, request: Request):
        _verify_auth(request)
        return await orch.dispatch(body.get("intent", ""), body.get("payload", {}))

    @app.get("/state")
    async def get_state(request: Request):
        _verify_auth(request)
        return await state.snapshot()

    @app.post("/engine/{name}/process")
    async def process(name: str, body: dict, request: Request):
        _verify_auth(request)
        e = orch.engines.get(name)
        if not e:
            return {"error": "unknown engine"}
        return await e.process(body.get("payload"))

    _app = app
    return _app


def is_local_cors_origin(origin: str) -> bool:
    """Checks whether a browser origin is a loopback UI origin."""
    import re

    return bool(re.fullmatch(LOCAL_CORS_ORIGIN_REGEX, origin))


def __getattr__(name: str):
    """
    PEP 562 lazy module attributes (backward-compatible surface).

    - `app` keeps the historical `ultron_engine.server.app` contract but builds the
      FastAPI application on first access, raising RuntimeError when FastAPI is absent.
    - `orch`, `bus`, `state` expose the lazily-built orchestrator singletons that the
      previous module-level code created eagerly at import.

    Args:
        name (str): Attribute name being accessed on the module.

    Returns:
        Any: The requested lazily-created object.

    Raises:
        AttributeError: For any other attribute name.
        OptionalDependencyError: When `app` is accessed without FastAPI installed.
    """
    if name == "app":
        return create_app()
    if name in ("orch", "bus", "state"):
        orch, bus, state = _get_orchestrator()
        return {"orch": orch, "bus": bus, "state": state}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
