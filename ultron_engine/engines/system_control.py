"""13. System Control Engine: OS commands, app lifecycle, hardware."""
import asyncio, time, uuid, platform
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

PROTECTED_PROCESSES = {"csrss.exe", "lsass.exe", "services.exe", "svchost.exe", "wininit.exe", "explorer.exe"}

class SystemControlEngine(BaseEngine):
    name = "system_control"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("system_control.*", self._on)

    async def _on(self, ev):
        pass

    def validate_command(self, cmd):
        # OS command may be null/number from the UI; `.lower()` would raise.
        low = str(cmd or "").lower()
        risky = any(w in low for w in ["shutdown", "restart", "format", "del /", "rm -rf", "reg delete"])
        protected = any(p in low for p in PROTECTED_PROCESSES)
        return {"valid": not protected, "risky": risky, "requires_approval": risky, "protected": protected}

    def system_info(self):
        return {"os": platform.system(), "release": platform.release(),
                "machine": platform.machine(), "processor": platform.processor(),
                "python": platform.python_version()}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "info"}
        action = payload.get("action", "info")
        if action == "validate":
            res = self.validate_command(payload.get("command", ""))
        elif action == "info":
            res = self.system_info()
        elif action == "launch":
            res = {"app": payload.get("app"), "status": "requested", "requires_approval": False}
        elif action == "terminate":
            proc = payload.get("process", "")
            # Normalize before `.lower()`: a non-string process name raised
            # AttributeError and skipped the protected-process guard.
            proc = proc if isinstance(proc, str) else ("" if proc is None else str(proc))
            if proc.lower() in PROTECTED_PROCESSES:
                res = {"process": proc, "status": "blocked", "reason": "protected process"}
            else:
                res = {"process": proc, "status": "requested"}
        else:
            res = {"ok": True}
        await self.bus.publish("system_control.processed", res, source=self.name)
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **res}

    async def get_state(self):
        return {"name": self.name}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
