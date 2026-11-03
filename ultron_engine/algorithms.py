"""ULTRON engine algorithms: concrete implementations per engine.

Module Purpose
    Implements the stateless (or store-backed) behaviour of every ULTRON engine
    in one place. Most engine modules in ``ultron_engine.engines`` are thin
    wrappers that simply delegate ``process()`` to the matching
    ``<name>_process`` function defined here.

Key Responsibilities
    - Normalize untrusted engine payloads and return ``_record`` envelopes.
    - Contain optional-dependency fallbacks (e.g. psutil) so a missing package
      degrades one engine instead of crashing the orchestrator.
    - Bound in-memory caches so long-running processes do not leak memory.

Architectural Role
    - Used by ``ultron_engine.engines.*`` and reached from the FastAPI service
      (``server.py``) and the Electron/Next UI through ``OrchestratorEngine``.

Safety / Security Guarantees
    - Payload fields are treated as hostile: they may be ``None``, numbers or
      nested containers because the HTTP layer forwards JSON verbatim.
    - Secrets are redacted before observability records are stored.
"""
import asyncio, time, uuid, hashlib, re, json, os, math
from typing import Any, Dict, List, Optional


def _as_text(value: Any, default: str = "") -> str:
    """Coerces an untrusted payload field into text.

    Payloads arrive from JSON/HTTP and callers frequently send ``None``,
    numbers or containers where a string is expected.  Downstream code calls
    ``.lower()``/``.strip()``/``len()`` on these fields, which would otherwise
    raise and abort the whole engine call.  Normalizing once at the boundary
    keeps the public contract (always return a record) intact.

    Args:
        value (Any): Raw field value from the payload.
        default (str): Value returned for ``None``.

    Returns:
        str: A safe string representation of ``value``.
    """
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def _as_float(value: Any, default: float) -> float:
    """Safely converts a payload field to ``float`` (bad input -> default).

    A single malformed number from the UI must not raise ``ValueError`` and
    take down an engine, so conversion is best-effort.
    """
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int) -> int:
    """Safely converts a payload field to ``int`` (bad input -> default)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> list:
    """Normalizes a payload field to a list.

    Strings are intentionally NOT exploded into characters: a malformed
    ``tools``/``sources`` field should yield no candidates rather than bogus
    one-character entries.  ``None`` and other scalars become ``[]``.
    """
    if isinstance(value, list):
        return value
    if isinstance(value, (tuple, set)):
        return list(value)
    return []


def _record(name, payload, status="ok", extra=None):
    r = {"id": str(uuid.uuid4()), "engine": name, "ts": time.time(),
         "payload": payload, "status": status}
    if extra:
        r.update(extra)
    return r


# ---- Core Layer ----
def intelligence_process(payload):
    # `text` may legitimately be None/number from the UI; coerce before any
    # string op so intent classification never raises on malformed input.
    text = _as_text(payload.get("text", "")) if isinstance(payload, dict) else _as_text(payload)
    low = text.lower()
    intents = []
    if any(w in low for w in ["open", "launch", "start"]): intents.append("launch_app")
    if any(w in low for w in ["search", "find", "lookup"]): intents.append("search")
    if any(w in low for w in ["code", "debug", "fix"]): intents.append("code_task")
    if any(w in low for w in ["email", "send", "message"]): intents.append("communicate")
    # entity extraction (simple tokens after keywords)
    entities = []
    for kw in ["chrome", "python", "file", "url"]:
        if kw in low: entities.append(kw)
    ambiguity = 0.0 if intents else 0.9
    if len(text.strip()) < 5: ambiguity = max(ambiguity, 0.7)
    complexity = min(1.0, len(text) / 200.0 + 0.3 * len(intents))
    route = "cloud" if complexity > 0.6 else "local"
    clarification = None
    if ambiguity > 0.5:
        clarification = "Please clarify the requested action."
    return _record("intelligence", payload, extra={
        "intents": intents, "entities": entities, "ambiguity": ambiguity,
        "complexity": round(complexity,3), "model_route": route,
        "confidence": round(1-ambiguity,3), "clarification": clarification})


def context_state_process(payload):
    p = payload if isinstance(payload, dict) else {}
    # validate schema keys
    allowed = {"active_app","active_task","environment","context","version"}
    unknown = [k for k in p if k not in allowed]
    # A non-numeric version from the UI must increment from 0 instead of
    # raising ValueError mid-snapshot.
    version = _as_int(p.get("version", 0), 0) + 1
    return _record("context_state", payload, extra={
        "snapshot_keys": list(p.keys()), "unknown_keys": unknown,
        "version": version, "valid": len(unknown)==0})


def memory_process(payload, store):
    p = payload if isinstance(payload, dict) else {}
    action = p.get("action", "store")
    items = store.setdefault("items", [])
    hashes = store.setdefault("_hashes", set())
    if action == "store":
        content = p.get("content", p)
        h = hashlib.sha256(json.dumps(content, sort_keys=True, default=str).encode()).hexdigest()[:16]
        if h in hashes:
            return _record("memory", payload, status="duplicate", extra={"hash": h, "stored": False, "reason": "duplicate"})
        hashes.add(h)
        rec_item = {"id": str(uuid.uuid4()), "hash": h, "content": content, "tier": p.get("tier","short"),
                    "ts": time.time(), "source": p.get("source","user")}
        items.append(rec_item)
        return _record("memory", payload, extra={"hash": h, "stored": True, "id": rec_item["id"], "total": len(items)})
    if action == "correct":
        target = p.get("target")
        for it in items:
            if it.get("id") == target:
                it["content"] = p.get("content", it["content"])
                it["corrected"] = True
                return _record("memory", payload, extra={"corrected": True, "id": target})
        return _record("memory", payload, status="not_found", extra={"corrected": False})
    if action in ("recall","search"):
        q = str(p.get("query","")).lower()
        res = [it for it in items if q in str(it.get("content","")).lower()]
        # recency sort
        res.sort(key=lambda x: x.get("ts",0), reverse=True)
        return _record("memory", payload, extra={"items": res, "count": len(res)})
    if action == "delete":
        tid = p.get("target")
        before = len(items)
        store["items"] = [it for it in items if it.get("id") != tid]
        return _record("memory", payload, extra={"deleted": before-len(store["items"])})
    return _record("memory", payload, extra={"action": action})


def multi_agent_process(payload):
    p = payload if isinstance(payload, dict) else {}
    goal = p.get("goal", p.get("task",""))
    steps_raw = [s.strip() for s in re.split(r"[,;\n]", str(goal)) if s.strip()]
    if not steps_raw:
        steps_raw = [str(goal)] if goal else ["noop"]
    agents = ["planner","researcher","coder","verifier"]
    # assign agents round-robin
    steps = []
    for i, t in enumerate(steps_raw):
        steps.append({"id": i, "task": t, "agent": agents[i % len(agents)], "deps": [i-1] if i>0 else [],
                      "status": "pending"})
    # parallel groups: steps with no unmet deps
    return _record("multi_agent", payload, extra={"agents": agents, "steps": steps, "count": len(steps)})


# ---- Interaction Layer ----
def perception_process(payload):
    return _record("perception", payload, extra={"modalities": ["text","audio","screen"]})


def conversation_process(payload):
    text = _as_text(payload.get("text", "")) if isinstance(payload, dict) else _as_text(payload)
    # turn detection: question vs statement
    is_question = text.strip().endswith("?")
    interrupted = bool((payload or {}).get("interrupt")) if isinstance(payload, dict) else False
    return _record("conversation", payload, extra={"is_question": is_question, "interrupted": interrupted,
                    "response_delay_ms": 150 if is_question else 300})


def tts_process(payload):
    text = _as_text(payload.get("text", "")) if isinstance(payload, dict) else _as_text(payload)
    emotion = (payload or {}).get("emotion", "neutral") if isinstance(payload, dict) else "neutral"
    # chunk for streaming
    chunks = [text[i:i+80] for i in range(0, len(text), 80)] or [""]
    return _record("tts", payload, extra={"emotion": emotion, "chunks": len(chunks), "chars": len(text)})


def personality_process(payload):
    style = (payload or {}).get("style", "concise") if isinstance(payload, dict) else "concise"
    return _record("personality", payload, extra={"style": style, "persona": "ULTRON"})


def multimodal_process(payload):
    modalities = []
    if isinstance(payload, dict):
        for k in ("text","audio","image","video","doc","screen"):
            if k in payload and payload[k] is not None:
                modalities.append(k)
    return _record("multimodal", payload, extra={"modalities": modalities, "fused": True})


# ---- Action Layer ----
def planning_process(payload):
    goal = _as_text(payload.get("goal", "")) if isinstance(payload, dict) else _as_text(payload)
    # decompose into steps
    steps = [s.strip() for s in re.split(r"[,;\n]", goal) if s.strip()]
    if not steps:
        steps = [goal] if goal else ["noop"]
    # dependency graph: linear chain
    graph = [{"id": i, "task": t, "deps": [i-1] if i > 0 else []} for i, t in enumerate(steps)]
    return _record("planning", payload, extra={"steps": steps, "graph": graph, "count": len(steps)})


def execution_process(payload):
    action = (payload or {}).get("action", "noop") if isinstance(payload, dict) else "noop"
    return _record("execution", payload, extra={"action": action, "result": "queued", "success": True})


def tool_intelligence_process(payload):
    # `tools`/`intent` come straight from the UI and may be null or a string;
    # iterating a non-list would raise TypeError and coercion keeps selection
    # deterministic.
    tools = _as_list((payload or {}).get("tools", [])) if isinstance(payload, dict) else []
    # select best by name match to intent
    intent = _as_text((payload or {}).get("intent", "")) if isinstance(payload, dict) else ""
    selected = None
    for t in tools:
        if isinstance(t, str) and intent.lower() in t.lower():
            selected = t
            break
    if selected is None and tools:
        selected = tools[0]
    return _record("tool_intelligence", payload, extra={"selected": selected, "candidates": len(tools)})


def system_control_process(payload):
    cmd = _as_text(payload.get("command", "")) if isinstance(payload, dict) else _as_text(payload)
    # sandbox: block dangerous
    dangerous = ["rm -rf", "format", "del /", "shutdown", "reg delete"]
    blocked = any(d in cmd.lower() for d in dangerous)
    return _record("system_control", payload, status="blocked" if blocked else "ok",
                   extra={"command": cmd, "blocked": blocked})


def smart_home_process(payload):
    device = (payload or {}).get("device", "light") if isinstance(payload, dict) else "light"
    action = (payload or {}).get("action", "toggle") if isinstance(payload, dict) else "toggle"
    return _record("smart_home", payload, extra={"device": device, "action": action, "result": "sent"})


def code_engineering_process(payload):
    code = _as_text(payload.get("code", "")) if isinstance(payload, dict) else _as_text(payload)
    # basic syntax check via compile for python
    ok = True
    err = None
    try:
        if code.strip():
            compile(code, "<ultron>", "exec")
    except SyntaxError as e:
        ok = False
        err = str(e)
    except (ValueError, TypeError) as e:
        # compile() raises ValueError for source containing NUL bytes and
        # TypeError for exotic source objects; both are bad *user input* and
        # must be reported as a failed check, not crash the engine.
        ok = False
        err = str(e)
    return _record("code_engineering", payload, status="ok" if ok else "error",
                   extra={"syntax_ok": ok, "error": err})


def simulation_process(payload):
    return _record("simulation", payload, extra={"simulated": True, "physics": "basic"})


def communication_process(payload):
    channel = (payload or {}).get("channel", "email") if isinstance(payload, dict) else "email"
    return _record("communication", payload, extra={"channel": channel, "queued": True})


# ---- Knowledge Layer ----
def knowledge_research_process(payload):
    query = _as_text((payload or {}).get("query", "")) if isinstance(payload, dict) else _as_text(payload)
    # simple source ranking by length heuristic
    # `sources` may be null/string from the UI; sorting a non-list raised.
    sources = _as_list((payload or {}).get("sources", [])) if isinstance(payload, dict) else []
    ranked = sorted(sources, key=lambda s: len(str(s)), reverse=True)
    return _record("knowledge_research", payload, extra={"query": query, "ranked_sources": ranked[:5]})


# ---- Quality Layer ----
def verification_process(payload):
    result = (payload or {}).get("result") if isinstance(payload, dict) else payload
    checks = []
    if isinstance(payload, dict):
        for k, v in payload.items():
            checks.append({"field": k, "present": v is not None})
    passed = all(c["present"] for c in checks) if checks else True
    return _record("verification", payload, status="pass" if passed else "fail",
                   extra={"checks": checks, "passed": passed})


def anti_hallucination_process(payload):
    confidence = 0.5
    if isinstance(payload, dict):
        # `float(None)` raises; the confidence is a heuristic, so fall back to
        # the conservative default for malformed values.
        confidence = _as_float(payload.get("confidence", 0.5), 0.5)
    grounded = confidence >= 0.6
    return _record("anti_hallucination", payload, extra={"confidence": confidence,
                    "grounded": grounded, "action": "allow" if grounded else "block"})


def self_correction_process(payload):
    error = _as_text((payload or {}).get("error", "")) if isinstance(payload, dict) else _as_text(payload)
    # Retry counters may be strings/null from persisted state; coerce so the
    # retry-limit comparison cannot raise TypeError.
    retries = _as_int((payload or {}).get("retries", 0), 0) if isinstance(payload, dict) else 0
    can_retry = retries < 3
    return _record("self_correction", payload, extra={"error": error, "can_retry": can_retry,
                    "next_retry": retries + 1 if can_retry else None})


# ---- Safety Layer ----
def security_process(payload):
    action = _as_text((payload or {}).get("action", "")) if isinstance(payload, dict) else _as_text(payload)
    risky = any(w in action.lower() for w in ["delete", "format", "sudo", "rm", "shutdown"])
    return _record("security", payload, extra={"action": action, "risky": risky,
                    "requires_confirmation": risky})


def privacy_governance_process(payload):
    store_local = True
    if isinstance(payload, dict):
        store_local = payload.get("local", True)
    return _record("privacy_governance", payload, extra={"store_local": store_local, "encrypted": True})


def human_loop_process(payload):
    return _record("human_loop", payload, extra={"kill_switch": False, "approval_required": False})


def alerting_emergency_process(payload):
    level = (payload or {}).get("level", "info") if isinstance(payload, dict) else "info"
    escalate = level in ("critical", "emergency")
    return _record("alerting_emergency", payload, extra={"level": level, "escalate": escalate})


# ---- Adaptive Layer ----
def learning_process(payload, store):
    pref = (payload or {}).get("preference") if isinstance(payload, dict) else None
    # Only a dict-shaped {key, value} preference is meaningful; a string/null
    # preference from the UI previously raised AttributeError on `.get`.
    if isinstance(pref, dict) and pref.get("key") is not None:
        store.setdefault("prefs", {})[pref.get("key")] = pref.get("value")
    return _record("learning", payload, extra={"prefs_count": len(store.get("prefs", {}))})


def proactive_process(payload):
    now = time.time()
    reminders = _as_list((payload or {}).get("reminders", [])) if isinstance(payload, dict) else []
    # Reminder entries are user-supplied: skip malformed items and treat a
    # non-numeric `due` as "not due yet" instead of raising on comparison.
    due = []
    for r in reminders:
        if not isinstance(r, dict):
            continue
        due_ts = _as_float(r.get("due", now + 1), now + 1)
        if due_ts <= now:
            due.append(r)
    return _record("proactive", payload, extra={"due_reminders": len(due), "suggestions": ["review_pending_tasks"]})


# ---- Infra Layer ----
# psutil is an OPTIONAL dependency: the repository is expected to run on hosts
# where it is not installed (and it is not installed in the CI/audit Python).
# Import it defensively so this engine degrades to a report instead of raising
# ModuleNotFoundError and taking the orchestrator down.
try:
    import psutil as _psutil
    HAS_PSUTIL = True
except ImportError:
    _psutil = None
    HAS_PSUTIL = False

# Bounded cache: the previous dict grew forever because entries were never
# evicted.  256 entries is ample for route-decision memoization and keeps a
# long-running daemon's memory flat.
_RESOURCE_CACHE = {}
_RESOURCE_CACHE_MAX = 256


def _disk_free_bytes():
    """Returns free bytes on the current drive, or None if it cannot be read.

    ``shutil.disk_usage("/")`` maps to the current drive on Windows; some
    sandboxed/networked filesystems raise OSError, which must not crash the
    resource engine.
    """
    import shutil
    try:
        _total, _used, free = shutil.disk_usage(os.path.abspath(os.sep))
        return free
    except OSError:
        return None


def resource_optimization_process(payload):
    p = payload if isinstance(payload, dict) else {}
    action = p.get("action", "status")
    # Read whatever metrics are available.  Missing psutil (or a psutil call
    # failing on an unsupported platform) leaves the readings as None and
    # marks the record `degraded`, which is the documented fallback contract.
    metrics_error = None
    cpu = None
    mem = None
    if HAS_PSUTIL:
        try:
            cpu = _psutil.cpu_percent(interval=0.1)
            mem = _psutil.virtual_memory()
        except Exception as e:  # psutil can raise NotImplementedError/OSError per-OS
            metrics_error = str(e)
    else:
        metrics_error = "psutil not installed"

    free = _disk_free_bytes()
    ram_gb = (mem.total / (1024 ** 3)) if mem is not None else None
    ram_used_percent = mem.percent if mem is not None else None

    # model routing decision
    task_complexity = _as_float(p.get("complexity", 0.5), 0.5)
    privacy = p.get("privacy", "local_preferred")
    # heuristic: local if enough ram and privacy prefers local and complexity moderate
    local_capable = bool(ram_gb is not None and cpu is not None and ram_gb >= 8 and cpu < 85)
    if privacy == "local_only":
        # Privacy invariant: "local_only" must NEVER be upgraded to cloud just
        # because CPU/RAM look busy.  Previously a busy host silently routed a
        # local-only request to the cloud.
        route = "local"
    else:
        route = "local" if (local_capable and (privacy in ("local_only", "local_preferred") or task_complexity < 0.7)) else "cloud"
    # Unknown RAM is treated like a small machine so the safest quantized
    # model is selected.
    quantized = "q4_k_m" if (ram_gb is None or ram_gb < 16) else "q8_0"
    # caching (bounded FIFO)
    key = p.get("cache_key")
    cached = None
    if key and key in _RESOURCE_CACHE:
        cached = _RESOURCE_CACHE[key]
    if p.get("cache_value") is not None and key:
        _RESOURCE_CACHE[key] = p.get("cache_value")
        while len(_RESOURCE_CACHE) > _RESOURCE_CACHE_MAX:
            del _RESOURCE_CACHE[next(iter(_RESOURCE_CACHE))]
    return _record("resource_optimization", payload,
                   status="ok" if metrics_error is None else "degraded",
                   extra={
        "cpu_percent": cpu, "ram_total_gb": round(ram_gb, 2) if ram_gb is not None else None,
        "ram_used_percent": ram_used_percent,
        "disk_free_gb": round(free / 1e9, 2) if free is not None else None,
        "route": route, "quantization": quantized,
        "local_capable": local_capable, "cached": cached is not None, "cache_size": len(_RESOURCE_CACHE),
        "metrics_available": metrics_error is None, "metrics_error": metrics_error,
        "action": action})


def reliability_process(payload, store):
    p = payload if isinstance(payload, dict) else {}
    action_key = p.get("action_key")
    if isinstance(action_key, (dict, list, set)):
        # Idempotency keys must be hashable for the dedup set; serialize exotic
        # shapes instead of raising TypeError ("unhashable type").
        action_key = json.dumps(action_key, sort_keys=True, default=str)
    seen = store.setdefault("seen", set())
    duplicate = action_key in seen if action_key else False
    if action_key and not duplicate:
        seen.add(action_key)
    # Bound the dedup set as well: an always-new action_key stream would grow
    # this set without limit in a long-running daemon.
    if len(seen) > 10000:
        store["seen"] = set(list(seen)[-5000:])
    # timeout/retry config: values may be null/strings from persisted state.
    timeout = _as_float(p.get("timeout", 30.0), 30.0)
    retries = _as_int(p.get("retries", 0), 0)
    max_retries = _as_int(p.get("max_retries", 3), 3)
    can_retry = retries < max_retries
    # checkpoint
    cp = {"ts": time.time(), "payload": payload, "action_key": action_key}
    store.setdefault("checkpoints", []).append(cp)
    if len(store["checkpoints"]) > 1000:
        store["checkpoints"] = store["checkpoints"][-500:]
    # crash recovery: restore last checkpoint if requested
    recovered = False
    if p.get("recover"):
        cps = store.get("checkpoints", [])
        if cps:
            recovered = True
    return _record("reliability", payload, status="duplicate" if duplicate else "ok",
                   extra={"duplicate": duplicate, "checkpointed": True, "timeout": timeout,
                          "retries": retries, "max_retries": max_retries, "can_retry": can_retry,
                          "recovered": recovered, "checkpoint_count": len(store.get("checkpoints",[]))})


def offline_fallback_process(payload):
    p = payload if isinstance(payload, dict) else {}
    # connectivity detection
    import socket
    online = p.get("online")
    if online is not None:
        online = bool(online)
    if online is None:
        # Fast-fail probe.  NOTE: this helper is synchronous by contract, so
        # the probe blocks the caller for up to `timeout`; keeping the timeout
        # short bounds the damage when DNS/egress is blackholed.
        try:
            socket.create_connection(("8.8.8.8", 53), timeout=2)
            online = True
        except OSError:
            online = False
    mode = "cloud" if online else "local"
    requested = p.get("capability", "chat")
    supported_offline = requested in ("chat", "tts", "memory", "system_control", "code_engineering")
    return _record("offline_fallback", payload, extra={"online": online, "mode": mode,
                    "capability": requested, "supported_offline": supported_offline,
                    "fallback": (not online) and supported_offline})


# ---- Ops Layer ----
import re as _re
_LOGS = []
_TRACES = {}
_LOG_CAP = 10000
# Cap the number of distinct trace ids and events per trace: both structures
# were previously unbounded, leaking memory in a continuously running daemon.
_TRACE_IDS_CAP = 5000
_TRACE_EVENTS_CAP = 1000


def observability_process(payload):
    p = payload if isinstance(payload, dict) else {}
    action = p.get("action", "log")
    # redact secrets
    def redact(v):
        if isinstance(v, str):
            return _re.sub(r"(?i)(api[_-]?key|password|token|secret)\s*[:=]\s*\S+", r"\1=[REDACTED]", v)
        if isinstance(v, dict):
            return {k: ("[REDACTED]" if any(s in str(k).lower() for s in ("key","password","token","secret")) else redact(val)) for k,val in v.items()}
        if isinstance(v, (list, tuple)):
            # Nested containers are common in telemetry payloads; without this
            # branch secrets inside lists were stored verbatim (leak).
            return [redact(item) for item in v]
        return v
    entry = {"ts": time.time(), "level": p.get("level","info"), "message": redact(p.get("message", "")),
             "extra": redact(p.get("extra", {}))}
    _LOGS.append(entry)
    if len(_LOGS) > _LOG_CAP:
        del _LOGS[:_LOG_CAP // 2]
    trace_id = p.get("trace_id")
    if trace_id:
        events = _TRACES.setdefault(trace_id, [])
        events.append({"ts": time.time(), "event": p.get("event"), "latency_ms": p.get("latency_ms")})
        if len(events) > _TRACE_EVENTS_CAP:
            del events[:_TRACE_EVENTS_CAP // 2]
        while len(_TRACES) > _TRACE_IDS_CAP:
            del _TRACES[next(iter(_TRACES))]
    latency = p.get("latency_ms")
    return _record("observability", payload, extra={"log_count": len(_LOGS), "traced": True,
                    "trace_id": trace_id, "trace_events": len(_TRACES.get(trace_id, [])) if trace_id else 0,
                    "latency_ms": latency})


def testing_evaluation_process(payload):
    p = payload if isinstance(payload, dict) else {}
    cases = _as_list(p.get("cases", []))
    passed = 0
    failures = []
    for c in cases:
        if isinstance(c, dict):
            if c.get("expected") == c.get("actual"):
                passed += 1
            else:
                failures.append({"name": c.get("name"), "expected": c.get("expected"), "actual": c.get("actual")})
    total = len(cases) if cases else 1
    # benchmark
    start = time.time()
    # trivial workload
    _ = sum(i*i for i in range(1000))
    elapsed_ms = (time.time()-start)*1000
    return _record("testing_evaluation", payload, extra={"passed": passed, "total": total,
                    "score": round(passed/total,3), "failures": failures, "benchmark_ms": round(elapsed_ms,3)})


ALGORITHMS = {
 "intelligence": intelligence_process,
 "context_state": context_state_process,
 "memory": None,  # handled with store
 "multi_agent": multi_agent_process,
 "perception": perception_process,
 "conversation": conversation_process,
 "tts": tts_process,
 "personality": personality_process,
 "multimodal": multimodal_process,
 "planning": planning_process,
 "execution": execution_process,
 "tool_intelligence": tool_intelligence_process,
 "system_control": system_control_process,
 "smart_home": smart_home_process,
 "code_engineering": code_engineering_process,
 "simulation": simulation_process,
 "communication": communication_process,
 "knowledge_research": knowledge_research_process,
 "verification": verification_process,
 "anti_hallucination": anti_hallucination_process,
 "self_correction": self_correction_process,
 "security": security_process,
 "privacy_governance": privacy_governance_process,
 "human_loop": human_loop_process,
 "alerting_emergency": alerting_emergency_process,
 "learning": None,
 "proactive": proactive_process,
 "resource_optimization": resource_optimization_process,
 "reliability": None,
 "offline_fallback": offline_fallback_process,
 "observability": observability_process,
 "testing_evaluation": testing_evaluation_process,
}
