"""17. Communication Engine: email, calls, WhatsApp, calendar, meeting summary."""
import asyncio, time, uuid, re
from typing import Any, Dict
from ..core import BaseEngine, EventBus, SharedState

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class CommunicationEngine(BaseEngine):
    name = "communication"
    layer = "action"

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()
        self._outbox = []

    async def start(self):
        await super().start()
        self.bus.subscribe("communication.*", self._on)

    async def _on(self, ev):
        pass

    def validate_recipient(self, r):
        if isinstance(r, str):
            return EMAIL_RE.match(r) is not None
        return False

    def draft_message(self, channel, to, body, subject=None):
        if isinstance(to, str):
            recipients = [to]
        elif isinstance(to, (list, tuple, set)):
            recipients = list(to)
        elif to is None:
            recipients = []
        else:
            recipients = []
        return {"channel": channel, "to": to, "subject": subject, "body": body,
                "valid_recipients": all(self.validate_recipient(x) for x in recipients) if recipients else False,
                "requires_approval": True}

    async def send(self, channel, to, body, subject=None, approved=False):
        if not approved:
            return {"status": "pending_approval", "channel": channel, "to": to}
        if isinstance(to, str):
            recipients = [to]
        elif isinstance(to, (list, tuple, set)):
            recipients = list(to)
        elif to is None:
            recipients = []
        else:
            recipients = []
        if not recipients or not all(self.validate_recipient(r) for r in recipients):
            return {"status": "invalid_recipient", "channel": channel}
        msg = {"id": str(uuid.uuid4()), "channel": channel, "to": recipients,
               "subject": subject, "body": body, "status": "queued", "ts": time.time()}
        async with self._lock:
            self._outbox.append(msg)
            # The outbox previously grew without bound (every sent message kept
            # its full body forever); trim it like the other engine histories.
            if len(self._outbox) > 5000:
                self._outbox = self._outbox[-2500:]
        await self.bus.publish("communication.queued", msg, source=self.name)
        return {"status": "queued", "id": msg["id"]}

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "draft"}
        action = payload.get("action", "draft")
        if action == "draft":
            r = self.draft_message(payload.get("channel", "email"), payload.get("to"),
                                   payload.get("body", ""), payload.get("subject"))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "send":
            r = await self.send(payload.get("channel", "email"), payload.get("to"),
                                payload.get("body", ""), payload.get("subject"), payload.get("approved", False))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **r}
        if action == "summarize_meeting":
            text = payload.get("transcript", "")
            # Transcript may be null/object from the UI; re.split needs text.
            if not isinstance(text, str):
                text = "" if text is None else str(text)
            # simple summary: first 2 sentences
            sents = re.split(r"[.!?]", text)
            summary = ". ".join(s.strip() for s in sents[:2] if s.strip())
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "summary": summary}
        if action == "outbox":
            async with self._lock:
                return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "outbox": self._outbox[-50:]}
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok"}

    async def get_state(self):
        async with self._lock:
            return {"name": self.name, "outbox": len(self._outbox)}

    def health(self):
        return {"name": self.name, "layer": self.layer, "running": self._running}
