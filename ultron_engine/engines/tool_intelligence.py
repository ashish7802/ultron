"""12. Tool Intelligence Engine: selection, validation, chaining, fallback."""
import asyncio, time, uuid
from typing import Any, Dict, List
from ..core import BaseEngine, EventBus, SharedState

class ToolIntelligenceEngine(BaseEngine):
    name = "tool_intelligence"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._tools = {}
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("tool_intelligence.*", self._on)

    async def _on(self, ev):
        pass

    def register_tool(self, name, capabilities, permissions=None):
        # Capabilities/permissions must be iterables: the selector does
        # membership tests over them, so null/scalar values crashed the engine.
        if not isinstance(capabilities, (list, tuple, set)):
            capabilities = [] if capabilities is None else [capabilities]
        if not isinstance(permissions, (list, tuple, set)):
            permissions = [] if permissions is None else [permissions]
        self._tools[name] = {"name": name, "capabilities": list(capabilities),
                            "permissions": list(permissions), "available": True}
        # Tool registration is reachable from the HTTP API; bound the registry
        # so a registration flood cannot exhaust memory.
        if len(self._tools) > 1000:
            for old in list(self._tools)[:-500]:
                del self._tools[old]

    def select(self, intent, required_caps, available_permissions=None):
        if not isinstance(required_caps, (list, tuple, set)):
            required_caps = [] if required_caps is None else [required_caps]
        if not isinstance(available_permissions, (list, tuple, set)):
            available_permissions = []
        candidates = []
        for tname, t in self._tools.items():
            if not t["available"]:
                continue
            if not all(c in t["capabilities"] for c in required_caps):
                continue
            if not all(p in available_permissions for p in t["permissions"]):
                continue
            candidates.append(tname)
        # prefer exact name match
        intent_text = intent if isinstance(intent, str) else ("" if intent is None else str(intent))
        for c in candidates:
            if intent_text and intent_text.lower() in c.lower():
                return c
        return candidates[0] if candidates else None

    def chain(self, steps):
        # validate sequential chain: each step output feeds next
        validated = []
        if not isinstance(steps, (list, tuple)):
            steps = [] if steps is None else [steps]
        for i, s in enumerate(steps):
            # Steps are user-supplied objects; a bare string previously raised
            # AttributeError on `.get`.
            if not isinstance(s, dict):
                s = {"tool": s}
            validated.append({"step": i, "tool": s.get("tool"), "input": s.get("input"),
                              "depends_on": s.get("depends_on", i - 1 if i > 0 else None)})
        return validated

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "select"}
        action = payload.get("action", "select")
        if action == "register":
            self.register_tool(payload.get("name"), payload.get("capabilities", []),
                              payload.get("permissions", []))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "registered": payload.get("name")}
        if action == "select":
            sel = self.select(payload.get("intent", ""), payload.get("capabilities", []),
                              payload.get("permissions", []))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "selected": sel}
        if action == "chain":
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok",
                    "chain": self.chain(payload.get("steps", []))}
        if action == "list":
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "tools": list(self._tools.values())}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "tools": len(self._tools)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
