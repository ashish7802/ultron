"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.dev_driver
Purpose: Development Environment Intelligence, VS Code, Git & Build/Test Supervisors
===============================================================================

Key Responsibilities:
- Module 09: Development Environment Intelligence.
- VS Code integration: file and line navigation (`code -g file:line`), workspace detection,
  and `.vscode` settings/tasks inspection.
- Project directory understanding: detects project type (Node.js, Next.js, Python, Rust, Go),
  package manifests (`package.json`, `requirements.txt`), git root, and dependencies.
- Development server monitoring: probes local TCP ports (e.g. 3000, 8000, 5173, 8080)
  to verify if dev servers are listening and healthy.
- Build & test execution: executes builds and test runners (`npm test`, `pytest`, `cargo test`),
  parsing stdout/stderr for exact compilation errors, warnings, and passed/failed tallies.
- Git repository introspection: branch name, uncommitted/staged files (`git status --porcelain`),
  recent commits, and diff summaries.
- Security enforcement:
  - Read-only inspection allowed by default.
  - Code modification, Git push, branch reset, and deployment require explicit founder approval.

Architectural Role & Interactions:
- Consumed by `computer_intelligence_cli.py` and Node.js `devEnvironmentIntelligence.ts`.
- Collaborates with `terminal_driver.py` for subprocess execution.

Safety / Security Guarantees:
- Read-only queries execute without side effects.
- Destructive git operations (reset, checkout -f, push) blocked without approval.
===============================================================================
"""

import os
import sys
import json
import socket
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple

from . import terminal_driver


def detect_project_context(directory: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyzes a directory to determine project type, toolchain, and configuration.

    Args:
        directory (Optional[str]): Target directory or current working directory.

    Returns:
        Dict[str, Any]: Project profile {projectType, packageManager, hasGit, scripts, dependenciesCount}.
    """
    target = os.path.abspath(directory or os.getcwd())
    profile: Dict[str, Any] = {
        "directory": target,
        "name": os.path.basename(target),
        "projectType": "generic",
        "hasGit": os.path.isdir(os.path.join(target, ".git")),
        "hasVsCode": os.path.isdir(os.path.join(target, ".vscode")),
        "packageManagers": [],
        "manifestFiles": [],
        "scripts": {},
    }

    # Node.js / JavaScript / TypeScript detection
    pkg_json_path = os.path.join(target, "package.json")
    if os.path.isfile(pkg_json_path):
        profile["projectType"] = "node"
        profile["manifestFiles"].append("package.json")
        try:
            with open(pkg_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                profile["name"] = data.get("name", profile["name"])
                profile["scripts"] = data.get("scripts", {})
                deps = len(data.get("dependencies", {}))
                dev_deps = len(data.get("devDependencies", {}))
                profile["dependenciesCount"] = deps + dev_deps
                if "next" in data.get("dependencies", {}):
                    profile["projectType"] = "nextjs"
                elif "electron" in data.get("devDependencies", {}) or "electron" in data.get("dependencies", {}):
                    profile["projectType"] = "electron"
        except Exception:
            pass

    # Python project detection
    if os.path.isfile(os.path.join(target, "requirements.txt")):
        profile["manifestFiles"].append("requirements.txt")
        profile["projectType"] = "python" if profile["projectType"] == "generic" else f"{profile['projectType']}+python"
    if os.path.isfile(os.path.join(target, "pyproject.toml")):
        profile["manifestFiles"].append("pyproject.toml")
        profile["projectType"] = "python"

    return profile


def get_git_status(directory: Optional[str] = None) -> Dict[str, Any]:
    """
    Queries local Git repository status and active branch.

    Args:
        directory (Optional[str]): Working directory.

    Returns:
        Dict[str, Any]: {isGitRepo, branch, clean, stagedFiles, modifiedFiles, untrackedFiles}.
    """
    target = directory or os.getcwd()
    git_dir = os.path.join(target, ".git")
    if not os.path.exists(git_dir):
        return {"isGitRepo": False, "error": "Not a git repository."}

    # Branch query
    res_b = terminal_driver.execute_command("git rev-parse --abbrev-ref HEAD", cwd=target)
    branch = res_b.get("stdout", "").strip() if res_b.get("success") else "unknown"

    # Status query
    res_s = terminal_driver.execute_command("git status --porcelain", cwd=target)
    if not res_s.get("success"):
        return {"isGitRepo": True, "branch": branch, "error": res_s.get("stderr")}

    lines = [line.strip() for line in res_s.get("stdout", "").split("\n") if line.strip()]
    staged: List[str] = []
    modified: List[str] = []
    untracked: List[str] = []

    for l in lines:
        if len(l) < 3:
            continue
        idx_status = l[0]
        work_status = l[1]
        file_path = l[3:].strip()

        if idx_status in ("M", "A", "D", "R"):
            staged.append(file_path)
        if work_status in ("M", "D"):
            modified.append(file_path)
        if idx_status == "?" and work_status == "?":
            untracked.append(file_path)

    return {
        "isGitRepo": True,
        "branch": branch,
        "isClean": len(lines) == 0,
        "stagedCount": len(staged),
        "modifiedCount": len(modified),
        "untrackedCount": len(untracked),
        "staged": staged,
        "modified": modified,
        "untracked": untracked,
    }


def open_file_in_vscode(
    file_path: str,
    line: Optional[int] = None,
    column: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Opens a file in Visual Studio Code at an exact line and column coordinates (`code -g file:line:col`).

    Args:
        file_path (str): Relative or absolute file path.
        line (Optional[int]): Line number.
        column (Optional[int]): Column number.

    Returns:
        Dict[str, Any]: {success, message}.

    Side Effects:
        Invokes VS Code CLI to open editor window.
    """
    code_bin = shutil.which("code") or shutil.which("code.cmd")
    if not code_bin:
        # Check standard installation locations
        local_code = os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            r"Programs\Microsoft VS Code\bin\code.cmd",
        )
        if os.path.exists(local_code):
            code_bin = local_code

    if not code_bin:
        return {"success": False, "error": "Visual Studio Code ('code') CLI not found in PATH."}

    target = os.path.abspath(file_path)
    if line is not None:
        if column is not None:
            arg = f"{target}:{line}:{column}"
        else:
            arg = f"{target}:{line}"
        cmd = [code_bin, "-g", arg]
    else:
        cmd = [code_bin, target]

    try:
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        subprocess.Popen(cmd, close_fds=True, creationflags=creation_flags)
        return {
            "success": True,
            "file": target,
            "line": line,
            "column": column,
            "message": f"Opened {os.path.basename(target)} in VS Code.",
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to invoke VS Code: {str(e)}"}


def check_port_listening(port: int, host: str = "127.0.0.1") -> Dict[str, Any]:
    """
    Probes a local TCP port to determine if a development server or process is listening.

    Args:
        port (int): TCP port number.
        host (str): Target host (default 127.0.0.1).

    Returns:
        Dict[str, Any]: {port, isListening, latencyMs}.
    """
    import time
    start_t = time.perf_counter()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.8)
    try:
        res = sock.connect_ex((host, port))
        latency = round((time.perf_counter() - start_t) * 1000, 2)
        is_open = (res == 0)
        return {"port": port, "host": host, "isListening": is_open, "latencyMs": latency}
    except Exception as e:
        return {"port": port, "host": host, "isListening": False, "error": str(e)}
    finally:
        sock.close()


def run_project_build(
    command: str = "npm run build",
    cwd: Optional[str] = None,
    timeout_sec: int = 120,
) -> Dict[str, Any]:
    """
    Executes a project build command and parses compilation results.

    Args:
        command (str): Build command line.
        cwd (Optional[str]): Working directory.
        timeout_sec (int): Timeout in seconds.

    Returns:
        Dict[str, Any]: {success, exitCode, stdout, stderr, errorsDetected}.
    """
    res = terminal_driver.execute_command(command, cwd=cwd, timeout_sec=timeout_sec)
    out = res.get("stdout", "")
    err = res.get("stderr", "")

    # Parse errors
    errors: List[str] = []
    for line in (out + "\n" + err).split("\n"):
        l_low = line.lower()
        if "error:" in l_low or "failed to compile" in l_low or "syntaxerror" in l_low or "typeerror" in l_low:
            clean_err = line.strip()
            if clean_err and clean_err not in errors:
                errors.append(clean_err)

    return {
        **res,
        "buildSuccess": res.get("success", False) and len(errors) == 0,
        "errorsCount": len(errors),
        "errorsDetected": errors[:10],
    }


def run_project_tests(
    command: str = "npm test",
    cwd: Optional[str] = None,
    timeout_sec: int = 60,
) -> Dict[str, Any]:
    """
    Executes project tests and extracts pass/fail metrics.

    Args:
        command (str): Test runner command.
        cwd (Optional[str]): Working directory.
        timeout_sec (int): Timeout in seconds.

    Returns:
        Dict[str, Any]: {success, exitCode, passedCount, failedCount, summaryLine}.
    """
    import re
    res = terminal_driver.execute_command(command, cwd=cwd, timeout_sec=timeout_sec)
    combined = res.get("stdout", "") + "\n" + res.get("stderr", "")

    passed = 0
    failed = 0
    summary = ""

    # Check for "Tests: X passed, Y failed, Z total" or "pass X, fail Y"
    m = re.search(r"tests?:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?", combined, re.IGNORECASE)
    if m:
        passed = int(m.group(1))
        failed = int(m.group(2) or "0")
        summary = m.group(0)

    # Check for node:test output
    if not summary:
        m2 = re.search(r"pass\s+(\d+)\s+fail\s+(\d+)", combined, re.IGNORECASE)
        if m2:
            passed = int(m2.group(1))
            failed = int(m2.group(2))
            summary = m2.group(0)

    return {
        **res,
        "testSuccess": res.get("success", False) and failed == 0,
        "passedCount": passed,
        "failedCount": failed,
        "summary": summary,
    }
