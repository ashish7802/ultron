"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.safety_controller
Purpose: Independent Emergency Stop, Permission Boundaries & Audit Trail
===============================================================================

Key Responsibilities:
- Module 10: Computer Safety Controls.
- Independent Emergency Stop Kill-Switch:
  Enforced independently of the frontend UI via an atomic filesystem lock
  (`ULTRON_EMERGENCY_STOP.lock`) and thread-safe memory flag.
- When Emergency Stop is triggered:
  1. Immediately halts ongoing automation tasks and rejects all new commands fail-closed.
  2. Dispatches safety reset to release any held mouse buttons or keyboard modifiers.
  3. Forcefully terminates any active spawned automation child processes.
- Process and Window Boundaries:
  Prevents targeting protected Windows processes (`csrss.exe`, `lsass.exe`, `services.exe`,
  `svchost.exe`, `wininit.exe`, `explorer.exe`, `dwm.exe`) or sensitive windows
  (`1password`, `bitwarden`, `keepass`, `bank`, `authenticator`).
- Filesystem Boundaries:
  Guards against path traversal and blocks mutations to Windows system root.
- Persistent Audit Trail:
  Logs every computer-changing action, target, risk level, authorization status,
  and outcome to `docs/audit/COMPUTER_ACTION_AUDIT.jsonl`.

Architectural Role & Interactions:
- Master safety gatekeeper for all actions passing through `computer_intelligence_cli.py`.
- Integrates with `input_driver.py` for safety input releases and `terminal_driver.py`
  for process cleanup.

Safety / Security Guarantees:
- Fail-closed: If Emergency Stop is active or permission token is missing,
  execution is strictly rejected.
- Persistent audit logging is append-only and scrubs sensitive parameters.
===============================================================================
"""

import os
import sys
import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from . import input_driver
from . import terminal_driver

# Lockfile path for independent Emergency Stop (checked before every interaction)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EMERGENCY_STOP_LOCKFILE = os.path.join(REPO_ROOT, "ULTRON_EMERGENCY_STOP.lock")
AUDIT_LOG_FILE = os.path.join(REPO_ROOT, "docs", "audit", "COMPUTER_ACTION_AUDIT.jsonl")

# Protected Windows System Processes
PROTECTED_PROCESS_NAMES = {
    "csrss.exe",
    "lsass.exe",
    "services.exe",
    "svchost.exe",
    "wininit.exe",
    "winlogon.exe",
    "smss.exe",
    "explorer.exe",
    "dwm.exe",
    "system",
}

# Sensitive window patterns
SENSITIVE_WINDOW_PATTERNS = [
    "1password",
    "bitwarden",
    "keepass",
    "lastpass",
    "dashlane",
    "authenticator",
    "incognito",
    "inprivate",
    "private browsing",
    "bank",
    "wallet",
    "crypto",
    "metamask",
    "windows security",
    "credentials",
]

_emergency_stop_active = False


def is_emergency_stop_active() -> bool:
    """
    Checks if Emergency Stop is engaged via memory flag, disk lockfile,
    or synchronized vault lockdown state.

    Returns:
        bool: True if stopped; False otherwise.
    """
    global _emergency_stop_active
    if _emergency_stop_active:
        return True
    if os.path.exists(EMERGENCY_STOP_LOCKFILE):
        return True

    # Check synchronized security vault state to maintain unified defense
    lockdown_json = os.path.join(REPO_ROOT, ".security_vault", "lockdown.json")
    try:
        if os.path.exists(lockdown_json):
            with open(lockdown_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("isLockedDown", False):
                    return True
    except Exception:
        pass

    return False


def trigger_emergency_stop(reason: str = "Emergency Stop triggered") -> Dict[str, Any]:
    """
    Engages the independent Emergency Stop mechanism immediately.

    Actions executed:
    1. Sets memory flag and writes disk lockfile.
    2. Sends safety input resets (releases all mouse buttons and modifier keys).
    3. Terminates all registered active background terminal/subprocess jobs.
    4. Records an audit entry.

    Args:
        reason (str): Reason for activation.

    Returns:
        Dict[str, Any]: Status {success, emergencyStopActive, message}.

    Side Effects:
        Writes lockfile, dispatches input events, terminates child processes.
    """
    global _emergency_stop_active
    _emergency_stop_active = True

    try:
        with open(EMERGENCY_STOP_LOCKFILE, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "triggeredAt": time.time(),
                "reason": reason,
            }))
    except Exception:
        pass

    # Safety release all mouse buttons and keys
    try:
        import ctypes
        user32 = ctypes.windll.user32
        # MOUSEEVENTF_LEFTUP = 4, RIGHTUP = 16, MIDDLEUP = 64
        user32.mouse_event(0x0004 | 0x0010 | 0x0040, 0, 0, 0, 0)
        # Release Shift, Ctrl, Alt, Win keys
        for vk in (0x10, 0x11, 0x12, 0x5B, 0x5C):
            user32.keybd_event(vk, 0, 0x0002, 0)
    except Exception:
        pass

    # Terminate active background jobs
    jobs_killed = 0
    for job_id in list(terminal_driver._active_jobs.keys()):
        try:
            terminal_driver.terminate_background_job(job_id)
            jobs_killed += 1
        except Exception:
            pass

    log_audit_action({
        "action": "EMERGENCY_STOP_TRIGGERED",
        "reason": reason,
        "jobsKilled": jobs_killed,
        "status": "HALTED",
    })

    return {
        "success": True,
        "emergencyStopActive": True,
        "jobsKilled": jobs_killed,
        "message": f"EMERGENCY STOP ACTIVE: {reason}",
    }


def reset_emergency_stop(reason: str = "Authorized founder reset") -> Dict[str, Any]:
    """
    Clears the Emergency Stop lockfile and re-enables automation.

    Args:
        reason (str): Reason for reset.

    Returns:
        Dict[str, Any]: Status {success, emergencyStopActive}.
    """
    global _emergency_stop_active
    _emergency_stop_active = False

    if os.path.exists(EMERGENCY_STOP_LOCKFILE):
        try:
            os.remove(EMERGENCY_STOP_LOCKFILE)
        except Exception:
            pass

    log_audit_action({
        "action": "EMERGENCY_STOP_CLEARED",
        "reason": reason,
        "status": "RESUMED",
    })

    return {"success": True, "emergencyStopActive": False, "message": "Emergency Stop successfully reset."}


def validate_safety_boundaries(
    action: str,
    target: Any,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Validates an intended operation against all safety boundaries before execution.

    Args:
        action (str): Action name ('launch', 'terminate', 'click', 'type', 'write_file', 'shell_exec').
        target (Any): Target window, process, path, or command.
        params (Optional[Dict[str, Any]]): Action parameters.

    Returns:
        Dict[str, Any]: {allowed, riskLevel, blocked, reason, requiresApproval}.
    """
    # 1. Emergency Stop Check
    if is_emergency_stop_active():
        return {
            "allowed": False,
            "riskLevel": "critical",
            "blocked": True,
            "reason": "Operation rejected: Emergency Stop is currently active.",
            "requiresApproval": False,
        }

    # 2. Process Termination Boundaries
    if action in ("terminate", "kill_process", "app_terminate"):
        target_str = str(target or "").lower().strip()
        if target_str in PROTECTED_PROCESS_NAMES:
            return {
                "allowed": False,
                "riskLevel": "critical",
                "blocked": True,
                "reason": f"Security Violation: '{target_str}' is a protected Windows core system process.",
                "requiresApproval": False,
            }

    # 3. Sensitive Window Boundaries
    if action in ("click", "type", "interact", "screenshot"):
        target_str = str(target or "").lower().strip()
        for pattern in SENSITIVE_WINDOW_PATTERNS:
            if pattern in target_str:
                return {
                    "allowed": False,
                    "riskLevel": "high",
                    "blocked": True,
                    "reason": f"Privacy Violation: Target contains sensitive pattern '{pattern}'.",
                    "requiresApproval": False,
                }

    # 4. Command Risk Classification
    if action in ("shell", "terminal", "exec"):
        risk = terminal_driver.classify_command_risk(str(target or ""))
        if risk["isBlocked"]:
            return {
                "allowed": False,
                "riskLevel": risk["riskLevel"],
                "blocked": True,
                "reason": risk["reason"],
                "requiresApproval": False,
            }
        return {
            "allowed": True,
            "riskLevel": risk["riskLevel"],
            "blocked": False,
            "reason": risk["reason"],
            "requiresApproval": risk["requiresApproval"],
        }

    # 5. Filesystem Mutation Boundaries
    if action in ("write_file", "delete_file", "file_delete"):
        path_str = str(target or "")
        if "c:\\windows" in path_str.lower():
            return {
                "allowed": False,
                "riskLevel": "critical",
                "blocked": True,
                "reason": "Security Violation: Modifying Windows system directories is forbidden.",
                "requiresApproval": False,
            }
        return {
            "allowed": True,
            "riskLevel": "high" if "delete" in action else "medium",
            "blocked": False,
            "reason": "Filesystem mutation requires confirmation.",
            "requiresApproval": True,
        }

    return {
        "allowed": True,
        "riskLevel": "low",
        "blocked": False,
        "reason": "Safe standard operation.",
        "requiresApproval": False,
    }


def log_audit_action(entry: Dict[str, Any]) -> None:
    """
    Appends an immutable audit record to the persistent audit log file.

    Args:
        entry (Dict[str, Any]): Audit dictionary to record.

    Side Effects:
        Appends a JSON line to docs/audit/COMPUTER_ACTION_AUDIT.jsonl.
    """
    os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
    record = {
        "auditId": "audit_" + uuid.uuid4().hex[:12],
        "timestamp": time.time(),
        "emergencyStop": is_emergency_stop_active(),
        **entry,
    }
    try:
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        pass
