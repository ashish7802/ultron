import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ultron_engine.registry import build_orchestrator

async def main():
    orch, bus, state = build_orchestrator()
    await orch.start()
    # intelligence
    r = await orch.engines["intelligence"].process({"text": "open chrome and search python"})
    assert r["intent"]["primary"] in ("launch_app","search") or "search" in r["intent"]["intents"], r
    # context
    await orch.engines["context_state"].process({"active_app": "chrome", "active_task": "search"})
    snap = await state.snapshot()
    assert snap["active_app"] == "chrome"
    # memory dedup + correction
    m = orch.engines["memory"]
    a = await m.process({"action": "store", "content": "hello world", "tier": "short"})
    assert a["stored"] is True
    b = await m.process({"action": "store", "content": "hello world", "tier": "short"})
    assert b["stored"] is False and b["reason"] == "duplicate"
    c = await m.process({"action": "correct", "target": a["id"], "content": "hello ULTRON"})
    assert c["corrected"] is True
    rec = await m.process({"action": "recall", "query": "ULTRON"})
    assert any("ULTRON" in str(x["content"]) for x in rec["items"])
    # multi-agent
    ma = await orch.engines["multi_agent"].process({"goal": "research,code,test"})
    assert "steps" in ma and len(ma["steps"]) == 3
    # dispatch
    d = await orch.dispatch("code_task", {"task": "write a function"})
    assert d["status"] == "dispatched"
    # health
    h = await orch.broadcast_health()
    assert len(h) in (32, 33)
    await orch.stop()
    print("ALL TESTS PASSED")

asyncio.run(main())
