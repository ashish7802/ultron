"""8. Personality Engine: persona, emotional cues, concise style."""
import asyncio, time
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

PERSONA = {"name": "ULTRON", "tone": "calm", "style": "concise", "formality": "professional"}

EMOTION_KEYWORDS = {
    "happy": ["great", "awesome", "thanks", "good", "nice", "love"],
    "sad": ["sorry", "sad", "bad", "problem", "issue", "fail"],
    "angry": ["angry", "furious", "hate", "terrible"],
    "calm": ["ok", "sure", "fine", "alright"],
}

class PersonalityEngine(BaseEngine):
    name = "personality"
    layer = "interaction"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("personality.*", self._on)

    async def _on(self, ev):
        pass

    def detect_emotion(self, text: str) -> str:
        if not isinstance(text, str):
            text = "" if text is None else str(text)
        low = (text or "").lower()
        scores = {e: sum(1 for w in ws if w in low) for e, ws in EMOTION_KEYWORDS.items()}
        best = max(scores, key=lambda k: scores[k])
        return best if scores[best] > 0 else "neutral"

    def apply_persona(self, text: str, emotion: str = "neutral") -> dict:
        # concise: trim to first sentence if long
        if not isinstance(text, str):
            text = "" if text is None else str(text)
        s = (text or "").strip()
        if len(s) > 200:
            # cut at first sentence boundary
            import re
            m = re.search(r"[.!?]", s)
            if m and m.end() < len(s):
                s = s[:m.end()]
        prefix = f"[{PERSONA['name']}] "
        return {"original": text, "styled": prefix + s, "emotion": emotion,
                "persona": PERSONA["name"], "concise": len(s) <= 200}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"text": str(payload or "")}
        action = payload.get("action", "style")
        async with self._lock:
            if action == "detect_emotion":
                res = {"emotion": self.detect_emotion(payload.get("text", ""))}
            elif action == "apply":
                emo = payload.get("emotion") or self.detect_emotion(payload.get("text", ""))
                res = self.apply_persona(payload.get("text", ""), emo)
            else:
                emo = self.detect_emotion(payload.get("text", ""))
                res = self.apply_persona(payload.get("text", ""), emo)
            await self.bus.publish("personality.processed", res, source=self.name)
            await self.state.set("personality", res)
            return {"id": __import__("uuid").uuid4().__str__(), "engine": self.name, "status": "ok", **res}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "persona": PERSONA}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
