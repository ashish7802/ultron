"""Comprehensive audit: exercise every engine's process() and health()."""
import asyncio, os, sys, traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ultron_engine.registry import build_orchestrator

FAILURES = []

async def main():
    orch, bus, state = build_orchestrator()
    await orch.start()
    print(f"Registered engines: {len(orch.engines)}")
    print(f"Routes: {orch._routes}")

    # 1. Health of every engine
    print("\n=== HEALTH ===")
    for name, e in orch.engines.items():
        try:
            h = e.health()
            print(f"  {name}: running={h.get('running')} layer={h.get('layer')}")
        except Exception as ex:
            FAILURES.append(f"health {name}: {ex}")
            print(f"  {name}: HEALTH ERROR {ex}")

    # 2. process() on every engine with a benign payload
    print("\n=== PROCESS (benign payload) ===")
    for name, e in orch.engines.items():
        try:
            r = await e.process({"text": "hello world", "query": "test", "action": "store", "content": "audit item"})
            print(f"  {name}: ok -> {str(r)[:80]}")
        except Exception as ex:
            FAILURES.append(f"process {name}: {ex}")
            print(f"  {name}: PROCESS ERROR {ex}")
            traceback.print_exc()

    # 3. process() with None / empty payloads
    print("\n=== PROCESS (edge payloads) ===")
    for name, e in orch.engines.items():
        for pl in [None, "", [], 0]:
            try:
                r = await e.process(pl)
            except Exception as ex:
                FAILURES.append(f"process {name}({pl!r}): {ex}")
                print(f"  {name}({pl!r}): ERROR {ex}")
                break

    # 4. Memory dedup + correction
    print("\n=== MEMORY ===")
    m = orch.engines["memory"]
    a = await m.process({"action": "store", "content": "audit unique", "tier": "short"})
    print(f"  store: {a}")
    b = await m.process({"action": "store", "content": "audit unique", "tier": "short"})
    print(f"  dup: {b}")
    c = await m.process({"action": "correct", "target": a["id"], "content": "audit corrected"})
    print(f"  correct: {c}")
    rec = await m.process({"action": "recall", "query": "audit"})
    print(f"  recall: {len(rec['items'])} items")

    # 5. Intelligence
    print("\n=== INTELLIGENCE ===")
    i = orch.engines["intelligence"]
    r = await i.process({"text": "open chrome and search python"})
    print(f"  intent: {r['intent']['primary']} ambiguity={r['intent']['ambiguity']}")

    # 6. Multi-agent
    print("\n=== MULTI-AGENT ===")
    ma = orch.engines["multi_agent"]
    r = await ma.process({"goal": "research,code,test"})
    print(f"  steps: {len(r['steps'])}")

    # 7. Context state
    print("\n=== CONTEXT ===")
    cs = orch.engines["context_state"]
    await cs.process({"active_app": "chrome", "active_task": "search"})
    snap = await state.snapshot()
    print(f"  snapshot active_app={snap['active_app']} active_task={snap['active_task']}")

    # 8. Dispatch
    print("\n=== DISPATCH ===")
    d = await orch.dispatch("code_task", {"task": "write a function"})
    print(f"  dispatched: {d['status']} results={len(d.get('results', []))}")

    # 9. broadcast_health
    print("\n=== HEALTH BROADCAST ===")
    h = await orch.broadcast_health()
    print(f"  count: {len(h)}")

    # 10. Server module import
    print("\n=== SERVER MODULE ===")
    try:
        import ultron_engine.server as srv
        if not srv.HAS_FASTAPI:
            # fastapi is an OPTIONAL web-stack dependency; its absence must not
            # fail this engine audit (the module itself still imports cleanly).
            print("  skipped: fastapi not installed (optional dependency)")
        else:
            print(f"  server imported; app={srv.app.title}")
    except Exception as ex:
        FAILURES.append(f"server import: {ex}")
        print(f"  SERVER IMPORT ERROR: {ex}")
        traceback.print_exc()

    await orch.stop()

    print("\n" + "=" * 50)
    if FAILURES:
        print(f"FAILURES ({len(FAILURES)}):")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("ALL AUDIT CHECKS PASSED")

asyncio.run(main())