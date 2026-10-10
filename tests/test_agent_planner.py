"""
Unit & Integration Tests for ULTRON Controlled Autonomous Planning Agent Loop.
Tests:
1. Goal Understanding & Decomposition
2. Plan Generation with Explicit Success Criteria
3. Sequential Execution through Tools
4. Post-step Verification
5. Final Structured Reporting
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ultron_planner import UltronPlanner

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    print("=" * 65)
    print("      ULTRON AUTONOMOUS AGENT PLANNER (UNDERSTAND -> PLAN -> EXECUTE -> VERIFY -> REPORT)")
    print("=" * 65)

    goal = "Mere project ko test karke errors check karo"
    planner = UltronPlanner(goal)
    
    # Verify stages
    assert planner.stage == "UNDERSTAND"
    print(f"  [PASS] Understand Phase: Goal initialized -> '{goal}'")

    plan_steps = planner.build_plan_for_goal()
    assert len(plan_steps) >= 3
    print(f"  [PASS] Plan Phase: Generated {len(plan_steps)} sequential verifiable steps")

    report = planner.execute_plan()
    assert report["overall_status"] == "SUCCESS"
    assert report["passed_steps"] == len(plan_steps)
    assert report["failed_steps"] == 0
    print(f"  [PASS] Execute & Verify Phase: All {report['passed_steps']} steps verified with criteria")
    print(f"  [PASS] Report Phase: Structured report produced in {report['elapsed_seconds']}s")

    print("-" * 65)
    print("Agent Planner Suite: ALL CHECKS PASSED [100% OK]")
    print("=" * 65)
    return 0

if __name__ == "__main__":
    sys.exit(main())
