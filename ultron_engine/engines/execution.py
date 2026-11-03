"""11. Execution Engine: browser, desktop, files, terminal, APIs, workflows."""
import asyncio, time, uuid, os
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

DANGEROUS = ["rm -rf", "format c:", "del /f /s", "rmdir /s", "shutdown", "reg delete"]

class ExecutionEngine(BaseEngine):
    name = "execution"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()
        self._history = []

    async def start(self):
        await super().start()
        self.bus.subscribe("execution.*", self._on)

    async def _on(self, ev):
        pass

    def validate(self, action, params):
        issues = []
        # `params` comes straight from the HTTP payload and may be null/string;
        # `.get` on those raised AttributeError before validation could run.
        if not isinstance(params, dict):
            params = {}
        if action in ("file_delete", "shell") and not params.get("confirm"):
            issues.append("confirmation required")
        cmd = str(params.get("command", ""))
        if any(d in cmd.lower() for d in DANGEROUS):
            issues.append("dangerous command blocked")
        path = params.get("path")
        if path:
            # A numeric path must not raise TypeError on the string checks.
            path = path if isinstance(path, str) else str(path)
            if ".." in path or path.startswith("/etc") or path.startswith("C:\\Windows"):
                issues.append("protected path")
        return issues

    async def execute(self, action, params=None):
        if not isinstance(params, dict):
            params = {}
        issues = self.validate(action, params)
        if issues:
            return {"action": action, "status": "blocked", "issues": issues, "success": False}
        # simulated execution with status tracking
        await asyncio.sleep(0)
        result = {"action": action, "status": "completed", "success": True,
                  "params": params, "ts": time.time()}
        async with self._lock:
            self._history.append(result)
            if len(self._history) > 5000:
                self._history = self._history[-2500:]
        await self.bus.publish("execution.completed", result, source=self.name)
        return result

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "execute", "task": str(payload or "")}
        action = payload.get("action", "execute")
        if action == "execute":
            r = await self.execute(payload.get("task", "noop"), payload.get("params", {}))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "history":
            async with self._lock:
                return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "history": self._history[-50:]}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "history_len": len(self._history)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
