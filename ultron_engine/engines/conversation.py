"""6. Conversation Engine: turn detection, interruption, response timing."""
import asyncio, time
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

class ConversationEngine(BaseEngine):
    name = "conversation"
    layer = "interaction"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._turns = []
        self._lock = asyncio.Lock()
        self._current_speaker = None
        self._interrupted = False

    async def start(self):
        await super().start()
        self.bus.subscribe("conversation.*", self._on)

    async def _on(self, ev):
        pass

    def detect_turn(self, text: str) -> dict:
        # Payload text may be None/number from JSON; coerce instead of raising
        # AttributeError on `.strip()`.
        if not isinstance(text, str):
            text = "" if text is None else str(text)
        t = (text or "").strip()
        is_question = t.endswith("?")
        is_command = t.lower().startswith(("open", "play", "stop", "set", "turn", "show"))
        turn_type = "question" if is_question else ("command" if is_command else "statement")
        return {"turn_type": turn_type, "is_question": is_question, "is_command": is_command}

    def handle_interruption(self, new_input: str) -> dict:
        self._interrupted = True
        return {"interrupted": True, "previous_aborted": True, "new_input": new_input}

    def response_timing(self, turn_type: str, complexity: float = 0.5) -> dict:
        base = {"question": 200, "command": 100, "statement": 300}.get(turn_type, 250)
        # Complexity comes from the UI and may be null/string; a bad value
        # would raise TypeError on the multiplication.
        try:
            complexity = float(complexity)
        except (TypeError, ValueError):
            complexity = 0.5
        delay = int(base + complexity * 200)
        return {"delay_ms": delay, "stream": complexity > 0.4}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"text": str(payload or "")}
        action = payload.get("action", "turn")
        async with self._lock:
            if action == "turn":
                tt = self.detect_turn(payload.get("text", ""))
                timing = self.response_timing(tt["turn_type"], payload.get("complexity", 0.5))
                res = {**tt, **timing}
            elif action == "interrupt":
                res = self.handle_interruption(payload.get("text", ""))
            elif action == "end_turn":
                self._interrupted = False
                res = {"turn_ended": True}
            else:
                res = {"ok": True}
            self._turns.append({"action": action, "ts": time.time(), "res": res})
            if len(self._turns) > 2000:
                self._turns = self._turns[-1000:]
            await self.bus.publish("conversation.processed", res, source=self.name)
            await self.state.set("last_turn", res)
            return {"id": __import__("uuid").uuid4().__str__(), "engine": self.name, "status": "ok", **res}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "turns": len(self._turns), "interrupted": self._interrupted}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
