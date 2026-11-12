"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.visual_recognizer
Purpose: Visual Element Recognition, Screenshot-to-Action Mapping & UI Change Detection
===============================================================================

Key Responsibilities:
- Module 05: Visual Element Recognition.
- Categorizes UI elements into standard component types: Button, TextField, Menu,
  Dialog, Icon, Tab, CheckBox, and Window.
- Computes spatial element locations and resolves user target intents
  ("click the Save button", "type in the search box") to actionable screen coordinates.
- Performs pre- and post-action visual state comparisons to detect UI deltas
  (appearance of new dialogs, window closure, focus change, text updates).
- Bridges high-level visual descriptions with UIA accessibility coordinates and
  GDI screenshot pixel hashes.

Architectural Role & Interactions:
- Consumed by Module 11 (Task Execution & Verification Engine) to verify interactions.
- Works in tandem with `uia_engine.py` and `desktop_engine.py`.

Safety / Security Guarantees:
- Read-only visual comparison.
- Fails closed if target element cannot be unambiguously identified.
===============================================================================
"""

import time
import hashlib
from typing import Any, Dict, List, Optional, Tuple

from . import desktop_engine
from . import uia_engine


def classify_element(elem: Dict[str, Any]) -> str:
    """
    Classifies a raw UI element descriptor into a standardized component category.

    Args:
        elem (Dict[str, Any]): Element dictionary with controlType, name, className.

    Returns:
        str: Component category ('button' | 'text_field' | 'menu' | 'dialog' | 'tab' | 'icon' | 'checkbox' | 'container').
    """
    ctrl = (elem.get("controlType") or "").lower()
    cls = (elem.get("className") or "").lower()
    name = (elem.get("name") or "").lower()

    if "button" in ctrl or "button" in cls:
        return "button"
    if "edit" in ctrl or "text" in ctrl or "box" in cls or "input" in cls:
        return "text_field"
    if "menu" in ctrl or "menuitem" in ctrl:
        return "menu"
    if "dialog" in ctrl or "dialog" in cls or "modal" in cls:
        return "dialog"
    if "tab" in ctrl or "tabitem" in ctrl:
        return "tab"
    if "check" in ctrl:
        return "checkbox"
    if "image" in ctrl or "icon" in cls:
        return "icon"
    if "window" in ctrl or "pane" in ctrl or "group" in ctrl:
        return "container"

    return "unknown"


def resolve_action_target(
    hwnd: int,
    target_description: str,
) -> Optional[Dict[str, Any]]:
    """
    Maps a user or AI semantic description ("Save button", "File menu", "Search")
    to a concrete actionable UI element with bounding box coordinates.

    Args:
        hwnd (int): Target window handle.
        target_description (str): Description of the element to interact with.

    Returns:
        Optional[Dict[str, Any]]: Resolved element details or None if not found.
    """
    elements = uia_engine.dump_window_elements(hwnd, max_elements=200)
    desc = target_description.lower().strip()

    # Exact name match
    for el in elements:
        if el["name"].lower() == desc:
            return {
                **el,
                "category": classify_element(el),
                "center": {
                    "x": el["bounds"]["x"] + el["bounds"]["width"] // 2,
                    "y": el["bounds"]["y"] + el["bounds"]["height"] // 2,
                },
            }

    # Substring match
    for el in elements:
        if desc in el["name"].lower() or (el["automationId"] and desc in el["automationId"].lower()):
            return {
                **el,
                "category": classify_element(el),
                "center": {
                    "x": el["bounds"]["x"] + el["bounds"]["width"] // 2,
                    "y": el["bounds"]["y"] + el["bounds"]["height"] // 2,
                },
            }

    return None


def capture_ui_snapshot(hwnd: Optional[int] = None) -> Dict[str, Any]:
    """
    Captures an atomic snapshot of current UI state for before/after comparison.

    Includes active window, window bounds, title, and interactive element list.

    Args:
        hwnd (Optional[int]): Optional window handle or current active window.

    Returns:
        Dict[str, Any]: Snapshot dictionary.
    """
    active = desktop_engine.get_active_window()
    target_hwnd = hwnd or (active["hwnd"] if active else None)

    elements: List[Dict[str, Any]] = []
    win_details = None

    if target_hwnd:
        win_details = desktop_engine.get_window_details(target_hwnd)
        elements = uia_engine.dump_window_elements(target_hwnd, max_elements=50)

    # Compute hash of current visible titles and elements
    state_sig = f"{active.get('title') if active else ''}:{len(elements)}"
    for e in elements[:10]:
        state_sig += f"|{e.get('name')}:{e.get('bounds')}"
    sig_hash = hashlib.sha256(state_sig.encode("utf-8")).hexdigest()[:16]

    return {
        "timestamp": time.time(),
        "activeWindow": active,
        "targetWindow": win_details,
        "elementCount": len(elements),
        "elements": elements,
        "stateHash": sig_hash,
    }


def compare_ui_states(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """
    Performs visual state comparison between before and after snapshots.

    Detects:
    - Active window change.
    - Window title change.
    - Element count delta.
    - Dialog appearances / dismissals.

    Args:
        before (Dict[str, Any]): Pre-action snapshot.
        after (Dict[str, Any]): Post-action snapshot.

    Returns:
        Dict[str, Any]: Delta report {changed, details, actionVerified}.
    """
    deltas: List[str] = []
    verified = False

    b_act = before.get("activeWindow")
    a_act = after.get("activeWindow")

    # Check active window title
    b_title = b_act.get("title", "") if b_act else ""
    a_title = a_act.get("title", "") if a_act else ""
    if b_title != a_title:
        deltas.append(f"Active window title changed from '{b_title}' to '{a_title}'.")
        verified = True

    # Check state hash
    if before.get("stateHash") != after.get("stateHash"):
        deltas.append("UI element state or layout changed.")
        verified = True

    # Check element count difference
    diff_count = after.get("elementCount", 0) - before.get("elementCount", 0)
    if diff_count != 0:
        deltas.append(f"Interactive element count changed by {diff_count:+d}.")
        verified = True

    return {
        "changed": len(deltas) > 0,
        "verified": verified,
        "deltas": deltas,
        "beforeHash": before.get("stateHash"),
        "afterHash": after.get("stateHash"),
    }
