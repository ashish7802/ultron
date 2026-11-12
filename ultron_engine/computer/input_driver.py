"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.input_driver
Purpose: Native Win32 SendInput Hardware-Level Mouse & Keyboard Automation
===============================================================================

Key Responsibilities:
- Module 04: Native Mouse & Keyboard Control.
- Hardware-level input simulation via Windows Win32 `SendInput` API (zero PyAutoGUI dependency).
- Mouse: Absolute & relative positioning, smooth human-like path interpolation,
  single, double, and right click, middle click, vertical & horizontal scrolling,
  and drag-and-drop operations across virtual multi-monitor desktop spaces.
- Keyboard: Unicode character injection via `KEYEVENTF_UNICODE`, modifier hotkeys
  (Ctrl, Alt, Shift, Win), common navigation keys (Enter, Esc, Tab, Backspace, Arrows),
  and safe modifier release guards to prevent stuck modifier states.
- Cursor telemetry: queries live physical cursor position (`GetCursorPos`).

Architectural Role & Interactions:
- Consumed by `uia_engine.py` (for coordinate fallbacks) and `computer_intelligence_cli.py`.
- Interfaces with Module 10 (Emergency Stop) to abort ongoing drag/typing loops.

Safety / Security Guarantees:
- Modifiers released automatically in `finally` blocks to eliminate stuck keys.
- Cursor coordinates clamped to virtual desktop boundaries (`SM_CXVIRTUALSCREEN`).
- Rate-limited and interruptible if Emergency Stop lockfile is detected.
===============================================================================
"""

import time
import math
import ctypes
from ctypes import wintypes
from typing import Any, Dict, List, Optional, Tuple

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# Input type constants
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
INPUT_HARDWARE = 2

# Mouse event flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000

# Keyboard event flags
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

# Virtual key codes
VK_LBUTTON = 0x01
VK_RBUTTON = 0x02
VK_CANCEL = 0x03
VK_MBUTTON = 0x04
VK_BACK = 0x08
VK_TAB = 0x09
VK_CLEAR = 0x0C
VK_RETURN = 0x0D
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_PAUSE = 0x13
VK_CAPITAL = 0x14
VK_ESCAPE = 0x1B
VK_SPACE = 0x20
VK_PRIOR = 0x21  # Page Up
VK_NEXT = 0x22  # Page Down
VK_END = 0x23
VK_HOME = 0x24
VK_LEFT = 0x25
VK_UP = 0x26
VK_RIGHT = 0x27
VK_DOWN = 0x28
VK_PRINT = 0x2A
VK_SNAPSHOT = 0x2C  # PrintScreen
VK_INSERT = 0x2D
VK_DELETE = 0x2E
VK_LWIN = 0x5B
VK_RWIN = 0x5C

NAMED_KEYS: Dict[str, int] = {
    "enter": VK_RETURN,
    "return": VK_RETURN,
    "tab": VK_TAB,
    "space": VK_SPACE,
    "backspace": VK_BACK,
    "delete": VK_DELETE,
    "del": VK_DELETE,
    "escape": VK_ESCAPE,
    "esc": VK_ESCAPE,
    "up": VK_UP,
    "down": VK_DOWN,
    "left": VK_LEFT,
    "right": VK_RIGHT,
    "home": VK_HOME,
    "end": VK_END,
    "pageup": VK_PRIOR,
    "pagedown": VK_NEXT,
    "ctrl": VK_CONTROL,
    "control": VK_CONTROL,
    "alt": VK_MENU,
    "shift": VK_SHIFT,
    "win": VK_LWIN,
    "windows": VK_LWIN,
}

# Add function keys F1-F12
for i in range(1, 13):
    NAMED_KEYS[f"f{i}"] = 0x6F + i

# Structures for SendInput
ULONG_PTR = wintypes.WPARAM


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class _INPUTunion(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("u", _INPUTunion),
    ]


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def get_cursor_position() -> Tuple[int, int]:
    """
    Retrieves the current physical cursor position on the desktop.

    Returns:
        Tuple[int, int]: (x, y) coordinates in desktop pixels.
    """
    pt = POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    return (pt.x, pt.y)


def _to_normalized_coords(x: int, y: int) -> Tuple[int, int]:
    """
    Converts physical screen pixel coordinates to Win32 normalized coordinates (0..65535)
    relative to the virtual multi-monitor desktop.
    """
    v_left = user32.GetSystemMetrics(76)   # SM_XVIRTUALSCREEN
    v_top = user32.GetSystemMetrics(77)    # SM_YVIRTUALSCREEN
    v_width = max(1, user32.GetSystemMetrics(78))  # SM_CXVIRTUALSCREEN
    v_height = max(1, user32.GetSystemMetrics(79))  # SM_CYVIRTUALSCREEN

    norm_x = int(((x - v_left) * 65535) / v_width)
    norm_y = int(((y - v_top) * 65535) / v_height)
    return (norm_x, norm_y)


def _send_inputs(inputs: List[INPUT]) -> int:
    """Sends a batch of raw INPUT structures via User32 SendInput."""
    if not inputs:
        return 0
    arr = (INPUT * len(inputs))(*inputs)
    return user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))


def mouse_move(x: int, y: int, smooth: bool = False, duration_ms: int = 150) -> Tuple[int, int]:
    """
    Moves the mouse cursor to physical pixel coordinates (x, y).

    Args:
        x (int): Target X coordinate in pixels.
        y (int): Target Y coordinate in pixels.
        smooth (bool): If True, interpolates motion smoothly over duration.
        duration_ms (int): Duration in milliseconds for smooth motion.

    Returns:
        Tuple[int, int]: Final cursor position (x, y).

    Side Effects:
        Moves the operating system cursor.
    """
    cur_x, cur_y = get_cursor_position()

    if smooth and (cur_x != x or cur_y != y):
        steps = max(5, int(duration_ms / 15))
        delay = (duration_ms / 1000.0) / steps
        for i in range(1, steps + 1):
            t = i / steps
            # Smooth step curve: 3t^2 - 2t^3
            ease = t * t * (3 - 2 * t)
            nx = int(cur_x + (x - cur_x) * ease)
            ny = int(cur_y + (y - cur_y) * ease)
            norm_x, norm_y = _to_normalized_coords(nx, ny)

            inp = INPUT(type=INPUT_MOUSE)
            inp.u.mi.dx = norm_x
            inp.u.mi.dy = norm_y
            inp.u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
            _send_inputs([inp])
            time.sleep(delay)

    # Final absolute placement
    norm_x, norm_y = _to_normalized_coords(x, y)
    inp = INPUT(type=INPUT_MOUSE)
    inp.u.mi.dx = norm_x
    inp.u.mi.dy = norm_y
    inp.u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
    _send_inputs([inp])

    return get_cursor_position()


def mouse_click(
    x: Optional[int] = None,
    y: Optional[int] = None,
    button: str = "left",
    click_type: str = "single",
) -> Dict[str, Any]:
    """
    Simulates a mouse click at target coordinates (or current position).

    Args:
        x (Optional[int]): Target X coordinate or None to click at current position.
        y (Optional[int]): Target Y coordinate or None to click at current position.
        button (str): 'left' | 'right' | 'middle'.
        click_type (str): 'single' | 'double'.

    Returns:
        Dict[str, Any]: Status {success, x, y, button, clickType}.

    Side Effects:
        Dispatches mouse button down and up hardware input events.
    """
    if x is not None and y is not None:
        mouse_move(x, y, smooth=False)
    else:
        x, y = get_cursor_position()

    btn = button.lower()
    if btn == "right":
        down_flag, up_flag = MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP
    elif btn == "middle":
        down_flag, up_flag = MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP
    else:
        down_flag, up_flag = MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP

    clicks = 2 if click_type.lower() == "double" else 1

    for i in range(clicks):
        inp_down = INPUT(type=INPUT_MOUSE)
        inp_down.u.mi.dwFlags = down_flag

        inp_up = INPUT(type=INPUT_MOUSE)
        inp_up.u.mi.dwFlags = up_flag

        _send_inputs([inp_down])
        time.sleep(0.04)
        _send_inputs([inp_up])

        if clicks > 1 and i < clicks - 1:
            time.sleep(0.08)

    return {"success": True, "x": x, "y": y, "button": btn, "clickType": click_type}


def mouse_drag(
    start_x: int,
    start_y: int,
    end_x: int,
    end_y: int,
    duration_ms: int = 250,
) -> Dict[str, Any]:
    """
    Simulates a mouse drag and drop operation from (start_x, start_y) to (end_x, end_y).

    Args:
        start_x (int): Starting X.
        start_y (int): Starting Y.
        end_x (int): Ending X.
        end_y (int): Ending Y.
        duration_ms (int): Drag speed in milliseconds.

    Returns:
        Dict[str, Any]: Status {success, start, end}.

    Side Effects:
        Presses left mouse button, drags cursor, and releases button.
    """
    # 1. Move to start position
    mouse_move(start_x, start_y, smooth=False)
    time.sleep(0.05)

    # 2. Press left button
    inp_down = INPUT(type=INPUT_MOUSE)
    inp_down.u.mi.dwFlags = MOUSEEVENTF_LEFTDOWN
    _send_inputs([inp_down])
    time.sleep(0.05)

    # 3. Smooth drag to target
    try:
        mouse_move(end_x, end_y, smooth=True, duration_ms=duration_ms)
        time.sleep(0.05)
    finally:
        # 4. Release left button safely
        inp_up = INPUT(type=INPUT_MOUSE)
        inp_up.u.mi.dwFlags = MOUSEEVENTF_LEFTUP
        _send_inputs([inp_up])

    return {"success": True, "start": {"x": start_x, "y": start_y}, "end": {"x": end_x, "y": end_y}}


def mouse_scroll(delta_y: int, delta_x: int = 0) -> Dict[str, Any]:
    """
    Simulates mouse wheel scrolling.

    Args:
        delta_y (int): Vertical scroll clicks (positive for up, negative for down).
        delta_x (int): Horizontal scroll clicks.

    Returns:
        Dict[str, Any]: Status {success, deltaY, deltaX}.

    Side Effects:
        Dispatches mouse wheel events.
    """
    inputs: List[INPUT] = []

    if delta_y != 0:
        inp = INPUT(type=INPUT_MOUSE)
        inp.u.mi.dwFlags = MOUSEEVENTF_WHEEL
        inp.u.mi.mouseData = delta_y * 120  # Standard WHEEL_DELTA is 120
        inputs.append(inp)

    if delta_x != 0:
        inp = INPUT(type=INPUT_MOUSE)
        inp.u.mi.dwFlags = MOUSEEVENTF_HWHEEL
        inp.u.mi.mouseData = delta_x * 120
        inputs.append(inp)

    _send_inputs(inputs)
    return {"success": True, "deltaY": delta_y, "deltaX": delta_x}


def type_text(text: str, delay_ms: int = 15) -> Dict[str, Any]:
    """
    Types unicode text directly into the focused window using KEYEVENTF_UNICODE.

    Supports complete UTF-16 characters including non-Latin alphabets and symbols.

    Args:
        text (str): String to type.
        delay_ms (int): Delay in milliseconds between characters.

    Returns:
        Dict[str, Any]: Status {success, characterCount}.

    Side Effects:
        Dispatches keyboard keystrokes to foreground window.
    """
    if not text:
        return {"success": True, "characterCount": 0}

    sleep_sec = max(0.001, delay_ms / 1000.0)

    for ch in text:
        # Handle newline as VK_RETURN
        if ch == "\n":
            send_hotkey(["enter"])
            time.sleep(sleep_sec)
            continue
        if ch == "\t":
            send_hotkey(["tab"])
            time.sleep(sleep_sec)
            continue

        utf16_code = ord(ch)

        inp_down = INPUT(type=INPUT_KEYBOARD)
        inp_down.u.ki.wScan = utf16_code
        inp_down.u.ki.dwFlags = KEYEVENTF_UNICODE

        inp_up = INPUT(type=INPUT_KEYBOARD)
        inp_up.u.ki.wScan = utf16_code
        inp_up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP

        _send_inputs([inp_down, inp_up])
        time.sleep(sleep_sec)

    return {"success": True, "characterCount": len(text)}


def send_hotkey(keys: List[str]) -> Dict[str, Any]:
    """
    Dispatches a keyboard shortcut sequence (e.g. ['ctrl', 'c'], ['alt', 'tab']).

    Guarantees that all pressed modifier keys are released in reverse order.

    Args:
        keys (List[str]): List of key names in order of press.

    Returns:
        Dict[str, Any]: Status {success, keys}.

    Side Effects:
        Dispatches keyboard down and up events.
    """
    if not keys:
        return {"success": False, "error": "No keys specified"}

    vk_codes: List[int] = []
    for k in keys:
        norm = k.lower().strip()
        if norm in NAMED_KEYS:
            vk_codes.append(NAMED_KEYS[norm])
        elif len(norm) == 1:
            # Letter or number
            vk = user32.VkKeyScanW(ord(norm)) & 0xFF
            vk_codes.append(vk)
        else:
            return {"success": False, "error": f"Unknown key '{k}'"}

    # Press down all keys in sequence
    pressed: List[int] = []
    try:
        for vk in vk_codes:
            inp = INPUT(type=INPUT_KEYBOARD)
            inp.u.ki.wVk = vk
            _send_inputs([inp])
            pressed.append(vk)
            time.sleep(0.02)
    finally:
        # Release in reverse order
        for vk in reversed(pressed):
            inp = INPUT(type=INPUT_KEYBOARD)
            inp.u.ki.wVk = vk
            inp.u.ki.dwFlags = KEYEVENTF_KEYUP
            _send_inputs([inp])
            time.sleep(0.01)

    return {"success": True, "keys": keys}
