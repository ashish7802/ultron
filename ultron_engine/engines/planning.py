"""10. Planning Engine: decomposition, dependency graph, scheduling, replanning."""
import asyncio, time, uuid
from typing import Any, Dict, List
from ..core import BaseEngine, EventBus, SharedState

class PlanningEngine(BaseEngine):
    name = "planning"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._plans = {}
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("planning.*", self._on)

    async def _on(self, ev):
        pass

    def decompose(self, goal):
        # Goals arrive from JSON and may be null/objects; `.replace()` would
        # raise AttributeError on those.
        if not isinstance(goal, str):
            goal = "" if goal is None else str(goal)
        parts = [s.strip() for s in (goal or "").replace(";", ",").split(",") if s.strip()]
        if not parts:
            parts = [goal] if goal else ["noop"]
        return parts

    def build_graph(self, steps):
        graph = []
        for i, s in enumerate(steps):
            deps = [i - 1] if (i > 0 and "parallel" not in s.lower() and "independent" not in s.lower()) else []
            graph.append({"id": i, "task": s, "deps": deps, "status": "pending",
                          "priority": 1, "retries": 0})
        return graph

    async def create_plan(self, goal):
        steps = self.decompose(goal)
        graph = self.build_graph(steps)
        pid = str(uuid.uuid4())
        plan = {"id": pid, "goal": goal, "steps": graph, "status": "created",
                "created_at": time.time(), "current": 0}
        async with self._lock:
            self._plans[pid] = plan
            # Plans are never queried by anything but id and would otherwise
            # accumulate forever in a long-running orchestrator; keep a FIFO
            # window of the most recent plans.
            if len(self._plans) > 1000:
                for old_pid in list(self._plans)[:-500]:
                    del self._plans[old_pid]
        await self.bus.publish("planning.created", plan, source=self.name)
        await self.state.set("active_plan", pid)
        return plan

    async def update_status(self, pid, step_id, status):
        async with self._lock:
            plan = self._plans.get(pid)
            if not plan:
                return {"error": "plan not found"}
            for s in plan["steps"]:
                if s["id"] == step_id:
                    s["status"] = status
                    if status == "failed":
                        s["retries"] += 1
            failed = [s for s in plan["steps"] if s["status"] == "failed" and s["retries"] >= 3]
            if failed:
                plan["status"] = "needs_replan"
            elif all(s["status"] in ("done", "skipped") for s in plan["steps"]):
                plan["status"] = "complete"
            else:
                plan["status"] = "running"
        await self.bus.publish("planning.status", {"plan_id": pid, "step": step_id, "status": status}, source=self.name)
        return self._plans[pid]

    async def replan(self, pid, failed_step):
        # `failed_step` may be null/string instead of the expected dict.
        if not isinstance(failed_step, dict):
            failed_step = {}
        async with self._lock:
            plan = self._plans.get(pid)
            if not plan:
                return {"error": "plan not found"}
            new_step = {"id": len(plan["steps"]), "task": f"retry: {failed_step.get('task','')}",
                        "deps": [], "status": "pending", "priority": 2, "retries": 0}
            plan["steps"].append(new_step)
            plan["status"] = "replanned"
        await self.bus.publish("planning.replanned", {"plan_id": pid}, source=self.name)
        return plan

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "create", "goal": str(payload or "")}
        action = payload.get("action", "create")
        if action == "create":
            plan = await self.create_plan(payload.get("goal", ""))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "plan": plan}
        if action == "update":
            plan = await self.update_status(payload.get("plan_id"), payload.get("step_id"), payload.get("status", "done"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "plan": plan}
        if action == "replan":
            plan = await self.replan(payload.get("plan_id"), payload.get("step", {}))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "plan": plan}
        if action == "get":
            async with self._lock:
                plan = self._plans.get(payload.get("plan_id"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "plan": plan}
        if action == "list":
            async with self._lock:
                plans = list(self._plans.values())
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "plans": plans}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "plans": len(self._plans)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
