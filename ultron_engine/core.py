"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.core
Purpose: Core runtime primitives — EventBus, SharedState, BaseEngine
===============================================================================

Key Responsibilities:
- EventBus: in-process publish/subscribe with bounded history, delivery metrics,
  exact and wildcard topic matching ("security.*", "*.tamper_detected", "*").
- SharedState: async-guarded key/value context with change history and subscribers.
- BaseEngine: lifecycle (start/stop) + health contract implemented by every engine.

Architectural Role:
- Imported by every engine module and by the registry/orchestrator. No I/O of its
  own: it only coordinates in-memory event delivery and shared context.

Safety / Security Guarantees:
- Wildcard subscriptions are honoured, so security telemetry such as
  "memory.tamper_detected" reaches the "*.tamper_detected" lockdown handler.
- Handler failures are isolated (one bad subscriber cannot stop delivery) and
  error-reporting cannot recurse without bound.
===============================================================================
"""

import asyncio, time, uuid, sqlite3, os, json, hashlib
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "ultron_state.db")


@dataclass
class Event:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    topic: str = ""
    payload: Any = None
    source: str = ""
    ts: float = field(default_factory=time.time)
    priority: int = 0


class EventBus:
    def __init__(self, max_history=50000):
        self._subs: Dict[str, List[Callable]] = {}
        self._history: List[Event] = []
        self._lock = asyncio.Lock()
        self._max = max_history
        self._metrics = {"published": 0, "delivered": 0, "errors": 0}

    def subscribe(self, topic, handler):
        """
        Registers a handler for a topic.

        Supported topic forms: an exact topic ("memory.stored"), a prefix wildcard
        ("memory.*"), a suffix wildcard ("*.tamper_detected"), or "*" for all events.
        """
        self._subs.setdefault(topic, []).append(handler)

    def unsubscribe(self, topic, handler):
        """Removes a previously registered handler (identity comparison)."""
        if topic in self._subs:
            self._subs[topic] = [h for h in self._subs[topic] if h is not handler]

    def _matching_handlers(self, topic):
        """
        Resolves the ordered, de-duplicated handler list for a topic.

        Why here: engine modules register patterns like "security.*" and
        "*.tamper_detected". The previous implementation only looked up the exact
        topic plus the bare "*", so every wildcard security subscription silently
        never fired (e.g. tamper alerts never reached the lockdown handler).
        """
        handlers = list(self._subs.get(topic, []))
        for pattern, subs in self._subs.items():
            if pattern == topic:
                continue  # already included above
            if pattern == "*":
                handlers.extend(subs)
            elif pattern.endswith(".*") and topic.startswith(pattern[:-1]):
                handlers.extend(subs)  # prefix wildcard: "memory.*"
            elif pattern.startswith("*.") and topic.endswith(pattern[1:]):
                handlers.extend(subs)  # suffix wildcard: "*.tamper_detected"
        seen = set()
        unique = []
        for h in handlers:
            if id(h) not in seen:
                seen.add(id(h))
                unique.append(h)
        return unique

    async def publish(self, topic, payload=None, source="", priority=0, _error_recovery=False):
        """
        Publishes an event to all matching subscribers.

        Args:
            topic (str): Event topic name.
            payload (Any): Event body (stored by reference in history).
            source (str): Publishing subsystem name.
            priority (int): Priority hint for consumers.
            _error_recovery (bool): Internal guard; when True, handler failures are
                only counted. Prevents an "engine.error" handler that itself raises
                from recursing forever.

        Returns:
            Event: The delivered event.
        """
        ev = Event(topic=topic, payload=payload, source=source, priority=priority)
        async with self._lock:
            self._history.append(ev)
            if len(self._history) > self._max:
                # Retain the newest half of the ring. max(1, ...) avoids the
                # `history[-0:]` no-op slice when max_history is extremely small.
                self._history = self._history[-max(1, self._max // 2):]
            self._metrics["published"] += 1

        for h in self._matching_handlers(topic):
            try:
                r = h(ev)
                if asyncio.iscoroutine(r):
                    await r
                self._metrics["delivered"] += 1
            except Exception as e:
                self._metrics["errors"] += 1
                if not _error_recovery:
                    await self.publish(
                        "engine.error",
                        {"error": str(e), "topic": topic},
                        source="eventbus",
                        _error_recovery=True,
                    )
        return ev

    def history(self, limit=100, topic=None):
        h = self._history if topic is None else [e for e in self._history if e.topic == topic]
        return h[-limit:]

    def metrics(self):
        return dict(self._metrics)


class SharedState:
    def __init__(self):
        self._data = {"active_app": None, "active_task": None, "environment": {},
                      "history": [], "user_prefs": {}, "context": {}}
        self._lock = asyncio.Lock()
        self._subscribers = []

    async def get(self, key, default=None):
        async with self._lock:
            return self._data.get(key, default)

    async def set(self, key, value):
        async with self._lock:
            old = self._data.get(key)
            self._data[key] = value
            entry = {"key": key, "old": old, "new": value, "ts": time.time()}
            self._data["history"].append(entry)
            if len(self._data["history"]) > 10000:
                self._data["history"] = self._data["history"][-5000:]
        for cb in list(self._subscribers):
            try:
                r = cb(key, value, old)
                if asyncio.iscoroutine(r):
                    await r
            except Exception:
                pass

    async def snapshot(self):
        async with self._lock:
            return {k: (list(v) if isinstance(v, list) else (dict(v) if isinstance(v, dict) else v))
                    for k, v in self._data.items()}

    async def push_history(self, entry):
        async with self._lock:
            self._data["history"].append(entry)

    def subscribe(self, cb):
        self._subscribers.append(cb)

    async def update_context(self, patch: dict):
        async with self._lock:
            self._data["context"].update(patch)


class BaseEngine:
    name = "base"
    layer = "core"

    def __init__(self, bus, state):
        self.bus = bus
        self.state = state
        self._running = False
        self._started_at = None

    async def start(self):
        self._running = True
        self._started_at = time.time()
        await self.bus.publish(f"{self.name}.started", {}, source=self.name)

    async def stop(self):
        self._running = False
        await self.bus.publish(f"{self.name}.stopped", {}, source=self.name)

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running,
                "uptime": (time.time() - self._started_at) if self._started_at else 0}
