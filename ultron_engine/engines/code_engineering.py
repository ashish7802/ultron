"""15. Code & Engineering Engine: code, debug, test, git, deploy, CAD."""
import asyncio, time, uuid, subprocess, os
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

class CodeEngineeringEngine(BaseEngine):
    name = "code_engineering"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("code_engineering.*", self._on)

    async def _on(self, ev):
        pass

    def syntax_check(self, code, lang="python"):
        # `compile()` requires str/bytes/AST.  Payload code is often a number or
        # null from the UI, producing TypeError/ValueError instead of a
        # structured "syntax failed" result -- normalize and report instead.
        if not isinstance(code, (str, bytes)):
            code = "" if code is None else str(code)
        if lang == "python":
            try:
                compile(code, "<ultron>", "exec")
                return {"ok": True, "error": None}
            except (SyntaxError, ValueError, TypeError) as e:
                return {"ok": False, "error": str(e)}
        return {"ok": True, "error": None, "note": "syntax check not implemented for " + str(lang)}

    def run_tests(self, cwd=None, cmd=None):
        cmd = cmd or ["python", "-m", "pytest", "-q"]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=cwd)
            return {"returncode": r.returncode, "stdout": r.stdout[-2000:], "stderr": r.stderr[-2000:],
                    "passed": r.returncode == 0}
        except Exception as e:
            return {"returncode": -1, "error": str(e), "passed": False}

    def git_status(self, cwd=None):
        try:
            r = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, timeout=30, cwd=cwd)
            return {"output": r.stdout, "clean": not r.stdout.strip()}
        except Exception as e:
            return {"error": str(e)}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "syntax", "code": str(payload or "")}
        action = payload.get("action", "syntax")
        if action == "syntax":
            r = self.syntax_check(payload.get("code", ""), payload.get("lang", "python"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "test":
            r = self.run_tests(payload.get("cwd"), payload.get("cmd"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "git_status":
            r = self.git_status(payload.get("cwd"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "debug":
            # Error details can be a nested object; slicing a dict raises
            # TypeError, so render it to text first.
            err = payload.get("error", "")
            if not isinstance(err, str):
                err = "" if err is None else str(err)
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok",
                    "diagnosis": f"Review: {err[:200]}", "suggestion": "check syntax and dependencies"}
        if action == "cad":
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok",
                    "note": "CAD requires external tool; not available natively"}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        return {"name": self.name}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
