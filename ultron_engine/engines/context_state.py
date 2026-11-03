"""2. Context & State Engine: active app, task, history, environment."""
import asyncio, time
from typing import Any, Dict, List
from ..core import BaseEngine, EventBus, SharedState

class ContextStateEngine(BaseEngine):
    name = "context_state"
    layer = "core"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._env = {}
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("context.*", self._on_ctx)

    async def _on_ctx(self, ev):
        pass

    async def set_active_app(self, app):
        await self.state.set("active_app", app)
        await self.bus.publish("context.app_changed", {"app": app}, source=self.name)

    async def set_active_task(self, task):
        await self.state.set("active_task", task)
        await self.bus.publish("context.task_changed", {"task": task}, source=self.name)

    async def set_environment(self, patch):
        # Environment patches come from JSON and may be null/scalar; only a
        # mapping can be merged (`.update` on a string/list raised TypeError).
        if not isinstance(patch, dict):
            patch = {}
        async with self._lock:
            self._env.update(patch)
        await self.state.set("environment", dict(self._env))

    async def process(self, payload=None):
        if isinstance(payload, dict):
            if "active_app" in payload:
                await self.set_active_app(payload["active_app"])
            if "active_task" in payload:
                await self.set_active_task(payload["active_task"])
            if "environment" in payload:
                await self.set_environment(payload["environment"])
        snap = await self.state.snapshot()
        return {"id": __import__("uuid").uuid4().__str__(), "engine": self.name,
                "status": "ok", "snapshot": snap}

    async def get_state(self):
        return await self.state.snapshot()

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
