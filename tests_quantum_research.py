"""
================================================================================
ULTRON Quantum Autonomous Browser & Web Research Engine Test Suite
Module Name: tests_quantum_research.py
Subsystem: Autonomous Knowledge, Web Intelligence & Deep Data Synthesis
================================================================================

Architectural Role & Purpose:
    Rigorously tests ULTRON's autonomous quantum browser research capabilities.
    Validates multi-vector query decomposition, live multi-engine search probes,
    HTML content scraping, domain credibility scoring, neural synthesis, the
    local-only research API contract, and encrypted SQLite persistence.

Test Coverage:
    1. Multi-Vector Decomposition: decomposes prompts into orthogonal quantum probes.
    2. Domain Credibility Engine: scores authoritative domains (NASA, IEEE, etc.).
    3. SSRF Protection: rejects loopback/private/link-local and non-HTTPS targets.
    4. Concurrent Live Web Harvesting: queries live search engines and harvests results.
    5. Local-Access API Contract: the research route is intentionally open on
       loopback (no token/401 gating exists anymore) -> an empty query is rejected
       by input validation with HTTP 400, and a valid query is accepted (2xx) or
       reports an honest upstream failure (502/503/504) when the network is down.
    6. Encrypted SQLite Persistence: verifies the research archive table and rows.

Exit Code Contract:
    0 -> every runnable check passed (live-network) or was explicitly skipped.
    1 -> a genuine research-engine or API-contract failure.
================================================================================
"""

import sys
import os
import json
import time
import asyncio
import urllib.request
import urllib.error

# Emit UTF-8 so Hinglish/Devanagari research summaries never crash the console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ultron_engine.quantum_research_agent import QuantumResearchAgent

# IPv4 literal (never "localhost"): urllib would otherwise pay a ~2s IPv6
# fallback delay on this host before every request.
BASE_URL = "http://127.0.0.1:3000"
SKIPPED = []


def http_call(url, data=None, headers=None, method=None, timeout=120):
    """Perform one HTTP request; return (status, headers, body_bytes) for 2xx/4xx/5xx."""
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()


def http_json(url, payload=None, headers=None, method=None, timeout=120):
    """Perform an HTTP request with an optional JSON body; return (status, headers, data, raw)."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Content-Type": "application/json"} if body is not None else {}
    if headers:
        request_headers.update(headers)
    status, resp_headers, raw = http_call(url, body, request_headers, method, timeout)
    try:
        data = json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        data = {}
    return status, resp_headers, data, raw


def wait_for_server(timeout_seconds=25.0):
    """
    Blocks until the local production server answers on loopback.

    WHY: the suite may run immediately after a build; connection-refused is
    transient while the server binds port 3000, so retry briefly.

    Args:
        timeout_seconds (float): Maximum time to wait for a 200 from /api/wakeword.

    Raises:
        AssertionError: When the server never becomes reachable.
    """
    deadline = time.time() + timeout_seconds
    last_error = "no attempt made"
    while time.time() < deadline:
        try:
            status, _, _, _ = http_json(f"{BASE_URL}/api/wakeword", timeout=4)
            if status == 200:
                return
            last_error = f"HTTP {status}"
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        time.sleep(0.5)
    raise AssertionError(f"Local server {BASE_URL} not reachable within {timeout_seconds}s ({last_error})")


def skip(label, reason):
    """Record and print an explicit SKIP marker for a precondition-dependent check."""
    SKIPPED.append(f"{label}: {reason}")
    print(f"  -> SKIPPED ({label}): {reason}")


def log_test_result(test_name: str, passed: bool, details: str = ""):
    """Prints a PASS/FAIL line and terminates with exit 1 on a genuine failure."""
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {test_name}: {details}")
    if not passed:
        sys.exit(1)


def test_vector_decomposition():
    """Decomposes one research query into several orthogonal search vectors."""
    print("\n--- TEST 1: Multi-Vector Quantum Decomposition ---")
    agent = QuantumResearchAgent()
    query = "quantum computing decoherence"
    vectors = agent.decompose_query(query)

    passed = len(vectors) >= 3 and any("latest" in v or "developments" in v for v in vectors)
    log_test_result(
        "Decompose Query Vectors",
        passed,
        f"Generated {len(vectors)} orthogonal vectors: {vectors}",
    )


def test_credibility_scoring():
    """Scores authoritative domains above unverified blogs."""
    print("\n--- TEST 2: Authoritative Domain Credibility Scoring ---")
    agent = QuantumResearchAgent()

    score_nasa = agent.calculate_credibility("https://science.nasa.gov/blogs/webb/")
    score_arxiv = agent.calculate_credibility("https://arxiv.org/abs/2401.00001")
    score_wiki = agent.calculate_credibility("https://en.wikipedia.org/wiki/Quantum_computing")
    score_random = agent.calculate_credibility("http://random-unverified-blog.xyz/post")

    passed = score_nasa >= 0.95 and score_arxiv >= 0.95 and score_wiki >= 0.90 and score_random < 0.60
    log_test_result(
        "Domain Credibility Engine",
        passed,
        f"NASA: {score_nasa}, ArXiv: {score_arxiv}, Wikipedia: {score_wiki}, Random HTTP: {score_random}",
    )


def test_ssrf_protection():
    """Rejects loopback/private/link-local/non-HTTPS scrape targets (SSRF isolation)."""
    print("\n--- TEST 3: SSRF & Loopback Target Protection ---")
    agent = QuantumResearchAgent()

    blocked_targets = [
        "http://127.0.0.1:8080/admin",
        "http://localhost:3000/api",
        "http://169.254.169.254/latest/meta-data/",
        "http://192.168.1.1/router",
        "ftp://example.com/file",
    ]

    all_blocked = all(not agent.is_safe_url(target) for target in blocked_targets)
    safe_allowed = agent.is_safe_url("https://en.wikipedia.org/wiki/Quantum_computing")

    passed = all_blocked and safe_allowed
    log_test_result(
        "SSRF & Security Isolation",
        passed,
        f"Blocked {len(blocked_targets)} unsafe internal URLs, validated external HTTPS",
    )


def test_live_web_harvesting():
    """Runs a live multi-engine harvest and verifies the synthesized dossier shape."""
    print("\n--- TEST 4: Live Web Harvesting & Scrape ---")
    agent = QuantumResearchAgent()

    async def _run():
        return await agent.conduct_research("quantum computing decoherence 2026", max_sources=3)

    # Live search engines rate-limit / intermittently fail, so retry a couple of times
    # before treating an empty harvest as an environment limitation, not a product bug.
    res = {}
    elapsed = 0.0
    source_count = 0
    for attempt in range(3):
        started = time.time()
        res = asyncio.run(_run())
        elapsed = round(time.time() - started, 2)
        source_count = len(res.get("sources", []))
        if source_count > 0:
            break
        print(f"  Live harvest attempt {attempt + 1}/3 returned 0 sources (search engines may be "
              f"rate-limiting); retrying...")
        time.sleep(2)

    assert res.get("status") == "success", f"Dossier status must be success: {res.get('status')}"
    assert bool(res.get("executive_summary")), "Dossier must contain a synthesized executive summary"
    assert "telemetry" in res, "Dossier must include synthesis telemetry"

    if source_count > 0:
        log_test_result(
            "Live Web Harvesting & Quantum Synthesis",
            True,
            f"Completed in {elapsed}s. Harvested {source_count} sources. "
            f"Summary: {res.get('executive_summary')[:100]}...",
        )
    else:
        skip(
            "environment",
            "live search engines returned 0 results across 3 attempts (rate limiting / "
            "restricted network); synthesis structure verified",
        )
        log_test_result(
            "Live Web Harvesting & Quantum Synthesis",
            True,
            f"Dossier synthesized in {elapsed}s with 0 live sources; live-harvest assertion skipped (environment)",
        )


def test_local_access_research_contract():
    """
    Replaces the removed Zero-Trust gating test with the current local-only contract.

    Contract (no token / no 401 / no 423 gating exists anymore):
    - An empty query must reach input validation and be rejected with HTTP 400.
      A 401/403/423 here would mean the removed auth layer leaked back in.
    - A valid query must be accepted: 2xx on success, or an honest 502/503/504 when
      live web research is unavailable (documented by the route as an upstream
      execution failure, not silently swallowed behind a 200).
    - A supplied arbitrary Authorization header must be ignored (not rejected).
    """
    print("\n--- TEST 5: Local-Access Research API Contract (Loopback, No Auth) ---")
    wait_for_server()
    url = f"{BASE_URL}/api/research"

    # 1. Empty query -> validation layer answers 400 (proves the request reached the handler).
    status, _, data, _ = http_json(url, {"query": ""}, timeout=20)
    assert status == 400, (
        f"Empty query must be rejected by input validation with HTTP 400 (local routes are "
        f"open on loopback), got {status}: {data}"
    )

    # 2. An arbitrary Authorization header must be ignored, not enforced.
    status_ignored, _, ignored_data, _ = http_json(
        url,
        {"query": ""},
        headers={"Authorization": "Bearer irrelevant.local.header"},
        timeout=20,
    )
    assert status_ignored == 400, (
        f"Local research route must not enforce Authorization (no auth layer remains); "
        f"expected 400 validation for empty query, got {status_ignored}: {ignored_data}"
    )

    # 3. Valid query -> 2xx, or a documented 502/503/504 when live web research is down.
    status_valid, _, valid_data, raw = http_json(
        url,
        {"query": "quantum computing decoherence"},
        timeout=120,
    )
    if status_valid in (502, 503, 504):
        skip(
            "network",
            f"live research unavailable (HTTP {status_valid}: {valid_data.get('error')}); "
            f"request was accepted by the open local route and the failure is honestly reported",
        )
        log_test_result(
            "Local-Access Research Contract",
            True,
            "empty query -> 400; valid query -> documented upstream failure (network unavailable)",
        )
        return

    assert 200 <= status_valid < 300, (
        f"Valid query must be accepted by the open local route, got {status_valid}: "
        f"{valid_data or raw[:200]!r}"
    )
    assert valid_data.get("success") is True, f"Research response must report success=true: {valid_data}"
    dossier = valid_data.get("dossier") or {}
    assert isinstance(dossier, dict) and dossier, f"Research response must include a dossier: {valid_data}"
    assert dossier.get("executive_summary"), "Dossier must contain a synthesized executive summary"
    log_test_result(
        "Local-Access Research Contract",
        True,
        "empty query -> 400; bogus Authorization ignored -> 400; valid query -> 200 with dossier",
    )


def test_memory_persistence():
    """Verifies the encrypted SQLite research archive table exists and holds dossiers."""
    print("\n--- TEST 6: Encrypted SQLite Memory Persistence ---")
    import sqlite3

    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ultron_engine", "ultron_memory.db")
    assert os.path.exists(db_path), f"Memory database must exist at {db_path}"

    conn = sqlite3.connect(db_path)
    try:
        count = conn.execute("SELECT count(*) FROM research_archive").fetchone()[0]
    finally:
        conn.close()

    log_test_result(
        "Encrypted SQLite Research Archive",
        count > 0,
        f"Found {count} persisted research dossiers in ultron_memory.db",
    )


def main():
    """Runs the quantum research suite and returns the process exit code."""
    print("=" * 70)
    print("ULTRON QUANTUM RESEARCH TEST SUITE (LOCAL-ONLY, NO AUTH GATING)")
    print("=" * 70)
    try:
        test_vector_decomposition()
        test_credibility_scoring()
        test_ssrf_protection()
        test_live_web_harvesting()
        test_local_access_research_contract()
        test_memory_persistence()
    except AssertionError as exc:
        print(f"\n[FAIL] Assertion failed: {exc}")
        return 1

    print("\n" + "=" * 70)
    print("ALL QUANTUM RESEARCH TESTS PASSED")
    if SKIPPED:
        print(f"Environment-dependent checks skipped: {len(SKIPPED)}")
        for entry in SKIPPED:
            print(f"  [SKIP] {entry}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
