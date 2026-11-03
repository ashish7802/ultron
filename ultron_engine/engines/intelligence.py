"""1. Intelligence Engine: intent, reasoning, ambiguity, model routing."""
import asyncio, re, time
from typing import Any, Dict, List
from ..core import BaseEngine, EventBus, SharedState

INTENT_PATTERNS = {
 "launch_app": [r"\b(open|launch|start|run)\b"],
 "search": [r"\b(search|find|lookup|google)\b"],
 "code_task": [r"\b(code|debug|fix|refactor|test|deploy)\b"],
 "communicate": [r"\b(email|send|message|call|whatsapp)\b"],
 "system_control": [r"\b(shutdown|restart|volume|brightness|wifi)\b"],
 "smart_home": [r"\b(light|ac|lock|thermostat|sensor)\b"],
 "knowledge": [r"\b(what|who|when|where|why|how|explain)\b"],
 "planning": [r"\b(plan|schedule|organize|arrange)\b"],
}

class IntelligenceEngine(BaseEngine):
    name = "intelligence"
    layer = "core"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._history = []
        self._lock = asyncio.Lock()

    async def start(self):
        await super().start()
        self.bus.subscribe("intent.dispatch", self._on_dispatch)

    async def _on_dispatch(self, ev):
        pass

    def classify_intent(self, text: str) -> Dict:
        # Callers (HTTP payloads, other engines) may pass None/numbers; a plain
        # `.lower()` would raise AttributeError on those, so normalize first.
        low = (text if isinstance(text, str) else ("" if text is None else str(text))).lower()
        scores = {}
        for intent, pats in INTENT_PATTERNS.items():
            s = 0
            for p in pats:
                if re.search(p, low):
                    s += 1
            if s:
                scores[intent] = s
        if not scores:
            scores["general"] = 1
        # primary = highest score
        primary = max(scores, key=lambda k: scores[k])
        # ambiguity: multiple close scores
        vals = sorted(scores.values(), reverse=True)
        ambiguity = 0.0
        if len(vals) > 1 and vals[0] - vals[1] <= 1:
            ambiguity = 0.5 + 0.1 * (vals[1] / max(1, vals[0]))
        ambiguity = min(0.95, ambiguity)
        return {"intents": scores, "primary": primary, "ambiguity": round(ambiguity, 3),
                "confidence": round(1 - ambiguity, 3)}

    def reason(self, text: str, context: dict = None) -> Dict:
        ctx = context or {}
        # `len(text)` below needs a string; coerce for direct (non-process)
        # callers that pass None or non-string payload data.
        if not isinstance(text, str):
            text = "" if text is None else str(text)
        intent = self.classify_intent(text)
        # reasoning chain
        chain = []
        chain.append({"step": "parse", "result": text[:100]})
        chain.append({"step": "intent", "result": intent["primary"]})
        chain.append({"step": "ambiguity_check", "result": intent["ambiguity"]})
        if intent["ambiguity"] > 0.6:
            chain.append({"step": "clarify", "result": "ask_user"})
        complexity = min(1.0, len(text)/300.0 + 0.2*len(intent["intents"]))
        chain.append({"step": "complexity", "result": round(complexity, 3)})
        route = "cloud" if complexity > 0.55 else "local"
        chain.append({"step": "route", "result": route})
        return {"intent": intent, "complexity": round(complexity, 3), "route": route,
                "chain": chain, "needs_clarification": intent["ambiguity"] > 0.6}

    async def process(self, payload=None):
        text = ""
        if isinstance(payload, dict):
            text = payload.get("text", payload.get("query", ""))
        else:
            text = str(payload or "")
        ctx = await self.state.snapshot()
        res = self.reason(text, ctx)
        async with self._lock:
            self._history.append({"ts": time.time(), "text": text, "result": res})
            if len(self._history) > 5000:
                self._history = self._history[-2500:]
        await self.state.set("last_intent", res["intent"]["primary"])
        await self.bus.publish("intelligence.processed", res, source=self.name)
        return {"id": __import__("uuid").uuid4().__str__(), "engine": self.name,
                "status": "ok", **res}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "history_len": len(self._history)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running,
                "history_len": len(self._history)}
