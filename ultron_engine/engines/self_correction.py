"""21. Self-Correction Engine: error diagnosis, safe retry limits."""
import asyncio, time, uuid, traceback
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

class SelfCorrectionEngine(BaseEngine):
    name = "self_correction"
    layer = "quality"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()
        self._retries = {}
        self.MAX_RETRIES = 3

    async def start(self):
        await super().start()
        self.bus.subscribe("self_correction.*", self._on)

    async def _on(self, ev):
        pass

    @staticmethod
    def _retry_key(key):
        """Normalizes a retry key so it is always hashable.

        Keys arrive from JSON payloads where objects/lists cannot be used as
        dict keys (``TypeError: unhashable type``), so they are serialized.
        """
        if isinstance(key, (dict, list, set)):
            return str(key)
        return key

    def diagnose(self, error):
        msg = str(error)
        if "timeout" in msg.lower():
            return {"category": "timeout", "suggestion": "increase timeout or reduce payload"}
        if "permission" in msg.lower() or "access" in msg.lower():
            return {"category": "permission", "suggestion": "request elevated permission"}
        if "not found" in msg.lower() or "404" in msg:
            return {"category": "not_found", "suggestion": "verify resource exists"}
        if "syntax" in msg.lower():
            return {"category": "syntax", "suggestion": "fix syntax error"}
        return {"category": "unknown", "suggestion": "inspect logs"}

    def can_retry(self, key):
        key = self._retry_key(key)
        count = self._retries.get(key, 0)
        return count < self.MAX_RETRIES

    async def attempt(self, key, fn, *args, **kwargs):
        # fn is a sync/async callable
        key = self._retry_key(key)
        last_err = None
        while self.can_retry(key):
            self._retries[key] = self._retries.get(key, 0) + 1
            try:
                r = fn(*args, **kwargs)
                if asyncio.iscoroutine(r):
                    r = await r
                # reset on success
                self._retries[key] = 0
                return {"success": True, "result": r, "attempts": self._retries.get(key, 0)}
            except Exception as e:
                last_err = e
                diag = self.diagnose(e)
                await self.bus.publish("self_correction.error", {"key": key, "error": str(e), "diagnosis": diag}, source=self.name)
        return {"success": False, "error": str(last_err), "diagnosis": self.diagnose(last_err),
                "attempts": self._retries.get(key, 0)}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "diagnose"}
        action = payload.get("action", "diagnose")
        if action == "diagnose":
            d = self.diagnose(payload.get("error", ""))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **d}
        if action == "can_retry":
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok",
                    "can_retry": self.can_retry(payload.get("key", "default"))}
        if action == "reset":
            self._retries.pop(self._retry_key(payload.get("key", "default")), None)
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "reset": True}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "retries": dict(self._retries)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
