"""
Master Evaluation & Benchmark Runner for ULTRON.
Executes comprehensive evaluation across all 7 core pillars:
1. Hybrid Intent & Brain Router
2. SQLite Permanent Memory & Semantic FTS5
3. Real Computer Control & Safety Confirmation Gates
4. Controlled Agent Planning Loop (Understand -> Plan -> Execute -> Verify -> Report)
5. Tool Calling & Schema Compliance
6. Anti-Hallucination & Factual Accuracy
"""

import sys
import subprocess
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def run_suite(name: str, script_name: str, args: list = None) -> bool:
    print("\n" + "#" * 70)
    print(f"  RUNNING SUITE: {name}")
    print("#" * 70)
    cmd = [sys.executable, script_name] + (args or [])
    res = subprocess.run(cmd)
    return res.returncode == 0

def main():
    start_time = time.time()
    print("=" * 70)
    print("      ULTRON FULL REVOLUTION EVALUATION & VERIFICATION SUITE")
    print("=" * 70)

    results = {}

    results["1. Hybrid Intent Router"] = run_suite("Hybrid Intent Router", "tests/test_router.py")
    results["2. Permanent Memory (SQLite + FTS5)"] = run_suite("Permanent Memory System", "tests/test_memory_system.py")
    results["3. Real Computer Control & Safety"] = run_suite("Computer Control & Safety Gates", "tests/test_computer_control.py")
    results["4. Autonomous Agent Planner"] = run_suite("Agent Planner Loop", "tests/test_agent_planner.py")
    results["5. Tool Calling (Smart Brain 1.5B)"] = run_suite("Tool Calling Accuracy", "tests/test_tool_calling.py", ["qwen2.5:1.5b"])
    results["6. Anti-Hallucination & Factual Verification"] = run_suite("Anti-Hallucination & Verification", "tests/test_hallucination.py")

    total_time = time.time() - start_time
    print("\n" + "=" * 70)
    print("                     OVERALL EVALUATION RESULTS")
    print("=" * 70)
    all_passed = True
    for suite, ok in results.items():
        status = "PASSED [OK]" if ok else "FAILED [X]"
        print(f"  {suite:<45} : {status}")
        if not ok:
            all_passed = False

    print("-" * 70)
    print(f"Total Execution Time: {total_time:.2f}s")
    print(f"Final Status: {'ALL SUITES PASSED' if all_passed else 'SOME SUITES REPORTED ISSUES'}")
    print("=" * 70)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
