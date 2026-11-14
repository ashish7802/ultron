"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.computer_intelligence_cli
Purpose: Unified JSON CLI Dispatcher for Windows Computer Intelligence Operations
===============================================================================

Key Responsibilities:
- Exposes a unified command-line interface with strict JSON stdin/stdout contracts.
- Dispatches requests across all 11 Computer Intelligence modules:
  - Modules 01 & 02: Desktop introspection, displays, OS metadata, window topology.
  - Module 03: Application discovery, launching, switching, and closing.
  - Module 04: Hardware-level SendInput mouse and keyboard control.
  - Module 05: UIA semantic element interaction, inspection, and visual state diffs.
  - Module 06: Guarded filesystem reading, writing, backups, search, duplicates.
  - Module 07: Shell identification, safe execution, background job supervision.
  - Module 08: Browser discovery, safe URL navigation, tab/page inspection.
  - Module 09: VS Code, Git status, dev server port checks, build and test runners.
  - Module 10: Emergency Stop trigger/reset, safety boundary checks, audit logging.
  - Module 11: End-to-end task execution and verification primitives.

Architectural Role & Interactions:
- Invoked via `child_process.execFile("python", ["-m", "ultron_engine.computer.computer_intelligence_cli", ...])`
  from Node.js TypeScript facades in `lib/computer/`.
- Fails closed if parameters are corrupted or Emergency Stop is active.

Safety / Security Guarantees:
- Every mutating command passes through `safety_controller.validate_safety_boundaries()`.
- Catches all exceptions and outputs structured JSON error messages without crashing.
===============================================================================
"""

import os
import sys
import json
import time
from typing import Any, Dict

from . import desktop_engine
from . import app_manager
from . import input_driver
from . import uia_engine
from . import visual_recognizer
from . import filesystem_driver
from . import terminal_driver
from . import browser_driver
from . import dev_driver
from . import safety_controller


def dispatch(command: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Routes a command string and payload dictionary to the appropriate subsystem.

    Args:
        command (str): Command name.
        payload (Dict[str, Any]): Command parameters.

    Returns:
        Dict[str, Any]: JSON-serializable result dictionary.
    """
    # Check Emergency Stop first for any action other than status / reset
    if command not in ("emergency_stop_status", "reset_emergency_stop", "trigger_emergency_stop", "os_info", "monitors"):
        if safety_controller.is_emergency_stop_active():
            return {
                "success": False,
                "error": "Operation rejected: Independent Emergency Stop is currently active.",
                "blocked": True,
                "emergencyStop": True,
            }

    # 1. Desktop & OS Introspection (Module 02)
    if command == "os_info":
        return {"success": True, "data": desktop_engine.get_os_metadata()}
    elif command == "monitors":
        return {"success": True, "data": desktop_engine.get_display_monitors()}
    elif command == "windows":
        include_hidden = payload.get("includeHidden", False)
        return {"success": True, "data": desktop_engine.enumerate_windows(include_hidden=include_hidden)}
    elif command == "active_window":
        return {"success": True, "data": desktop_engine.get_active_window()}
    elif command == "focus_window":
        hwnd = int(payload["hwnd"])
        ok = desktop_engine.set_foreground_window(hwnd)
        return {"success": ok, "hwnd": hwnd}
    elif command == "window_state":
        hwnd = int(payload["hwnd"])
        state = payload.get("state", "restore")
        ok = desktop_engine.set_window_state(hwnd, state)
        return {"success": ok, "hwnd": hwnd, "state": state}
    elif command == "move_window":
        hwnd = int(payload["hwnd"])
        x, y = int(payload["x"]), int(payload["y"])
        w, h = int(payload["width"]), int(payload["height"])
        ok = desktop_engine.move_and_resize_window(hwnd, x, y, w, h)
        return {"success": ok, "hwnd": hwnd}
    elif command == "close_window":
        hwnd = int(payload["hwnd"])
        force = payload.get("force", False)
        return desktop_engine.close_window(hwnd, force_terminate=force)

    # 2. Application Intelligence (Module 03)
    elif command == "discover_apps":
        refresh = payload.get("forceRefresh", False)
        apps = app_manager.discover_installed_apps(force_refresh=refresh)
        return {"success": True, "count": len(apps), "data": apps}
    elif command == "find_app":
        app = app_manager.find_app(payload.get("query", ""))
        return {"success": app is not None, "data": app}
    elif command == "launch_app":
        name = payload.get("app", "")
        args = payload.get("args")
        return app_manager.launch_app(name, args=args)
    elif command == "switch_app":
        target = payload.get("target")
        return app_manager.switch_to_app(target)
    elif command == "terminate_app":
        target = payload.get("target")
        force = payload.get("force", False)
        return app_manager.terminate_app(target, force=force)

    # 3. Input Automation (Module 04)
    elif command == "cursor_pos":
        x, y = input_driver.get_cursor_position()
        return {"success": True, "x": x, "y": y}
    elif command == "mouse_move":
        x, y = int(payload["x"]), int(payload["y"])
        smooth = payload.get("smooth", False)
        fx, fy = input_driver.mouse_move(x, y, smooth=smooth)
        return {"success": True, "x": fx, "y": fy}
    elif command == "mouse_click":
        x = payload.get("x")
        y = payload.get("y")
        btn = payload.get("button", "left")
        ctype = payload.get("clickType", "single")
        return input_driver.mouse_click(x=x, y=y, button=btn, click_type=ctype)
    elif command == "mouse_drag":
        sx, sy = int(payload["startX"]), int(payload["startY"])
        ex, ey = int(payload["endX"]), int(payload["endY"])
        dur = payload.get("durationMs", 250)
        return input_driver.mouse_drag(sx, sy, ex, ey, duration_ms=dur)
    elif command == "mouse_scroll":
        dy = int(payload.get("deltaY", 0))
        dx = int(payload.get("deltaX", 0))
        return input_driver.mouse_scroll(dy, dx)
    elif command == "type_text":
        txt = payload.get("text", "")
        delay = payload.get("delayMs", 15)
        return input_driver.type_text(txt, delay_ms=delay)
    elif command == "send_hotkey":
        keys = payload.get("keys", [])
        return input_driver.send_hotkey(keys)

    # 4. Semantic UI Automation & Visual Recognition (Module 05)
    elif command == "dump_elements":
        hwnd = int(payload["hwnd"])
        max_el = payload.get("maxElements", 100)
        elements = uia_engine.dump_window_elements(hwnd, max_elements=max_el)
        return {"success": True, "count": len(elements), "data": elements}
    elif command == "semantic_interact":
        hwnd = int(payload["hwnd"])
        selector = payload.get("selector", {})
        action = payload.get("action", "click")
        value = payload.get("value")
        return uia_engine.semantic_interact(hwnd, selector, action=action, value=value)
    elif command == "ui_snapshot":
        hwnd = payload.get("hwnd")
        return {"success": True, "data": visual_recognizer.capture_ui_snapshot(hwnd=hwnd)}
    elif command == "compare_ui":
        before = payload.get("before", {})
        after = payload.get("after", {})
        return {"success": True, "data": visual_recognizer.compare_ui_states(before, after)}
    elif command == "resolve_target":
        hwnd = int(payload["hwnd"])
        desc = payload.get("description", "")
        target_el = visual_recognizer.resolve_action_target(hwnd, desc)
        return {"success": target_el is not None, "data": target_el}

    # 5. File System Intelligence (Module 06)
    elif command == "file_meta":
        return filesystem_driver.get_file_metadata(payload.get("path", ""))
    elif command == "list_dir":
        p = payload.get("path", ".")
        max_i = payload.get("maxItems", 500)
        return filesystem_driver.list_directory(p, max_items=max_i)
    elif command == "search_files":
        root = payload.get("root", ".")
        query = payload.get("query", "")
        rec = payload.get("recursive", True)
        return filesystem_driver.search_files(root, query, recursive=rec)
    elif command == "read_file":
        p = payload.get("path", "")
        max_b = payload.get("maxBytes", 1048576)
        return filesystem_driver.read_file(p, max_bytes=max_b)
    elif command == "write_file":
        p = payload.get("path", "")
        content = payload.get("content", "")
        overwrite = payload.get("overwrite", False)
        approval_granted = bool(payload.get("approvalGranted", False) or payload.get("approval_granted", False))
        execution_grant = payload.get("executionGrant") or payload.get("execution_grant")
        return filesystem_driver.write_file(
            p,
            content,
            overwrite=overwrite,
            approval_granted=approval_granted,
            execution_grant=execution_grant,
        )
    elif command == "delete_file":
        p = payload.get("path", "")
        return filesystem_driver.delete_file(p)
    elif command == "find_duplicates":
        p = payload.get("directory", ".")
        return filesystem_driver.find_duplicates(p)

    # 6. Terminal Intelligence (Module 07)
    elif command == "shells":
        return {"success": True, "data": terminal_driver.detect_shells()}
    elif command == "exec_cmd":
        cmd = payload.get("command", "")
        sh = payload.get("shell", "powershell")
        cwd = payload.get("cwd")
        timeout = payload.get("timeoutSec", 30)
        appr = bool(payload.get("approvalGranted", False) or payload.get("approval_granted", False))
        return terminal_driver.execute_command(cmd, shell_name=sh, cwd=cwd, timeout_sec=timeout, approval_granted=appr)
    elif command == "start_job":
        cmd = payload.get("command", "")
        sh = payload.get("shell", "powershell")
        cwd = payload.get("cwd")
        appr = bool(payload.get("approvalGranted", False) or payload.get("approval_granted", False))
        return terminal_driver.start_background_job(cmd, shell_name=sh, cwd=cwd, approval_granted=appr)
    elif command == "poll_job":
        job_id = payload.get("jobId", "")
        return terminal_driver.poll_background_job(job_id)
    elif command == "kill_job":
        job_id = payload.get("jobId", "")
        return terminal_driver.terminate_background_job(job_id)
    elif command == "cmd_history":
        return {"success": True, "data": terminal_driver.get_command_history()}

    # 7. Browser Interaction (Module 08)
    elif command == "browsers":
        return {"success": True, "data": browser_driver.detect_installed_browsers()}
    elif command == "default_browser":
        return {"success": True, "data": browser_driver.get_default_browser()}
    elif command == "running_browsers":
        return {"success": True, "data": browser_driver.get_running_browser_windows()}
    elif command == "navigate_url":
        url = payload.get("url", "")
        browser = payload.get("browser")
        return browser_driver.navigate_to_url(url, browser=browser)
    elif command == "inspect_browser":
        hwnd = payload.get("hwnd")
        return browser_driver.inspect_page_state(hwnd=hwnd)
    elif command == "downloads":
        folder = payload.get("downloadsFolder")
        return browser_driver.get_download_status(downloads_folder=folder)

    # 8. Development Environment Intelligence (Module 09)
    elif command == "project_context":
        d = payload.get("directory")
        return {"success": True, "data": dev_driver.detect_project_context(directory=d)}
    elif command == "git_status":
        d = payload.get("directory")
        return dev_driver.get_git_status(directory=d)
    elif command == "open_vscode":
        f = payload.get("file", "")
        l = payload.get("line")
        c = payload.get("column")
        return dev_driver.open_file_in_vscode(f, line=l, column=c)
    elif command == "check_port":
        port = int(payload.get("port", 3000))
        host = payload.get("host", "127.0.0.1")
        return dev_driver.check_port_listening(port, host=host)
    elif command == "build_project":
        cmd = payload.get("command", "npm run build")
        cwd = payload.get("cwd")
        timeout = payload.get("timeoutSec", 120)
        return dev_driver.run_project_build(command=cmd, cwd=cwd, timeout_sec=timeout)
    elif command == "test_project":
        cmd = payload.get("command", "npm test")
        cwd = payload.get("cwd")
        timeout = payload.get("timeoutSec", 60)
        return dev_driver.run_project_tests(command=cmd, cwd=cwd, timeout_sec=timeout)

    # 9. Computer Safety Controls (Module 10)
    elif command == "emergency_stop_status":
        return {"success": True, "emergencyStopActive": safety_controller.is_emergency_stop_active()}
    elif command == "trigger_emergency_stop":
        reason = payload.get("reason", "Triggered via CLI")
        return safety_controller.trigger_emergency_stop(reason=reason)
    elif command == "reset_emergency_stop":
        reason = payload.get("reason", "Reset via CLI")
        return safety_controller.reset_emergency_stop(reason=reason)
    elif command == "validate_safety":
        action = payload.get("action", "")
        target = payload.get("target")
        params = payload.get("params")
        return safety_controller.validate_safety_boundaries(action, target, params=params)

    return {"success": False, "error": f"Unknown command '{command}'"}


def main():
    """Main CLI entrypoint accepting command and JSON payload from argv or stdin."""
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command provided."}))
        sys.exit(1)

    command = sys.argv[1]
    payload = {}

    # Support explicit --stdin flag OR reading from stdin if argv[2] is omitted
    if "--stdin" in sys.argv:
        try:
            raw = sys.stdin.read().strip()
            if raw:
                payload = json.loads(raw)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Invalid stdin JSON: {e}"}))
            sys.exit(1)
    elif len(sys.argv) > 2:
        try:
            payload = json.loads(sys.argv[2])
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON payload: {e}"}))
            sys.exit(1)
    else:
        # Fallback: if data is piped into stdin without explicit --stdin flag
        try:
            if not sys.stdin.isatty():
                raw = sys.stdin.read().strip()
                if raw:
                    payload = json.loads(raw)
        except Exception:
            payload = {}

    try:
        result = dispatch(command, payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
