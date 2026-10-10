"""
Unit & Integration Tests for ULTRON Real Computer Control & Dedicated Tool Registry.
Tests:
1. Live System Diagnostics (CPU, RAM, Battery, Uptime)
2. File Search in Allowed Directories
3. File Read & Write with Path Containment
4. Security Confirmation Gate (Destructive Operations Blocked without Token)
5. Developer Workflow Execution & Dangerous Command Filtering
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ultron_tools import ToolRegistry

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    print("=" * 65)
    print("      ULTRON REAL COMPUTER CONTROL & TOOL REGISTRY")
    print("=" * 65)

    # 1. System Diagnostics
    diag = ToolRegistry.get_system_diagnostics()
    assert diag["status"] == "success"
    assert "cpu_percent" in diag
    assert "ram_percent" in diag
    print(f"  [PASS] Diagnostics: CPU {diag['cpu_percent']}%, RAM {diag['ram_percent']}%, Uptime {diag['system_uptime']}")

    # 2. File Search
    search = ToolRegistry.search_files("package.json", base_dir=str(Path.cwd()))
    assert search["status"] == "success"
    assert search["count"] >= 1
    print(f"  [PASS] File Search: Found {search['count']} match(es) for 'package.json'")

    # 3. File Read & Write
    test_file = Path.cwd() / "test_scratch.txt"
    try:
        w_res = ToolRegistry.write_file(str(test_file), "Ultron Neural Core Test String\n", mode="write")
        assert w_res["status"] == "success"
        r_res = ToolRegistry.read_file(str(test_file))
        assert r_res["status"] == "success"
        assert "Ultron Neural Core" in r_res["content"]
        print("  [PASS] File IO: Safe create, write, and read within workspace confirmed")

        # 4. Security Confirmation Gate for Deletion
        del_attempt_1 = ToolRegistry.delete_file(str(test_file))
        assert del_attempt_1["status"] == "confirmation_required"
        token = del_attempt_1["confirmation_token"]
        assert token is not None
        print(f"  [PASS] Confirmation Gate: Unconfirmed delete blocked, token issued: {token}")

        # Authorized Deletion with token
        del_attempt_2 = ToolRegistry.delete_file(str(test_file), confirm_token=token)
        assert del_attempt_2["status"] == "success"
        assert not test_file.exists()
        print("  [PASS] Authorized Action: File deleted safely upon token confirmation")
    finally:
        if test_file.exists():
            test_file.unlink()

    # 5. Developer Command Execution
    dev_run = ToolRegistry.run_developer_command("git status")
    assert dev_run["status"] == "success"
    assert dev_run["returncode"] == 0
    print("  [PASS] Developer Workflow: 'git status' ran cleanly in project directory")

    # 6. Dangerous Command Security Policy Block
    dangerous_run = ToolRegistry.run_developer_command("rmdir /s /q C:\\Windows")
    assert dangerous_run["status"] == "error"
    assert "violates security policy" in dangerous_run["error"]
    print("  [PASS] Security Policy: Destructive shell command rejected proactively")

    print("-" * 65)
    print("Computer Control Suite: ALL 6 CHECKS PASSED [100% OK]")
    print("=" * 65)
    return 0

if __name__ == "__main__":
    sys.exit(main())
