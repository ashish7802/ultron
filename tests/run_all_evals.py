"""
Master Evaluation & Benchmark Runner for ULTRON.
Executes:
1. Intent & Routing Accuracy Tests
2. Anti-Hallucination & Factual Precision Tests
3. Tool-Calling & JSON Schema Accuracy Tests
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
    print("      ULTRON INTELLIGENCE & ACCURACY EVALUATION SUITE")
    print("=" * 70)

    results = {}

    results["Router Test"] = run_suite("Hybrid Intent Router", "tests/test_router.py")
    results["Tool Calling (Smart Brain 1.5B)"] = run_suite("Tool Calling Accuracy", "tests/test_tool_calling.py", ["qwen2.5:1.5b"])
    results["Anti-Hallucination Test"] = run_suite("Anti-Hallucination & Factual Verification", "tests/test_hallucination.py")

    total_time = time.time() - start_time
    print("\n" + "=" * 70)
    print("                     OVERALL EVALUATION RESULTS")
    print("=" * 70)
    all_passed = True
    for suite, ok in results.items():
        status = "PASSED [OK]" if ok else "FAILED [X]"
        print(f"  {suite:<40} : {status}")
        if not ok:
            all_passed = False

    print("-" * 70)
    print(f"Total Execution Time: {total_time:.2f}s")
    print(f"Final Status: {'ALL SUITES PASSED' if all_passed else 'SOME SUITES FAILED'}")
    print("=" * 70)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())

