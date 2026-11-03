"""Ollama LLM engine – routes Ultron intelligence calls to a locally-running Ollama model.

Why:
- Provides a lightweight, CPU/local LLM option for offline inference.
- Interfaces with local Ollama daemon without crashing if the optional package isn't installed.

How:
- Dynamically imports `ollama` or falls back gracefully to a lightweight mock/offline responder.
- Handles model checks and chat completions asynchronously.
"""

from __future__ import annotations
import asyncio
from typing import Any, Dict

from ..core import BaseEngine, EventBus, SharedState

try:
    import ollama
    HAS_OLLAMA = True
except ImportError:
    ollama = None
    HAS_OLLAMA = False

_MODEL_NAME = "qwen2.5:0.5b"  # Default lightweight model or user-configured model

class OllamaLlmEngine(BaseEngine):
    """Engine that forwards prompts to Ollama and returns model responses."""

    name = "ollama_llm"
    layer = "core"

    def __init__(self, bus: EventBus, state: SharedState) -> None:
        super().__init__(bus, state)
        self._client = ollama.Client() if HAS_OLLAMA else None
        self._model_ready = False

    async def _ensure_model(self) -> None:
        """Pull the model once if not already available locally."""
        if not HAS_OLLAMA or not self._client:
            return
        if not self._model_ready:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, lambda: self._client.pull(_MODEL_NAME))
                self._model_ready = True
            except Exception:
                # If offline or daemon unreachable, proceed with available models or fallback
                pass

    async def process(self, payload: Any = None) -> Dict[str, Any]:
        """Generate a response for `payload['prompt']` or return fallback message.

        Args:
            payload: Engine payload. The FastAPI layer forwards
                ``body.get("payload")`` verbatim, so this may be a dict, a bare
                string/list (e.g. "" from an empty UI query), a number or
                ``None`` -- never assume ``.get`` exists.

        Returns:
            dict: Engine envelope with ``engine``, ``status``, ``response`` and
            ``fallback`` keys.
        """
        # Normalize every inbound shape to a prompt string first.  Previously a
        # non-dict payload hit `payload.get(...)` and raised AttributeError.
        prompt = self._extract_prompt(payload)
        
        if not HAS_OLLAMA or not self._client:
            return {
                "engine": self.name,
                "status": "ok",
                "response": f"Ollama client not installed. Received query: '{prompt}'",
                "fallback": True
            }

        await self._ensure_model()
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._client.generate(model=_MODEL_NAME, prompt=prompt, stream=False)
            )
            return {
                "engine": self.name,
                "status": "ok",
                "response": result.get("response", "") if isinstance(result, dict) else str(result),
                "fallback": False
            }
        except Exception as e:
            return {
                "engine": self.name,
                "status": "ok",
                "response": f"ULTRON Core (Local): {prompt}",
                "error": str(e),
                "fallback": True
            }

    @staticmethod
    def _extract_prompt(payload: Any) -> str:
        """Coerces any supported payload shape into the prompt text.

        Args:
            payload: Raw engine payload (dict, string, list, number or None).

        Returns:
            str: Prompt text; empty string when no prompt information exists.
        """
        if payload is None:
            return ""
        if isinstance(payload, dict):
            value = payload.get("prompt", payload.get("text", ""))
        else:
            value = payload
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        # Lists/numbers are appended to the offline fallback string, so render
        # them deterministically instead of leaking Python repr as "the answer".
        return str(value)

    def health(self) -> Dict[str, Any]:
        """Health check reporting engine operational status."""
        return {
            "name": self.name,
            "layer": self.layer,
            "running": self._running,
            "ollama_available": HAS_OLLAMA
        }
