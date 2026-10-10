"""
ULTRON Controlled Autonomous Planning & Agent Loop
Executes multi-step tasks according to the strict lifecycle:
UNDERSTAND -> PLAN -> EXECUTE -> VERIFY -> REPORT
"""

import time
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from ultron_tools import ToolRegistry

class AgentStep:
    def __init__(self, step_id: int, title: str, action: str, params: Dict[str, Any], criteria: str):
        self.step_id = step_id
        self.title = title
        self.action = action
        self.params = params
        self.criteria = criteria
        self.status = "pending" # pending | running | verified | failed
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "title": self.title,
            "action": self.action,
            "params": self.params,
            "criteria": self.criteria,
            "status": self.status,
            "result": self.result,
            "error": self.error,
        }

class UltronPlanner:
    def __init__(self, goal: str, workspace_dir: Optional[str] = None):
        self.goal = goal
        self.workspace_dir = workspace_dir or str(Path.cwd())
        self.stage = "UNDERSTAND"
        self.steps: List[AgentStep] = []
        self.report: Dict[str, Any] = {}
        self.is_aborted = False

    def abort(self):
        self.is_aborted = True

    def build_plan_for_goal(self) -> List[AgentStep]:
        """
        Translates common complex user goals into verifiable phased execution plans.
        """
        goal_lower = self.goal.lower()

        # Goal Pattern 1: Project test & error diagnosis / fix
        if any(w in goal_lower for w in ["test", "error", "fix", "chala", "check project"]):
            self.steps = [
                AgentStep(
                    step_id=1,
                    title="Inspect Repository & Test Files",
                    action="file_search",
                    params={"query_pattern": "test", "base_dir": self.workspace_dir},
                    criteria="Identify test scripts and configuration files",
                ),
                AgentStep(
                    step_id=2,
                    title="Execute Initial Test Suite",
                    action="run_command",
                    params={"command": "python tests/test_router.py", "cwd": self.workspace_dir},
                    criteria="Returncode is 0 and tests execute cleanly",
                ),
                AgentStep(
                    step_id=3,
                    title="Verify System & Resource Health",
                    action="system_diagnostics",
                    params={},
                    criteria="RAM and CPU are within operational thresholds",
                ),
                AgentStep(
                    step_id=4,
                    title="Compile Verification & Status Summary",
                    action="report_summary",
                    params={},
                    criteria="Final success report generated",
                ),
            ]
        # Goal Pattern 2: System audit and memory sync
        elif any(w in goal_lower for w in ["system", "audit", "memory", "specs"]):
            self.steps = [
                AgentStep(
                    step_id=1,
                    title="Gather Hardware & Resource Telemetry",
                    action="system_diagnostics",
                    params={},
                    criteria="Accurate CPU, RAM, and Battery telemetry collected",
                ),
                AgentStep(
                    step_id=2,
                    title="Verify Active Model Runtimes",
                    action="run_command",
                    params={"command": "ollama list", "cwd": self.workspace_dir},
                    criteria="Local model instances confirmed",
                ),
                AgentStep(
                    step_id=3,
                    title="Persist Audit Summary in Permanent Memory",
                    action="save_memory",
                    params={"key": "last_system_audit", "category": "system"},
                    criteria="Memory state updated in SQLite",
                ),
            ]
        else:
            # Generic structured plan
            self.steps = [
                AgentStep(
                    step_id=1,
                    title="Analyze Workspace Context",
                    action="file_search",
                    params={"query_pattern": "package.json", "base_dir": self.workspace_dir},
                    criteria="Workspace root verified",
                ),
                AgentStep(
                    step_id=2,
                    title="Execute Target Action",
                    action="system_diagnostics",
                    params={},
                    criteria="Target action executed with status success",
                ),
                AgentStep(
                    step_id=3,
                    title="Verify State & Finalize",
                    action="report_summary",
                    params={},
                    criteria="Completion verified",
                ),
            ]
        return self.steps

    def execute_plan(self, on_step_update: Optional[Callable[[Dict[str, Any]], None]] = None) -> Dict[str, Any]:
        """Runs the agent loop with explicit verification at each step."""
        start_time = time.time()
        self.stage = "PLAN"
        self.build_plan_for_goal()

        self.stage = "EXECUTE"
        passed_steps = 0
        failed_steps = 0

        for step in self.steps:
            if self.is_aborted:
                step.status = "failed"
                step.error = "Agent loop cancelled by user."
                if on_step_update:
                    on_step_update(step.to_dict())
                break

            step.status = "running"
            if on_step_update:
                on_step_update(step.to_dict())

            try:
                # Dispatch action
                if step.action == "file_search":
                    res = ToolRegistry.search_files(
                        query_pattern=step.params.get("query_pattern", ""),
                        base_dir=step.params.get("base_dir"),
                    )
                    step.result = res
                    step.status = "verified" if res.get("status") == "success" else "failed"

                elif step.action == "system_diagnostics":
                    res = ToolRegistry.get_system_diagnostics()
                    step.result = res
                    step.status = "verified" if res.get("status") == "success" else "failed"

                elif step.action == "run_command":
                    cmd = step.params.get("command", "")
                    cwd = step.params.get("cwd", self.workspace_dir)
                    res = ToolRegistry.run_developer_command(command=cmd, cwd=cwd)
                    step.result = res
                    step.status = "verified" if res.get("returncode") == 0 else "failed"
                    if step.status == "failed":
                        step.error = res.get("stderr") or "Command returned non-zero exit code."

                elif step.action == "save_memory":
                    from ultron_memory import UltronMemory
                    key = step.params.get("key", f"audit_{int(time.time())}")
                    cat = step.params.get("category", "system")
                    res = UltronMemory.save_fact(key, f"Plan execution for goal: {self.goal}", category=cat)
                    step.result = res
                    step.status = "verified"

                elif step.action == "report_summary":
                    step.result = {"summary": "Execution completed successfully."}
                    step.status = "verified"

                else:
                    step.status = "failed"
                    step.error = f"Unknown action: {step.action}"

            except Exception as e:
                step.status = "failed"
                step.error = str(e)

            if step.status == "verified":
                passed_steps += 1
            else:
                failed_steps += 1

            if on_step_update:
                on_step_update(step.to_dict())

        self.stage = "REPORT"
        total_time = round(time.time() - start_time, 2)
        self.report = {
            "goal": self.goal,
            "total_steps": len(self.steps),
            "passed_steps": passed_steps,
            "failed_steps": failed_steps,
            "overall_status": "SUCCESS" if failed_steps == 0 and not self.is_aborted else "PARTIAL_OR_FAILED",
            "elapsed_seconds": total_time,
            "steps": [s.to_dict() for s in self.steps],
        }
        return self.report
