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
        try:
            from ..computer import desktop_engine
            return desktop_engine.get_os_metadata()
        except Exception:
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
            app_target = payload.get("app")
            try:
                from ..computer import app_manager
                res = app_manager.launch_app(str(app_target or ""))
            except Exception as e:
                res = {"app": app_target, "status": "failed", "error": str(e), "requires_approval": False}
        elif action == "terminate":
            proc = payload.get("process", "")
            proc = proc if isinstance(proc, str) else ("" if proc is None else str(proc))
            if proc.lower() in PROTECTED_PROCESSES:
                res = {"process": proc, "status": "blocked", "reason": "protected process"}
            else:
                try:
                    from ..computer import app_manager
                    term_res = app_manager.terminate_app(proc)
                    res = {"process": proc, "status": "terminated" if term_res.get("success") else "failed", **term_res}
                except Exception as e:
                    res = {"process": proc, "status": "failed", "error": str(e)}
        else:
            res = {"ok": True}
        await self.bus.publish("system_control.processed", res, source=self.name)
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **res}

    async def get_state(self):
        return {"name": self.name}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
