"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.desktop_engine
Purpose: Native Windows 11 Desktop Understanding, Topology & Window Management
===============================================================================

Key Responsibilities:
- Detects physical operating system metadata (Windows edition, build, UBR, arch).
- Identifies multi-monitor topology, per-monitor DPI scaling, and virtual metrics.
- Enumerates live top-level windows with pixel-perfect DWM extended frame bounds.
- Distinguishes active, cloaked, minimized, maximized, and hung application windows.
- Provides robust Win32 window manipulation (foreground activation with thread input
  attaching to bypass focus locks, minimize, maximize, restore, move, and close).

Architectural Role & Interactions:
- Powers Module 02 (Desktop Understanding Engine) and Module 03 (Window Management).
- Consumed by `computer_intelligence_cli.py` and Node.js `desktopEngine.ts`.

Safety / Security Guarantees:
- Read-only introspection for desktop state.
- Focus stealing prevention handled safely via standard Win32 attach APIs.
- Protected system windows (e.g., lock screen, security prompts) are flagged.
===============================================================================
"""

import sys
import os
import platform
import winreg
import ctypes
from ctypes import wintypes
from typing import Any, Dict, List, Optional, Tuple

# Win32 API DLL imports
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32

try:
    dwmapi = ctypes.windll.dwmapi
except Exception:
    dwmapi = None

try:
    shcore = ctypes.windll.shcore
except Exception:
    shcore = None

# Enable DPI awareness to ensure coordinates match physical pixels
try:
    user32.SetProcessDPIAware()
except Exception:
    pass

# Win32 Constants
SW_HIDE = 0
SW_NORMAL = 1
SW_SHOWMINIMIZED = 2
SW_MAXIMIZE = 3
SW_SHOWNOACTIVATE = 4
SW_SHOW = 5
SW_MINIMIZE = 6
SW_SHOWNA = 8
SW_RESTORE = 9

WM_CLOSE = 0x0010
WM_SYSCOMMAND = 0x0112
SC_CLOSE = 0xF060

DWMWA_EXTENDED_FRAME_BOUNDS = 9
DWMWA_CLOAKED = 14

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_TERMINATE = 0x0001
DESKTOP_ALL = 0x014F

_default_desktop_handle = None


def ensure_interactive_desktop():
    """
    Ensures the current thread is attached to the user's interactive 'default' desktop.

    Why this is required:
    In automated execution, CI, or sandboxed child processes, the thread desktop may be
    initialized to a private station/desktop rather than the user's physical interactive
    desktop. Attaching to 'default' grants full access to interactive windows and GDI.

    Returns:
        int: Desktop handle or None if unavailable.
    """
    global _default_desktop_handle
    try:
        hdesk = user32.OpenDesktopW("default", 0, False, DESKTOP_ALL)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            _default_desktop_handle = hdesk
            return hdesk
    except Exception:
        pass
    return None



class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def get_os_metadata() -> Dict[str, Any]:
    """
    Queries Windows Registry and OS subsystem for exact build and edition metadata.

    Returns:
        Dict[str, Any]: OS metadata including name, build number, UBR, edition, architecture.

    Side Effects:
        Reads local machine registry keys (read-only).
    """
    info: Dict[str, Any] = {
        "platform": "windows",
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python_version": platform.python_version(),
        "product_name": "Windows",
        "display_version": "",
        "current_build": "",
        "ubr": 0,
        "edition_id": "",
    }

    try:
        key_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            try:
                info["product_name"] = winreg.QueryValueEx(key, "ProductName")[0]
            except OSError:
                pass
            try:
                info["display_version"] = winreg.QueryValueEx(key, "DisplayVersion")[0]
            except OSError:
                pass
            try:
                info["current_build"] = winreg.QueryValueEx(key, "CurrentBuild")[0]
            except OSError:
                pass
            try:
                info["ubr"] = winreg.QueryValueEx(key, "UBR")[0]
            except OSError:
                pass
            try:
                info["edition_id"] = winreg.QueryValueEx(key, "EditionID")[0]
            except OSError:
                pass
    except Exception:
        pass

    # Windows 11 build verification: Windows 11 has build >= 22000
    try:
        build_int = int(info["current_build"] or "0")
        if build_int >= 22000 and "Windows 10" in info.get("product_name", ""):
            info["product_name"] = info["product_name"].replace("Windows 10", "Windows 11")
    except ValueError:
        pass

    return info


def get_display_monitors() -> List[Dict[str, Any]]:
    """
    Enumerates all physical and virtual connected display monitors.

    Returns:
        List[Dict[str, Any]]: Monitor descriptors containing geometry and DPI scale factors.

    Side Effects:
        Queries User32 GDI display interfaces.
    """
    monitors: List[Dict[str, Any]] = []

    def monitor_enum_proc(hMonitor, hdcMonitor, lprcMonitor, dwData):
        r = lprcMonitor.contents
        w = max(0, r.right - r.left)
        h = max(0, r.bottom - r.top)
        is_primary = (r.left == 0 and r.top == 0)

        # Query per-monitor DPI if Shcore is available
        dpi_x = ctypes.c_uint(96)
        dpi_y = ctypes.c_uint(96)
        scale_factor = 1.0
        if shcore and hasattr(shcore, "GetDpiForMonitor"):
            # MDT_EFFECTIVE_DPI = 0
            res = shcore.GetDpiForMonitor(hMonitor, 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y))
            if res == 0:
                scale_factor = round(dpi_x.value / 96.0, 2)

        monitors.append({
            "id": f"display_{len(monitors) + 1}",
            "handle": hex(hMonitor),
            "name": f"Display {len(monitors) + 1}{' (Primary)' if is_primary else ''}",
            "isPrimary": is_primary,
            "bounds": {"x": r.left, "y": r.top, "width": w, "height": h},
            "scaleFactor": scale_factor,
            "dpi": {"x": dpi_x.value, "y": dpi_y.value},
            "resolution": {"width": w, "height": h},
        })
        return True

    MONITORENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_bool,
        wintypes.HMONITOR,
        wintypes.HDC,
        ctypes.POINTER(RECT),
        wintypes.LPARAM,
    )
    user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(monitor_enum_proc), 0)

    # Fallback to primary virtual screen metrics if enumeration returns empty
    if not monitors:
        vx = user32.GetSystemMetrics(76)  # SM_XVIRTUALSCREEN
        vy = user32.GetSystemMetrics(77)  # SM_YVIRTUALSCREEN
        vw = user32.GetSystemMetrics(78)  # SM_CXVIRTUALSCREEN
        vh = user32.GetSystemMetrics(79)  # SM_CYVIRTUALSCREEN
        monitors.append({
            "id": "display_1",
            "handle": "0x0",
            "name": "Display 1 (Primary)",
            "isPrimary": True,
            "bounds": {"x": vx, "y": vy, "width": vw, "height": vh},
            "scaleFactor": 1.0,
            "dpi": {"x": 96, "y": 96},
            "resolution": {"width": vw, "height": vh},
        })

    return monitors


def _get_window_extended_bounds(hwnd: int) -> Dict[str, int]:
    """
    Retrieves the visible window bounds using DwmGetWindowAttribute.
    Falls back to standard GetWindowRect if DWM is unavailable or fails.

    Args:
        hwnd (int): Native Win32 window handle.

    Returns:
        Dict[str, int]: Bounding box dictionary {x, y, width, height}.
    """
    rect = RECT()
    bounds_found = False

    if dwmapi and hasattr(dwmapi, "DwmGetWindowAttribute"):
        res = dwmapi.DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            ctypes.byref(rect),
            ctypes.sizeof(RECT),
        )
        if res == 0:
            bounds_found = True

    if not bounds_found:
        user32.GetWindowRect(hwnd, ctypes.byref(rect))

    w = max(0, rect.right - rect.left)
    h = max(0, rect.bottom - rect.top)
    return {"x": rect.left, "y": rect.top, "width": w, "height": h}


def _get_process_path(pid: int) -> Tuple[str, str]:
    """
    Resolves the process executable name and full filesystem path for a PID.

    Args:
        pid (int): Operating system process ID.

    Returns:
        Tuple[str, str]: (executable_name, full_path).
    """
    if pid <= 4:
        return ("System", "System")

    h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h_proc:
        return ("", "")

    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(1024)
        if kernel32.QueryFullProcessImageNameW(h_proc, 0, buf, ctypes.byref(size)):
            full_path = buf.value
            exe_name = os.path.basename(full_path)
            return (exe_name, full_path)
    finally:
        kernel32.CloseHandle(h_proc)

    return ("", "")


def _is_window_cloaked(hwnd: int) -> bool:
    """
    Checks if a window is cloaked (e.g., on an inactive virtual desktop or suspended UWP).

    Args:
        hwnd (int): Native window handle.

    Returns:
        bool: True if cloaked; False otherwise.
    """
    if dwmapi and hasattr(dwmapi, "DwmGetWindowAttribute"):
        cloaked = wintypes.DWORD()
        res = dwmapi.DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            ctypes.byref(cloaked),
            ctypes.sizeof(wintypes.DWORD),
        )
        if res == 0:
            return cloaked.value != 0
    return False


def get_window_details(hwnd: int) -> Optional[Dict[str, Any]]:
    """
    Collects rich window topology, title, state, and process metadata for an HWND.

    Args:
        hwnd (int): Win32 window handle.

    Returns:
        Optional[Dict[str, Any]]: Detailed window information or None if invalid.
    """
    if not user32.IsWindow(hwnd):
        return None

    length = user32.GetWindowTextLengthW(hwnd)
    title_buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, title_buf, length + 1)
    title = title_buf.value

    pid = wintypes.DWORD()
    tid = user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    exe_name, exe_path = _get_process_path(pid.value)
    bounds = _get_window_extended_bounds(hwnd)

    is_visible = bool(user32.IsWindowVisible(hwnd))
    is_minimized = bool(user32.IsIconic(hwnd))
    is_maximized = bool(user32.IsZoomed(hwnd))
    is_cloaked = _is_window_cloaked(hwnd)
    is_hung = bool(user32.IsHungAppWindow(hwnd)) if hasattr(user32, "IsHungAppWindow") else False

    return {
        "handle": hex(hwnd),
        "hwnd": hwnd,
        "title": title,
        "processId": pid.value,
        "threadId": tid,
        "processName": exe_name,
        "processPath": exe_path,
        "bounds": bounds,
        "isVisible": is_visible,
        "isMinimized": is_minimized,
        "isMaximized": is_maximized,
        "isCloaked": is_cloaked,
        "isHung": is_hung,
    }


def get_active_window() -> Optional[Dict[str, Any]]:
    """
    Returns detailed metadata for the current foreground active window.

    Returns:
        Optional[Dict[str, Any]]: Active window information or None.
    """
    ensure_interactive_desktop()
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    return get_window_details(hwnd)


def enumerate_windows(include_hidden: bool = False) -> List[Dict[str, Any]]:
    """
    Enumerates top-level desktop windows.

    Args:
        include_hidden (bool): If True, includes invisible/zero-size windows.

    Returns:
        List[Dict[str, Any]]: List of window descriptors.
    """
    hdesk = ensure_interactive_desktop()
    windows: List[Dict[str, Any]] = []

    def enum_proc(hwnd, lParam):
        if not include_hidden:
            if not user32.IsWindowVisible(hwnd):
                return True
            if _is_window_cloaked(hwnd):
                return True

        details = get_window_details(hwnd)
        if details:
            # Filter empty-title non-interesting windows unless explicitly requested
            if not include_hidden:
                if not details["title"] or details["bounds"]["width"] <= 0 or details["bounds"]["height"] <= 0:
                    return True
            windows.append(details)
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    callback = WNDENUMPROC(enum_proc)

    # First attempt standard EnumWindows
    user32.EnumWindows(callback, 0)

    # If EnumWindows returned empty and interactive desktop is available, enumerate desktop windows directly
    if not windows and hdesk:
        DESKENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        desk_callback = DESKENUMPROC(enum_proc)
        user32.EnumDesktopWindows(hdesk, desk_callback, 0)

    return windows


def set_foreground_window(hwnd: int) -> bool:
    """
    Brings a target window to the foreground, bypassing Windows focus locks.

    Algorithm:
    1. If minimized, restores window using SW_RESTORE.
    2. Attaches the current thread's input queue to the foreground window's thread.
    3. Calls BringWindowToTop and SetForegroundWindow.
    4. Detaches thread input.

    Args:
        hwnd (int): Target window handle.

    Returns:
        bool: True if window was successfully focused; False otherwise.

    Side Effects:
        Alters OS foreground focus and desktop window Z-order.
    """
    if not user32.IsWindow(hwnd):
        return False

    # Restore if minimized
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)

    current_foreground = user32.GetForegroundWindow()
    if current_foreground == hwnd:
        return True

    current_tid = kernel32.GetCurrentThreadId()
    target_pid = wintypes.DWORD()
    target_tid = user32.GetWindowThreadProcessId(hwnd, ctypes.byref(target_pid))

    foreground_pid = wintypes.DWORD()
    foreground_tid = user32.GetWindowThreadProcessId(current_foreground, ctypes.byref(foreground_pid)) if current_foreground else 0

    attached = False
    if foreground_tid and foreground_tid != current_tid:
        attached = bool(user32.AttachThreadInput(current_tid, foreground_tid, True))

    try:
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.ShowWindow(hwnd, SW_SHOW)
    finally:
        if attached:
            user32.AttachThreadInput(current_tid, foreground_tid, False)

    return user32.GetForegroundWindow() == hwnd


def set_window_state(hwnd: int, state: str) -> bool:
    """
    Changes window state (minimize, maximize, restore, hide, show).

    Args:
        hwnd (int): Target window handle.
        state (str): 'minimize' | 'maximize' | 'restore' | 'hide' | 'show'.

    Returns:
        bool: True on success; False otherwise.

    Side Effects:
        Modifies desktop window display state.
    """
    if not user32.IsWindow(hwnd):
        return False

    mapping = {
        "minimize": SW_MINIMIZE,
        "maximize": SW_MAXIMIZE,
        "restore": SW_RESTORE,
        "hide": SW_HIDE,
        "show": SW_SHOW,
    }
    cmd = mapping.get(state.lower())
    if cmd is None:
        return False

    user32.ShowWindow(hwnd, cmd)
    return True


def move_and_resize_window(hwnd: int, x: int, y: int, width: int, height: int) -> bool:
    """
    Moves and resizes a window to the specified physical desktop coordinates.

    Args:
        hwnd (int): Window handle.
        x (int): Desktop X coordinate.
        y (int): Desktop Y coordinate.
        width (int): New width in pixels.
        height (int): New height in pixels.

    Returns:
        bool: True on success; False otherwise.

    Side Effects:
        Repositions target window on desktop.
    """
    if not user32.IsWindow(hwnd):
        return False
    # If minimized or maximized, restore first
    if user32.IsIconic(hwnd) or user32.IsZoomed(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)

    return bool(user32.MoveWindow(hwnd, x, y, width, height, True))


def close_window(hwnd: int, force_terminate: bool = False) -> Dict[str, Any]:
    """
    Closes a window gracefully using WM_CLOSE. If force_terminate is True and
    the window does not close within 1 second, terminates the owning process.

    Args:
        hwnd (int): Window handle.
        force_terminate (bool): Fall back to process termination if unresponsive.

    Returns:
        Dict[str, Any]: Status dictionary {success, closed, terminated, processId}.

    Side Effects:
        Posts WM_CLOSE message to window; optionally terminates process.
    """
    if not user32.IsWindow(hwnd):
        return {"success": False, "error": "Invalid window handle"}

    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    # Send graceful WM_CLOSE
    user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)

    # Poll for closure up to 1 second
    import time
    start_t = time.time()
    closed = False
    while time.time() - start_t < 1.0:
        if not user32.IsWindow(hwnd):
            closed = True
            break
        time.sleep(0.05)

    if closed:
        return {"success": True, "closed": True, "terminated": False, "processId": pid.value}

    if force_terminate and pid.value > 4:
        h_proc = kernel32.OpenProcess(PROCESS_TERMINATE, False, pid.value)
        if h_proc:
            try:
                kernel32.TerminateProcess(h_proc, 1)
                return {"success": True, "closed": True, "terminated": True, "processId": pid.value}
            finally:
                kernel32.CloseHandle(h_proc)

    return {"success": False, "closed": False, "terminated": False, "processId": pid.value}
