"""16. Simulation / Digital Twin Engine: 3D, physics, what-if."""
import asyncio, time, uuid, math
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

class SimulationEngine(BaseEngine):
    name = "simulation"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()
        self._scenarios = {}

    async def start(self):
        await super().start()
        self.bus.subscribe("simulation.*", self._on)

    async def _on(self, ev):
        pass

    def physics_calc(self, params):
        # basic kinematics: distance = v*t + 0.5*a*t^2
        if not isinstance(params, dict):
            params = {}
        # UI-supplied kinematics may be null/strings; coerce so multiplication
        # and comparisons stay numeric.
        try:
            v = float(params.get("velocity", 0.0))
        except (TypeError, ValueError):
            v = 0.0
        try:
            t = float(params.get("time", 1.0))
        except (TypeError, ValueError):
            t = 1.0
        try:
            a = float(params.get("acceleration", 0.0))
        except (TypeError, ValueError):
            a = 0.0
        dist = v * t + 0.5 * a * t * t
        return {"distance": dist, "type": "kinematics", "estimated": False}

    def what_if(self, base, changes):
        # apply changes to base params and recompute
        if not isinstance(base, dict):
            base = {}
        if not isinstance(changes, dict):
            changes = {}
        merged = dict(base)
        merged.update(changes)
        return {"base": base, "changes": changes, "result": merged, "estimated": True}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "physics"}
        action = payload.get("action", "physics")
        if action == "physics":
            r = self.physics_calc(payload.get("params", {}))
        elif action == "what_if":
            r = self.what_if(payload.get("base", {}), payload.get("changes", {}))
        elif action == "scenario":
            sid = str(uuid.uuid4())
            self._scenarios[sid] = payload
            # Scenarios were never evicted; bound the store like every other
            # engine history so repeated simulations cannot exhaust memory.
            if len(self._scenarios) > 1000:
                for old in list(self._scenarios)[:-500]:
                    del self._scenarios[old]
            r = {"scenario_id": sid, "stored": True}
        else:
            r = {"ok": True, "note": "simulation requires external libs for 3D"}
        await self.bus.publish("simulation.processed", r, source=self.name)
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "scenarios": len(self._scenarios)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
