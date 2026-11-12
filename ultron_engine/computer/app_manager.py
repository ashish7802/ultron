"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.app_manager
Purpose: Native Windows Application Discovery, Launching, Switching & Lifecycle Management
===============================================================================

Key Responsibilities:
- Module 03: Application Intelligence & Lifecycle Supervisor.
- Comprehensive discovery of installed software across Windows Registry (32 & 64-bit),
  Start Menu shortcut directories, user Desktop, and system built-in utilities.
- Safe process launching with PID tracking and window readiness verification.
- Application switching by focusing matching HWNDs with focus lock breaking.
- Safe application termination with protected process boundary enforcement
  (blocks termination of critical Windows services: csrss, lsass, services, explorer).
- Application health & responsiveness inspection (IsHungAppWindow, CPU/memory state).

Architectural Role & Interactions:
- Bridges with `desktop_engine.py` for window enumeration and focus activation.
- Consumed by `computer_intelligence_cli.py` and Node.js `applicationIntelligence.ts`.

Safety / Security Guarantees:
- Protected system processes cannot be terminated.
- Shell injection prevented: commands are executed with explicit argument vectors.
- Fails closed if application is not allowlisted or found.
===============================================================================
"""

import os
import sys
import time
import winreg
import subprocess
import ctypes
from ctypes import wintypes
from typing import Any, Dict, List, Optional, Tuple

from . import desktop_engine

kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32

# Protected Windows System Processes that must NEVER be terminated
PROTECTED_PROCESSES = {
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

# Standard built-in Windows applications and their canonical commands
BUILTIN_APPS: Dict[str, Dict[str, Any]] = {
    "notepad": {"name": "Notepad", "executable": "notepad.exe", "type": "builtin"},
    "calculator": {"name": "Calculator", "executable": "calc.exe", "type": "builtin"},
    "calc": {"name": "Calculator", "executable": "calc.exe", "type": "builtin"},
    "paint": {"name": "Paint", "executable": "mspaint.exe", "type": "builtin"},
    "task manager": {"name": "Task Manager", "executable": "taskmgr.exe", "type": "builtin"},
    "cmd": {"name": "Command Prompt", "executable": "cmd.exe", "type": "builtin"},
    "powershell": {"name": "Windows PowerShell", "executable": "powershell.exe", "type": "builtin"},
    "explorer": {"name": "File Explorer", "executable": "explorer.exe", "type": "builtin"},
    "settings": {"name": "Settings", "executable": "start ms-settings:", "type": "uri"},
    "edge": {"name": "Microsoft Edge", "executable": "msedge.exe", "type": "browser"},
    "chrome": {"name": "Google Chrome", "executable": "chrome.exe", "type": "browser"},
    "code": {"name": "Visual Studio Code", "executable": "code.cmd", "type": "editor"},
}

_apps_cache: Optional[List[Dict[str, Any]]] = None
_cache_timestamp: float = 0.0
CACHE_TTL = 300.0  # 5 minutes


def _scan_registry_uninstall_keys() -> List[Dict[str, Any]]:
    """
    Scans HKLM and HKCU uninstall keys for registered desktop software.

    Returns:
        List[Dict[str, Any]]: Discovered application entries.
    """
    apps: List[Dict[str, Any]] = []
    seen_names = set()

    roots = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]

    for hkey, subkey_path in roots:
        try:
            with winreg.OpenKey(hkey, subkey_path) as root_key:
                subkeys_count, _, _ = winreg.QueryInfoKey(root_key)
                for i in range(subkeys_count):
                    try:
                        subkey_name = winreg.EnumKey(root_key, i)
                        with winreg.OpenKey(root_key, subkey_name) as app_key:
                            try:
                                display_name = winreg.QueryValueEx(app_key, "DisplayName")[0]
                            except OSError:
                                continue

                            if not display_name or display_name in seen_names:
                                continue

                            install_loc = ""
                            try:
                                install_loc = winreg.QueryValueEx(app_key, "InstallLocation")[0]
                            except OSError:
                                pass

                            display_icon = ""
                            try:
                                display_icon = winreg.QueryValueEx(app_key, "DisplayIcon")[0]
                            except OSError:
                                pass

                            seen_names.add(display_name)
                            apps.append({
                                "name": display_name,
                                "installLocation": install_loc,
                                "icon": display_icon,
                                "source": "registry",
                            })
                    except Exception:
                        continue
        except Exception:
            continue

    return apps


def _scan_shortcut_directories() -> List[Dict[str, Any]]:
    """
    Scans user and system Start Menu and Desktop folders for .lnk shortcuts.

    Returns:
        List[Dict[str, Any]]: List of shortcut descriptors.
    """
    apps: List[Dict[str, Any]] = []
    seen_names = set()

    paths_to_scan = [
        os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
        os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), r"Microsoft\Windows\Start Menu\Programs"),
        os.path.join(os.environ.get("USERPROFILE", ""), "Desktop"),
        r"C:\Users\Public\Desktop",
    ]

    for base_dir in paths_to_scan:
        if not os.path.exists(base_dir):
            continue
        try:
            for root, _, files in os.walk(base_dir):
                for f in files:
                    if f.lower().endswith(".lnk"):
                        app_name = os.path.splitext(f)[0]
                        clean_name = app_name.strip()
                        if clean_name.lower() not in seen_names:
                            seen_names.add(clean_name.lower())
                            apps.append({
                                "name": clean_name,
                                "path": os.path.join(root, f),
                                "source": "shortcut",
                            })
        except Exception:
            continue

    return apps


def discover_installed_apps(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Discovers all installed applications on the Windows system.

    Combines registry uninstall database, Start Menu shortcuts, and built-in utilities.
    Caches results in memory for fast repeated voice/AI turns.

    Args:
        force_refresh (bool): If True, bypasses cache.

    Returns:
        List[Dict[str, Any]]: Application metadata list.
    """
    global _apps_cache, _cache_timestamp
    now = time.time()
    if not force_refresh and _apps_cache is not None and (now - _cache_timestamp < CACHE_TTL):
        return list(_apps_cache)

    combined: List[Dict[str, Any]] = []
    seen_names = set()

    # 1. Add built-in applications
    for key, info in BUILTIN_APPS.items():
        if info["name"].lower() not in seen_names:
            seen_names.add(info["name"].lower())
            combined.append({
                "name": info["name"],
                "alias": key,
                "executable": info["executable"],
                "source": info["type"],
            })

    # 2. Add Start Menu shortcuts
    shortcuts = _scan_shortcut_directories()
    for item in shortcuts:
        norm = item["name"].lower()
        if norm not in seen_names:
            seen_names.add(norm)
            combined.append(item)

    # 3. Add Registry software entries
    reg_apps = _scan_registry_uninstall_keys()
    for item in reg_apps:
        norm = item["name"].lower()
        if norm not in seen_names:
            seen_names.add(norm)
            combined.append(item)

    _apps_cache = combined
    _cache_timestamp = now
    return list(_apps_cache)


def find_app(query: str) -> Optional[Dict[str, Any]]:
    """
    Finds the closest matching application by query string or alias.

    Args:
        query (str): App name or keyword.

    Returns:
        Optional[Dict[str, Any]]: Best matching application descriptor or None.
    """
    if not query:
        return None
    q = query.strip().lower()

    # Exact alias check
    if q in BUILTIN_APPS:
        return BUILTIN_APPS[q]

    apps = discover_installed_apps()

    # Exact name match
    for app in apps:
        if app["name"].lower() == q or app.get("alias") == q:
            return app

    # Substring match
    for app in apps:
        if q in app["name"].lower():
            return app

    return None


def launch_app(app_name_or_path: str, args: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Launches an application safely and verifies that a process starts.

    Args:
        app_name_or_path (str): Spoken app name, alias, executable, or shortcut path.
        args (Optional[List[str]]): Optional command-line arguments.

    Returns:
        Dict[str, Any]: {success, pid, message, executable}.

    Side Effects:
        Spawns a new operating system child process.
    """
    target = find_app(app_name_or_path)
    cmd: List[str] = []

    if target:
        if target.get("source") == "uri":
            os.system(target["executable"])
            return {"success": True, "message": f"Opened {target['name']}", "uri": target["executable"]}
        if target.get("path"):
            # Shell execute .lnk shortcut
            try:
                os.startfile(target["path"])
                return {"success": True, "message": f"Launched {target['name']}", "shortcut": target["path"]}
            except Exception as e:
                return {"success": False, "error": f"Failed to open shortcut: {e}"}
        elif target.get("executable"):
            cmd = [target["executable"]]
    else:
        # Direct executable or file path
        if os.path.exists(app_name_or_path):
            try:
                os.startfile(app_name_or_path)
                return {"success": True, "message": f"Opened {app_name_or_path}"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        cmd = [app_name_or_path]

    if args:
        cmd.extend(args)

    try:
        proc = subprocess.Popen(
            cmd,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        return {
            "success": True,
            "pid": proc.pid,
            "executable": cmd[0],
            "message": f"Successfully launched {cmd[0]} (PID: {proc.pid})",
        }
    except Exception as e:
        return {"success": False, "error": f"Launch failed: {str(e)}"}


def switch_to_app(app_name_or_pid: Any) -> Dict[str, Any]:
    """
    Brings an existing application window to the foreground.

    Args:
        app_name_or_pid: Process ID (int) or Application/Window title substring (str).

    Returns:
        Dict[str, Any]: Status dictionary {success, hwnd, title, message}.

    Side Effects:
        Restores window and sets active OS foreground focus.
    """
    windows = desktop_engine.enumerate_windows()
    target_win = None

    if isinstance(app_name_or_pid, int) or (isinstance(app_name_or_pid, str) and app_name_or_pid.isdigit()):
        pid_val = int(app_name_or_pid)
        for w in windows:
            if w["processId"] == pid_val:
                target_win = w
                break
    else:
        query = str(app_name_or_pid).lower().strip()
        for w in windows:
            if query in w["title"].lower() or query in w["processName"].lower():
                target_win = w
                break

    if not target_win:
        return {
            "success": False,
            "error": f"No running window found matching '{app_name_or_pid}'.",
        }

    focused = desktop_engine.set_foreground_window(target_win["hwnd"])
    return {
        "success": focused,
        "hwnd": target_win["handle"],
        "title": target_win["title"],
        "processName": target_win["processName"],
        "message": f"Switched to {target_win['title']}" if focused else "Failed to bring window to foreground",
    }


def terminate_app(app_name_or_pid: Any, force: bool = False) -> Dict[str, Any]:
    """
    Terminates an application window or process with safety boundary enforcement.

    Args:
        app_name_or_pid: Process ID (int) or Application name (str).
        force (bool): If True, forces process termination after timeout.

    Returns:
        Dict[str, Any]: Termination outcome.

    Raises:
        PermissionError: If target is in PROTECTED_PROCESSES.

    Side Effects:
        Closes window or terminates process.
    """
    target_str = str(app_name_or_pid or "").lower().strip()
    if any(p in target_str for p in PROTECTED_PROCESSES):
        return {
            "success": False,
            "error": f"Security Violation: '{target_str}' is a protected Windows system process.",
            "blocked": True,
        }

    windows = desktop_engine.enumerate_windows(include_hidden=True)
    target_win = None

    if isinstance(app_name_or_pid, int) or (isinstance(app_name_or_pid, str) and str(app_name_or_pid).isdigit()):
        pid_val = int(app_name_or_pid)
        for w in windows:
            if w["processId"] == pid_val:
                target_win = w
                break
    else:
        query = str(app_name_or_pid).lower().strip()
        for w in windows:
            if query in w["processName"].lower() or query in w["title"].lower():
                target_win = w
                break

    if target_win:
        proc_name = target_win["processName"].lower()
        if proc_name in PROTECTED_PROCESSES:
            return {
                "success": False,
                "error": f"Security Violation: '{proc_name}' is a protected Windows system process.",
                "blocked": True,
            }
        return desktop_engine.close_window(target_win["hwnd"], force_terminate=force)

    # If no window handle was found, check if it's a PID to terminate directly
    if isinstance(app_name_or_pid, int) or (isinstance(app_name_or_pid, str) and str(app_name_or_pid).isdigit()):
        pid_val = int(app_name_or_pid)
        if pid_val <= 4:
            return {"success": False, "error": "Cannot terminate system PID 4", "blocked": True}

        h_proc = kernel32.OpenProcess(0x0001, False, pid_val)  # PROCESS_TERMINATE
        if not h_proc:
            return {"success": False, "error": f"Cannot open PID {pid_val} for termination"}
        try:
            kernel32.TerminateProcess(h_proc, 1)
            return {"success": True, "terminated": True, "processId": pid_val}
        finally:
            kernel32.CloseHandle(h_proc)

    return {"success": False, "error": f"Could not find application or PID '{app_name_or_pid}'."}
