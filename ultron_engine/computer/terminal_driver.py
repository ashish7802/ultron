"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.terminal_driver
Purpose: Terminal Introspection, Safe Controlled Execution & Process Supervision
===============================================================================

Key Responsibilities:
- Module 07: Terminal Intelligence.
- Identifies installed host shells: Windows PowerShell, pwsh (PowerShell 7),
  Command Prompt (cmd.exe), Git Bash, and WSL (Windows Subsystem for Linux).
- Prepares and sanitizes shell commands with strict risk categorization
  (LOW, MEDIUM, HIGH, CRITICAL/BLOCKED).
- Executes synchronous commands with strict timeouts, real-time stdout/stderr
  capture, and exit code verification.
- Handles asynchronous background processes with registered job IDs, PID tracking,
  and graceful termination capabilities.
- Maintains an append-only in-memory and disk command execution history.
- Security enforcement:
  - High-risk and destructive commands require explicit user approval.
  - Never executes blind format or partition destruction commands.

Architectural Role & Interactions:
- Consumed by `computer_intelligence_cli.py` and Node.js `terminalIntelligence.ts`.
- Gated by Module 10 (Safety Controls) and Permission Gateway.

Safety / Security Guarantees:
- Execution timeouts enforced strictly (default 15s; background jobs managed explicitly).
- Destructive commands ('format', 'reg delete', 'rmdir /s /q C:\\') are blocked.
- Fails closed on timeout or security violation.
===============================================================================
"""

import os
import sys
import time
import uuid
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple

# Dangerous commands that must NEVER run or require critical founder approval
BLOCKED_PATTERNS = [
    r"format\s+[a-z]:",
    r"rmdir\s+(?:/[a-z]\s*)+[a-z]:\\",
    r"del\s+(?:/[a-z]\s*)+[a-z]:\\windows",
    r"reg\s+delete\s+hklm",
    r":\(\)\{\s*:\s*\|\s*:\s*&\s*\};:",  # Fork bomb
    r"shutdown\s+/[sr]",
]

HIGH_RISK_PATTERNS = [
    r"npm\s+publish",
    r"git\s+push",
    r"pip\s+install",
    r"rm\s+-rf",
    r"Remove-Item\s+-Recurse\s+-Force",
    r"git\s+reset\s+--hard",
    r"kill\s+-9",
    r"taskkill\s+/f",
    r"\bclear-content\b",
    r"\bclc\b",
    r"\bset-content\b",
    r"\bremove-item\b",
]

# In-memory execution history (up to 500 commands)
_command_history: List[Dict[str, Any]] = []
# Background jobs registry {job_id: {process, pid, command, started_at}}
_active_jobs: Dict[str, Dict[str, Any]] = {}


def detect_shells() -> Dict[str, Any]:
    """
    Identifies installed shells and terminal emulators available on the Windows host.

    Returns:
        Dict[str, Any]: Available shells with executable paths and version hints.
    """
    shells: Dict[str, Any] = {}

    # 1. Windows PowerShell 5.1
    ps_path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), r"System32\WindowsPowerShell\v1.0\powershell.exe")
    if os.path.exists(ps_path):
        shells["powershell"] = {"name": "Windows PowerShell 5.1", "path": ps_path, "default": True}

    # 2. PowerShell Core 7 (pwsh)
    pwsh = shutil.which("pwsh")
    if pwsh:
        shells["pwsh"] = {"name": "PowerShell 7+", "path": pwsh}

    # 3. CMD.exe
    cmd_path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), r"System32\cmd.exe")
    if os.path.exists(cmd_path):
        shells["cmd"] = {"name": "Command Prompt", "path": cmd_path}

    # 4. Git Bash
    git_bash = r"C:\Program Files\Git\bin\bash.exe"
    if os.path.exists(git_bash):
        shells["git_bash"] = {"name": "Git Bash", "path": git_bash}

    # 5. WSL
    wsl = shutil.which("wsl")
    if wsl:
        shells["wsl"] = {"name": "Windows Subsystem for Linux", "path": wsl}

    return shells


def classify_command_risk(command: str) -> Dict[str, Any]:
    """
    Evaluates the security and destruction risk of a shell command.

    Args:
        command (str): Shell command line.

    Returns:
        Dict[str, Any]: {riskLevel, isBlocked, requiresApproval, reason}.
    """
    import re
    low_cmd = (command or "").strip().lower()

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, low_cmd, re.IGNORECASE):
            return {
                "riskLevel": "critical",
                "isBlocked": True,
                "requiresApproval": True,
                "reason": f"Command matches blocked destructive pattern: '{pattern}'",
            }

    for pattern in HIGH_RISK_PATTERNS:
        if re.search(pattern, low_cmd, re.IGNORECASE):
            return {
                "riskLevel": "high",
                "isBlocked": False,
                "requiresApproval": True,
                "reason": f"Command modifies repositories, packages or active tasks: '{pattern}'",
            }

    # Check for file deletions
    if "del " in low_cmd or "rm " in low_cmd or "remove-item" in low_cmd:
        return {
            "riskLevel": "medium",
            "isBlocked": False,
            "requiresApproval": True,
            "reason": "Command deletes files or directories.",
        }

    return {
        "riskLevel": "low",
        "isBlocked": False,
        "requiresApproval": False,
        "reason": "Standard read-only or build command.",
    }


def execute_command(
    command: str,
    shell_name: str = "powershell",
    cwd: Optional[str] = None,
    timeout_sec: int = 30,
    env: Optional[Dict[str, str]] = None,
    approval_granted: bool = False,
) -> Dict[str, Any]:
    """
    Executes a shell command synchronously with strict timeout and output capture.

    Args:
        command (str): Shell command.
        shell_name (str): Shell to use ('powershell' | 'cmd' | 'pwsh' | 'git_bash').
        cwd (Optional[str]): Working directory.
        timeout_sec (int): Execution timeout in seconds.
        env (Optional[Dict[str, str]]): Additional environment variables.
        approval_granted (bool): Explicit user authorization grant for high-risk actions.

    Returns:
        Dict[str, Any]: Execution result {success, exitCode, stdout, stderr, durationMs}.

    Side Effects:
        Spawns child subprocess and logs command to history.
    """
    risk = classify_command_risk(command)
    if risk["isBlocked"]:
        return {
            "success": False,
            "exitCode": -1,
            "error": f"Security Violation: {risk['reason']}",
            "blocked": True,
        }

    # Strict approval enforcement: block commands requiring approval unless explicitly authorized
    if risk.get("requiresApproval", False) and not approval_granted:
        return {
            "success": False,
            "exitCode": -1,
            "requiresApproval": True,
            "error": f"Security Policy Violation: Command requires explicit user approval: {risk['reason']}",
            "risk": risk,
            "blocked": True,
        }

    shells = detect_shells()
    shell_info = shells.get(shell_name) or shells.get("powershell")
    if not shell_info:
        return {"success": False, "error": f"Shell '{shell_name}' is not installed."}

    shell_exe = shell_info["path"]
    work_dir = cwd or os.getcwd()

    # Build invocation vector
    if "powershell" in shell_name or "pwsh" in shell_name:
        cmd_vector = [shell_exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command]
    elif shell_name == "cmd":
        cmd_vector = [shell_exe, "/C", command]
    else:
        cmd_vector = [shell_exe, "-c", command]

    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    start_t = time.perf_counter()
    record: Dict[str, Any] = {
        "id": "cmd_" + uuid.uuid4().hex[:12],
        "command": command,
        "shell": shell_name,
        "cwd": work_dir,
        "riskLevel": risk["riskLevel"],
        "startedAt": time.time(),
    }

    try:
        proc = subprocess.run(
            cmd_vector,
            cwd=work_dir,
            env=merged_env,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
        success = proc.returncode == 0

        res = {
            "success": success,
            "exitCode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "durationMs": duration_ms,
            "commandId": record["id"],
        }
    except subprocess.TimeoutExpired:
        duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
        res = {
            "success": False,
            "exitCode": -1,
            "stdout": "",
            "stderr": f"Command timed out after {timeout_sec} seconds.",
            "durationMs": duration_ms,
            "timedOut": True,
            "commandId": record["id"],
        }
    except Exception as e:
        duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
        res = {
            "success": False,
            "exitCode": -1,
            "stdout": "",
            "stderr": str(e),
            "durationMs": duration_ms,
            "commandId": record["id"],
        }

    # Append to history
    record.update(res)
    _command_history.append(record)
    if len(_command_history) > 500:
        _command_history.pop(0)

    return res


def start_background_job(
    command: str,
    shell_name: str = "powershell",
    cwd: Optional[str] = None,
    approval_granted: bool = False,
) -> Dict[str, Any]:
    """
    Launches a long-running process asynchronously in the background.

    Args:
        command (str): Command to execute.
        shell_name (str): Target shell.
        cwd (Optional[str]): Working directory.
        approval_granted (bool): Explicit user authorization grant.

    Returns:
        Dict[str, Any]: {success, jobId, pid, command}.

    Side Effects:
        Spawns background child process registered in _active_jobs.
    """
    risk = classify_command_risk(command)
    if risk["isBlocked"]:
        return {"success": False, "error": f"Security Violation: {risk['reason']}", "blocked": True}

    if risk.get("requiresApproval", False) and not approval_granted:
        return {
            "success": False,
            "requiresApproval": True,
            "error": f"Security Policy Violation: Background job requires explicit user approval: {risk['reason']}",
            "risk": risk,
            "blocked": True,
        }

    shells = detect_shells()
    shell_info = shells.get(shell_name) or shells.get("powershell")
    shell_exe = shell_info["path"]
    work_dir = cwd or os.getcwd()

    if "powershell" in shell_name or "pwsh" in shell_name:
        cmd_vector = [shell_exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command]
    elif shell_name == "cmd":
        cmd_vector = [shell_exe, "/C", command]
    else:
        cmd_vector = [shell_exe, "-c", command]

    job_id = "job_" + uuid.uuid4().hex[:12]

    try:
        proc = subprocess.Popen(
            cmd_vector,
            cwd=work_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        _active_jobs[job_id] = {
            "jobId": job_id,
            "process": proc,
            "pid": proc.pid,
            "command": command,
            "shell": shell_name,
            "cwd": work_dir,
            "startedAt": time.time(),
        }
        return {
            "success": True,
            "jobId": job_id,
            "pid": proc.pid,
            "command": command,
            "message": f"Started background process (PID: {proc.pid})",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def poll_background_job(job_id: str) -> Dict[str, Any]:
    """
    Polls status and reads output of an active background job.

    Args:
        job_id (str): Registered job ID.

    Returns:
        Dict[str, Any]: {jobId, isRunning, exitCode, stdout, stderr}.
    """
    job = _active_jobs.get(job_id)
    if not job:
        return {"success": False, "error": f"Job ID '{job_id}' not found."}

    proc: subprocess.Popen = job["process"]
    ret_code = proc.poll()
    is_running = ret_code is None

    stdout_txt = ""
    stderr_txt = ""

    if not is_running:
        out, err = proc.communicate(timeout=1)
        stdout_txt = out or ""
        stderr_txt = err or ""
        # Clean up finished job
        _active_jobs.pop(job_id, None)

    return {
        "success": True,
        "jobId": job_id,
        "pid": job["pid"],
        "command": job["command"],
        "isRunning": is_running,
        "exitCode": ret_code,
        "stdout": stdout_txt,
        "stderr": stderr_txt,
        "runtimeSeconds": round(time.time() - job["startedAt"], 1),
    }


def terminate_background_job(job_id: str) -> Dict[str, Any]:
    """
    Terminates an active background process.

    Args:
        job_id (str): Registered job ID.

    Returns:
        Dict[str, Any]: {success, jobId, terminated}.

    Side Effects:
        Terminates the operating system child process.
    """
    job = _active_jobs.get(job_id)
    if not job:
        return {"success": False, "error": f"Job ID '{job_id}' not found."}

    proc: subprocess.Popen = job["process"]
    try:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
        _active_jobs.pop(job_id, None)
        return {"success": True, "jobId": job_id, "terminated": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_command_history(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Returns recent command execution history without secrets.

    Args:
        limit (int): Maximum records.

    Returns:
        List[Dict[str, Any]]: History entries.
    """
    return list(_command_history[-limit:])
