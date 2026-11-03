"""14. Smart Home / IoT Engine: lights, AC, locks, sensors, Home Assistant."""
import asyncio, time, uuid
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

class SmartHomeEngine(BaseEngine):
    name = "smart_home"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._devices = {}
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("smart_home.*", self._on)

    async def _on(self, ev):
        pass

    def register_device(self, device_id, device_type, state=None):
        # Device state must stay a dict: `command()` later calls
        # `dev["state"].update(...)`, so a list/string state would crash on use.
        if not isinstance(state, dict):
            state = {}
        self._devices[device_id] = {"id": device_id, "type": device_type,
                                    "state": state, "available": True, "verified": False}

    def validate_command(self, device_id, command):
        if device_id not in self._devices:
            return {"valid": False, "reason": "unknown device"}
        dev = self._devices[device_id]
        if not dev["available"]:
            return {"valid": False, "reason": "device unavailable"}
        # Commands come from JSON and may be a bare string/null; `.get` on
        # those raised AttributeError instead of a clean rejection.
        if not isinstance(command, dict):
            return {"valid": False, "reason": "malformed command"}
        allowed = {"light": ["on", "off", "brightness", "color"],
                   "ac": ["on", "off", "temp", "mode"],
                   "lock": ["lock", "unlock"],
                   "sensor": ["read"]}
        if command.get("action") not in allowed.get(dev["type"], []):
            return {"valid": False, "reason": "unsupported action"}
        return {"valid": True}

    async def command(self, device_id, command):
        v = self.validate_command(device_id, command)
        if not v["valid"]:
            return {"device": device_id, "status": "rejected", "reason": v["reason"], "verified": False}
        dev = self._devices[device_id]
        # simulate state update; mark unverified until readback
        dev["state"].update(command)
        dev["verified"] = False
        await self.bus.publish("smart_home.command", {"device": device_id, "command": command}, source=self.name)
        return {"device": device_id, "status": "sent", "verified": False,
                "note": "verification requires readback"}

    async def read_state(self, device_id):
        if device_id not in self._devices:
            return {"error": "unknown device"}
        dev = self._devices[device_id]
        dev["verified"] = True
        return {"device": device_id, "state": dev["state"], "verified": True}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "command"}
        action = payload.get("action", "command")
        if action == "register":
            self.register_device(payload.get("device_id"), payload.get("type"), payload.get("state"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "registered": payload.get("device_id")}
        if action == "command":
            r = await self.command(payload.get("device_id"), payload.get("command", {}))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "read_state":
            r = await self.read_state(payload.get("device_id"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "list":
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "devices": list(self._devices.values())}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "devices": len(self._devices)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
