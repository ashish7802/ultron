"""7. Voice Synthesis (TTS) Engine: natural voice, emotion, streaming."""
import asyncio, time
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

EMOTION_PROSODY = {
    "neutral": {"rate": 1.0, "pitch": 1.0, "volume": 1.0},
    "happy": {"rate": 1.1, "pitch": 1.15, "volume": 1.0},
    "sad": {"rate": 0.9, "pitch": 0.9, "volume": 0.85},
    "angry": {"rate": 1.15, "pitch": 0.95, "volume": 1.1},
    "calm": {"rate": 0.95, "pitch": 1.0, "volume": 0.9},
}

class TTSEngine(BaseEngine):
    name = "tts"
    layer = "interaction"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._queue = []
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("tts.*", self._on)

    async def _on(self, ev):
        pass

    def synthesize(self, text: str, emotion: str = "neutral") -> dict:
        # Payload text may be None/number; `len(text)`/slicing would raise.
        if not isinstance(text, str):
            text = "" if text is None else str(text)
        # Emotion is used as a dict key: an unhashable value (list/dict) would
        # raise TypeError, so fall back to the neutral prosody.
        if not isinstance(emotion, str):
            emotion = "neutral"
        prosody = EMOTION_PROSODY.get(emotion, EMOTION_PROSODY["neutral"])
        # chunk for streaming
        chunks = [text[i:i+120] for i in range(0, len(text), 120)] or [""]
        return {"text": text, "emotion": emotion, "prosody": prosody,
                "chunks": chunks, "chunk_count": len(chunks), "chars": len(text)}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"text": str(payload or "")}
        action = payload.get("action", "synthesize")
        async with self._lock:
            if action == "synthesize":
                res = self.synthesize(payload.get("text", ""), payload.get("emotion", "neutral"))
            elif action == "stream":
                s = self.synthesize(payload.get("text", ""), payload.get("emotion", "neutral"))
                res = {"streaming": True, "chunks": s["chunks"], "chunk_count": s["chunk_count"]}
            elif action == "stop":
                self._queue.clear()
                res = {"stopped": True}
            else:
                res = {"ok": True}
            await self.bus.publish("tts.processed", res, source=self.name)
            return {"id": __import__("uuid").uuid4().__str__(), "engine": self.name, "status": "ok", **res}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "queue_len": len(self._queue)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
