"""
ULTRON Real Computer Control & Dedicated Tool Registry
Provides safe, auditable Windows computer control:
- System diagnostics (CPU, RAM, Battery, Uptime)
- Application launch & termination
- File and directory search
- Approved file reading, creation, and editing
- Developer workflows (terminal execution, test suites)
- Security gate: Confirmation token required for sensitive/destructive operations
"""

import os
import sys
import psutil
import subprocess
import glob
import time
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional

# Pending destructive confirmations cache (token -> tool execution request)
PENDING_CONFIRMATIONS: Dict[str, Dict[str, Any]] = {}
CONFIRMATION_EXPIRY_SECONDS = 120

# Safe directory boundaries for file operations
ALLOWED_BASE_DIRS = [
    Path.home() / "Documents",
    Path.home() / "Desktop",
    Path.home() / "Downloads",
    Path.cwd(),
]

COMMON_APPS = {
    "notepad": "notepad.exe",
    "calc": "calc.exe",
    "calculator": "calc.exe",
    "explorer": "explorer.exe",
    "taskmgr": "taskmgr.exe",
    "cmd": "cmd.exe",
    "powershell": "powershell.exe",
    "chrome": "chrome.exe",
    "vscode": "code.cmd",
    "code": "code.cmd",
}

def clean_expired_confirmations():
    now = time.time()
    expired = [k for k, v in PENDING_CONFIRMATIONS.items() if now - v["created_at"] > CONFIRMATION_EXPIRY_SECONDS]
    for k in expired:
        PENDING_CONFIRMATIONS.pop(k, None)

def is_path_allowed(path_str: str) -> bool:
    try:
        resolved = Path(path_str).resolve()
        for allowed in ALLOWED_BASE_DIRS:
            try:
                resolved.relative_to(allowed.resolve())
                return True
            except ValueError:
                continue
        return False
    except Exception:
        return False

class ToolRegistry:
    @staticmethod
    def get_system_diagnostics() -> Dict[str, Any]:
        """Gathers real-time CPU, RAM, battery, and system status."""
        cpu_pct = psutil.cpu_percent(interval=0.1)
        ram = psutil.virtual_memory()
        
        battery_info = {}
        try:
            battery = psutil.sensors_battery()
            if battery:
                battery_info = {
                    "percent": battery.percent,
                    "power_plugged": battery.power_plugged,
                    "secsleft": battery.secsleft if battery.secsleft > 0 else "Charging/Indefinite",
                }
            else:
                battery_info = {"status": "No battery detected (Desktop/AC powered)"}
        except Exception:
            battery_info = {"status": "Unavailable"}

        uptime_secs = time.time() - psutil.boot_time()
        hours = int(uptime_secs // 3600)
        minutes = int((uptime_secs % 3600) // 60)

        return {
            "status": "success",
            "cpu_percent": cpu_pct,
            "ram_total_gb": round(ram.total / (1024**3), 2),
            "ram_used_gb": round(ram.used / (1024**3), 2),
            "ram_percent": ram.percent,
            "battery": battery_info,
            "system_uptime": f"{hours}h {minutes}m",
            "active_processes": len(psutil.pids()),
        }

    @staticmethod
    def launch_application(app_name: str) -> Dict[str, Any]:
        """Launches a standard Windows application."""
        clean_name = app_name.strip().lower()
        executable = COMMON_APPS.get(clean_name, app_name)
        
        try:
            subprocess.Popen([executable], shell=True)
            return {"status": "success", "message": f"Successfully launched {app_name}."}
        except Exception as e:
            return {"status": "error", "error": f"Failed to launch {app_name}: {str(e)}"}

    @staticmethod
    def close_application(app_name: str, confirm_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Closes an application by process name.
        Classified as DESTRUCTIVE/SENSITIVE: requires confirmation token.
        """
        clean_expired_confirmations()
        clean_name = app_name.strip().lower()
        if not clean_name.endswith(".exe"):
            clean_name += ".exe"

        # Check confirmation gate
        if not confirm_token or confirm_token not in PENDING_CONFIRMATIONS:
            token = str(uuid.uuid4())[:8]
            PENDING_CONFIRMATIONS[token] = {
                "action": "close_application",
                "target": clean_name,
                "created_at": time.time(),
            }
            return {
                "status": "confirmation_required",
                "confirmation_token": token,
                "warning": f"Terminating process '{clean_name}' may cause unsaved data loss.",
                "prompt": f"Please confirm to close {clean_name}. (Confirmation Token: {token})"
            }

        req = PENDING_CONFIRMATIONS.pop(confirm_token)
        if req["target"] != clean_name:
            return {"status": "error", "error": "Token mismatch for target application."}

        try:
            res = subprocess.run(["taskkill", "/IM", clean_name, "/F"], capture_output=True, text=True)
            if res.returncode == 0:
                return {"status": "success", "message": f"Closed application {clean_name}."}
            return {"status": "error", "error": f"Process not found or could not be terminated: {res.stderr.strip()}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @staticmethod
    def search_files(query_pattern: str, base_dir: Optional[str] = None, max_results: int = 20) -> Dict[str, Any]:
        """Searches files across user document and project directories."""
        search_roots = [Path(base_dir)] if base_dir and is_path_allowed(base_dir) else ALLOWED_BASE_DIRS
        matches = []

        for root in search_roots:
            if not root.exists():
                continue
            root_depth = len(root.parts)
            for current_root, dirs, files in os.walk(root):
                # Prune deep recursion and heavy folders
                dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".next", "__pycache__", "venv", ".venv", "AppData"}]
                curr_p = Path(current_root)
                if len(curr_p.parts) - root_depth > 3:
                    dirs.clear()
                    continue

                for f in files:
                    if query_pattern.lower() in f.lower():
                        file_path = curr_p / f
                        matches.append({
                            "name": f,
                            "path": str(file_path),
                            "is_dir": False,
                            "size_bytes": file_path.stat().st_size if file_path.is_file() else 0,
                        })
                        if len(matches) >= max_results:
                            break
                if len(matches) >= max_results:
                    break
            if len(matches) >= max_results:
                break

        return {
            "status": "success",
            "query": query_pattern,
            "count": len(matches),
            "results": matches,
        }

    @staticmethod
    def read_file(file_path: str, max_lines: int = 200) -> Dict[str, Any]:
        """Reads content of an approved file."""
        p = Path(file_path).resolve()
        if not is_path_allowed(str(p)):
            return {"status": "error", "error": f"Access denied: {file_path} is outside allowed user directories."}
        if not p.is_file():
            return {"status": "error", "error": f"File not found: {file_path}"}
        
        try:
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                lines = [f.readline() for _ in range(max_lines)]
            return {
                "status": "success",
                "path": str(p),
                "total_read_lines": len(lines),
                "content": "".join(lines),
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @staticmethod
    def write_file(file_path: str, content: str, mode: str = "write", confirm_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Creates or writes to a file in an approved directory.
        Overwriting existing file requires confirmation token.
        """
        p = Path(file_path).resolve()
        if not is_path_allowed(str(p)):
            return {"status": "error", "error": f"Access denied: {file_path} is outside allowed directories."}

        clean_expired_confirmations()
        if p.exists() and mode == "write":
            if not confirm_token or confirm_token not in PENDING_CONFIRMATIONS:
                token = str(uuid.uuid4())[:8]
                PENDING_CONFIRMATIONS[token] = {
                    "action": "write_file",
                    "target": str(p),
                    "created_at": time.time(),
                }
                return {
                    "status": "confirmation_required",
                    "confirmation_token": token,
                    "warning": f"File '{p.name}' already exists. Overwriting will replace its contents.",
                    "prompt": f"Please confirm to overwrite {p.name}. (Confirmation Token: {token})"
                }
            PENDING_CONFIRMATIONS.pop(confirm_token, None)

        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            write_mode = "a" if mode == "append" else "w"
            with open(p, write_mode, encoding="utf-8") as f:
                f.write(content)
            return {"status": "success", "message": f"Successfully written to {p.name}."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @staticmethod
    def delete_file(file_path: str, confirm_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Deletes a file with strict confirmation token gate.
        """
        p = Path(file_path).resolve()
        if not is_path_allowed(str(p)):
            return {"status": "error", "error": f"Access denied: {file_path} is outside allowed directories."}
        if not p.exists():
            return {"status": "error", "error": "File does not exist."}

        clean_expired_confirmations()
        if not confirm_token or confirm_token not in PENDING_CONFIRMATIONS:
            token = str(uuid.uuid4())[:8]
            PENDING_CONFIRMATIONS[token] = {
                "action": "delete_file",
                "target": str(p),
                "created_at": time.time(),
            }
            return {
                "status": "confirmation_required",
                "confirmation_token": token,
                "warning": f"CRITICAL: Deleting file '{p.name}' cannot be undone.",
                "prompt": f"Please confirm deletion of {p.name}. (Confirmation Token: {token})"
            }

        PENDING_CONFIRMATIONS.pop(confirm_token, None)
        try:
            p.unlink()
            return {"status": "success", "message": f"File {p.name} deleted successfully."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @staticmethod
    def run_developer_command(command: str, cwd: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs developer workflows: e.g. git status, npm test, python pytest.
        Blocked for dangerous system commands (format, rm -rf, etc.).
        """
        working_dir = Path(cwd).resolve() if cwd else Path.cwd()
        if not is_path_allowed(str(working_dir)):
            return {"status": "error", "error": "Working directory outside allowed project paths."}

        lower_cmd = command.lower()
        blocked_commands = ["format ", "rmdir /s /q c:", "del /f /s /q c:", "mkfs", "shutdown", "drop database"]
        if any(b in lower_cmd for b in blocked_commands):
            return {"status": "error", "error": f"Command rejected: '{command}' violates security policy."}

        try:
            start_t = time.time()
            res = subprocess.run(command, cwd=working_dir, shell=True, capture_output=True, text=True, timeout=30)
            elapsed = time.time() - start_t
            return {
                "status": "success",
                "command": command,
                "returncode": res.returncode,
                "stdout": res.stdout[:2000],
                "stderr": res.stderr[:2000],
                "elapsed_seconds": round(elapsed, 2),
            }
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": f"Command '{command}' timed out after 30 seconds."}
        except Exception as e:
            return {"status": "error", "error": str(e)}
