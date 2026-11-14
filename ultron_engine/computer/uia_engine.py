"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.uia_engine
Purpose: Native Windows UI Automation (UIA) & Semantic Accessibility Interaction
===============================================================================

Key Responsibilities:
- Module 04 & 05: Semantic UI Automation & Accessibility Selectors.
- Interfaces with Windows UIAutomationCore via COM (`comtypes.client`) with zero
  third-party UI test harness bloat.
- Traverses accessibility trees of active desktop windows to discover interactive
  controls (buttons, text edit boxes, menus, combo boxes, tabs, list items).
- Implements semantic pattern interactions:
  1. `IUIAutomationInvokePattern`: Direct click/invoke without coordinate fragility.
  2. `IUIAutomationValuePattern`: Direct programmatic text setting.
  3. `IUIAutomationTogglePattern` & `SelectionItemPattern`: State switching.
- Exposes semantic window element dumps with physical bounding boxes for visual verification.
- Enforces strict priority hierarchy:
  1. Semantic UI Automation Pattern.
  2. Accessibility bounding-box center click.
  3. Coordinate-based interaction as fallback.

Architectural Role & Interactions:
- Powers Module 04 (Accessibility-based element interaction) and Module 05.
- Interacts with `input_driver.py` for coordinate fallback and `desktop_engine.py`.

Safety / Security Guarantees:
- Read-only tree inspection by default.
- Fail-safe fallback if UIA COM call is blocked by UIPI or elevated privileges.
===============================================================================
"""

import time
import ctypes
from ctypes import wintypes
from typing import Any, Dict, List, Optional, Tuple

try:
    import comtypes
    import comtypes.client
    COMTYPES_AVAILABLE = True
except ImportError:
    comtypes = None
    COMTYPES_AVAILABLE = False

from . import desktop_engine
from . import input_driver

# Control Type IDs in UIAutomation
CONTROL_TYPE_NAMES = {
    50000: "Button",
    50001: "Calendar",
    50002: "CheckBox",
    50003: "ComboBox",
    50004: "Edit",
    50005: "Hyperlink",
    50006: "Image",
    50007: "ListItem",
    50008: "List",
    50009: "Menu",
    50010: "MenuBar",
    50011: "MenuItem",
    50012: "ProgressBar",
    50013: "RadioButton",
    50014: "ScrollBar",
    50015: "Slider",
    50016: "Spinner",
    50017: "StatusBar",
    50018: "Tab",
    50019: "TabItem",
    50020: "Text",
    50021: "ToolBar",
    50022: "ToolTip",
    50023: "Tree",
    50024: "TreeItem",
    50025: "Custom",
    50026: "Group",
    50027: "Thumb",
    50028: "DataGrid",
    50029: "DataItem",
    50030: "Document",
    50031: "SplitButton",
    50032: "Window",
    50033: "Pane",
    50034: "Header",
    50035: "HeaderItem",
    50036: "Table",
    50037: "TitleBar",
    50038: "Separator",
    50039: "SemanticZoom",
    50040: "AppBar",
}

CONTROL_TYPE_IDS = {v.lower(): k for k, v in CONTROL_TYPE_NAMES.items()}

# Pattern IDs
UIA_InvokePatternId = 10000
UIA_SelectionPatternId = 10001
UIA_ValuePatternId = 10002
UIA_RangeValuePatternId = 10003
UIA_ScrollPatternId = 10004
UIA_ExpandCollapsePatternId = 10005
UIA_GridPatternId = 10006
UIA_GridItemPatternId = 10007
UIA_MultipleViewPatternId = 10008
UIA_WindowPatternId = 10009
UIA_SelectionItemPatternId = 10010
UIA_DockPatternId = 10011
UIA_TablePatternId = 10012
UIA_TableItemPatternId = 10013
UIA_TextPatternId = 10014
UIA_TogglePatternId = 10015
UIA_TransformPatternId = 10016
UIA_ScrollItemPatternId = 10017

# TreeScope constants
TreeScope_Element = 0x1
TreeScope_Children = 0x2
TreeScope_Descendants = 0x4
TreeScope_Subtree = 0x7

_uia_module = None
_uia_instance = None


def get_uia() -> Any:
    """
    Initializes and returns the shared CUIAutomation COM singleton instance.

    Returns:
        IUIAutomation: COM interface pointer.
    """
    global _uia_module, _uia_instance
    if not COMTYPES_AVAILABLE:
        raise RuntimeError("Windows UI Automation requires 'comtypes' package. Please install with: pip install comtypes")
    if _uia_instance is None:
        comtypes.CoInitialize()
        _uia_module = comtypes.client.GetModule("UIAutomationCore.dll")
        _uia_instance = comtypes.client.CreateObject(
            _uia_module.CUIAutomation,
            interface=_uia_module.IUIAutomation,
        )
    return _uia_instance


def _extract_element_bounds(elem: Any) -> Optional[Dict[str, int]]:
    """Retrieves bounding box of a UIA element as {x, y, width, height}."""
    try:
        rect = elem.CurrentBoundingRectangle
        w = max(0, rect.right - rect.left)
        h = max(0, rect.bottom - rect.top)
        return {"x": rect.left, "y": rect.top, "width": w, "height": h}
    except Exception:
        return None


def _format_element(elem: Any) -> Optional[Dict[str, Any]]:
    """Converts a UIA COM element into a plain dictionary."""
    try:
        name = elem.CurrentName or ""
        ctrl_id = elem.CurrentControlType
        ctrl_type = CONTROL_TYPE_NAMES.get(ctrl_id, f"Type_{ctrl_id}")
        auto_id = elem.CurrentAutomationId or ""
        class_name = elem.CurrentClassName or ""
        is_enabled = bool(elem.CurrentIsEnabled)
        is_offscreen = bool(elem.CurrentIsOffscreen)
        bounds = _extract_element_bounds(elem)

        return {
            "name": name,
            "controlType": ctrl_type,
            "controlTypeId": ctrl_id,
            "automationId": auto_id,
            "className": class_name,
            "isEnabled": is_enabled,
            "isOffscreen": is_offscreen,
            "bounds": bounds,
        }
    except Exception:
        return None


def dump_window_elements(hwnd: int, max_elements: int = 100) -> List[Dict[str, Any]]:
    """
    Dumps all interactable UI elements for a target window handle.

    Args:
        hwnd (int): Win32 window handle.
        max_elements (int): Safety bound on returned element count.

    Returns:
        List[Dict[str, Any]]: List of element descriptors.
    """
    uia = get_uia()
    desktop_engine.ensure_interactive_desktop()

    try:
        root = uia.ElementFromHandle(hwnd)
        if not root:
            return []
    except Exception:
        return []

    # Filter to interactive control types
    condition = uia.CreateTrueCondition()
    elements: List[Dict[str, Any]] = []

    try:
        found_arr = root.FindAll(TreeScope_Descendants, condition)
        if not found_arr:
            return []

        count = min(found_arr.Length, max_elements)
        for i in range(count):
            try:
                el = found_arr.GetElement(i)
                data = _format_element(el)
                if data and not data["isOffscreen"] and data["bounds"] and data["bounds"]["width"] > 0:
                    # Filter out meaningless blank panes unless named
                    if data["name"] or data["automationId"] or data["controlType"] in ("Button", "Edit", "MenuItem", "TabItem"):
                        elements.append(data)
            except Exception:
                continue
    except Exception:
        pass

    return elements


def find_element(
    hwnd: int,
    name: Optional[str] = None,
    control_type: Optional[str] = None,
    automation_id: Optional[str] = None,
) -> Tuple[Optional[Any], Optional[Dict[str, Any]]]:
    """
    Finds a specific UIA COM element matching criteria in a window.

    Args:
        hwnd (int): Window handle.
        name (Optional[str]): Expected element name / label.
        control_type (Optional[str]): Expected control type (Button, Edit, etc.).
        automation_id (Optional[str]): Automation ID string.

    Returns:
        Tuple[Optional[Any], Optional[Dict[str, Any]]]: (COM element pointer, dictionary metadata).
    """
    uia = get_uia()
    desktop_engine.ensure_interactive_desktop()

    try:
        root = uia.ElementFromHandle(hwnd)
        if not root:
            return (None, None)
    except Exception:
        return (None, None)

    conditions = []
    if name:
        # Property ID 30005 = UIA_NamePropertyId
        c_name = uia.CreatePropertyCondition(30005, name)
        conditions.append(c_name)
    if automation_id:
        # Property ID 30011 = UIA_AutomationIdPropertyId
        c_aid = uia.CreatePropertyCondition(30011, automation_id)
        conditions.append(c_aid)
    if control_type:
        c_type_id = CONTROL_TYPE_IDS.get(control_type.lower())
        if c_type_id:
            # Property ID 30003 = UIA_ControlTypePropertyId
            c_ct = uia.CreatePropertyCondition(30003, c_type_id)
            conditions.append(c_ct)

    if not conditions:
        cond = uia.CreateTrueCondition()
    elif len(conditions) == 1:
        cond = conditions[0]
    else:
        # Combine conditions with AND
        cond = uia.CreateAndCondition(conditions[0], conditions[1])
        for c in conditions[2:]:
            cond = uia.CreateAndCondition(cond, c)

    try:
        found = root.FindFirst(TreeScope_Descendants, cond)
        if found:
            return (found, _format_element(found))
    except Exception:
        pass

    # Substring / fuzzy fallback by dumping elements and matching
    all_elems = root.FindAll(TreeScope_Descendants, uia.CreateTrueCondition())
    if all_elems:
        target_name = (name or "").lower().strip()
        for i in range(all_elems.Length):
            try:
                el = all_elems.GetElement(i)
                el_name = (el.CurrentName or "").lower().strip()
                el_aid = (el.CurrentAutomationId or "").lower().strip()
                if (target_name and target_name in el_name) or (automation_id and automation_id.lower() in el_aid):
                    return (el, _format_element(el))
            except Exception:
                continue

    return (None, None)


def semantic_interact(
    hwnd: int,
    selector: Dict[str, Any],
    action: str = "click",
    value: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Performs interaction following the strict priority hierarchy:
    1. Semantic UI Automation pattern (InvokePattern, ValuePattern, TogglePattern).
    2. Element bounding box center click via input_driver.
    3. Coordinate fallback.

    Args:
        hwnd (int): Window handle.
        selector (Dict[str, Any]): {name, controlType, automationId, fallbackCoordinates}.
        action (str): 'click' | 'set_value' | 'type' | 'focus'.
        value (Optional[str]): Text value if typing or setting value.

    Returns:
        Dict[str, Any]: {success, methodUsed, element, message}.

    Side Effects:
        Dispatches UI automation calls or simulated hardware input events.
    """
    global _uia_module
    uia = get_uia()
    mod = _uia_module

    # Activate target window first
    desktop_engine.set_foreground_window(hwnd)
    time.sleep(0.05)

    name = selector.get("name")
    ctrl_type = selector.get("controlType")
    auto_id = selector.get("automationId")

    el, el_data = find_element(hwnd, name=name, control_type=ctrl_type, automation_id=auto_id)

    # 1. SEMANTIC UI AUTOMATION
    if el is not None:
        act = action.lower()
        if act in ("click", "invoke"):
            # Try InvokePattern
            try:
                pat = el.GetCurrentPattern(UIA_InvokePatternId)
                if pat:
                    invoker = pat.QueryInterface(mod.IUIAutomationInvokePattern)
                    invoker.Invoke()
                    return {
                        "success": True,
                        "methodUsed": "semantic_invoke_pattern",
                        "element": el_data,
                        "message": f"Invoked element '{el_data.get('name')}' via UIA pattern.",
                    }
            except Exception:
                pass

            # Try TogglePattern (for checkboxes/switches)
            try:
                pat = el.GetCurrentPattern(UIA_TogglePatternId)
                if pat:
                    toggler = pat.QueryInterface(mod.IUIAutomationTogglePattern)
                    toggler.Toggle()
                    return {
                        "success": True,
                        "methodUsed": "semantic_toggle_pattern",
                        "element": el_data,
                        "message": f"Toggled element '{el_data.get('name')}' via UIA pattern.",
                    }
            except Exception:
                pass

            # 2. ACCESSIBILITY SELECTOR BOUNDING-BOX CENTER CLICK
            if el_data and el_data.get("bounds"):
                b = el_data["bounds"]
                cx = b["x"] + b["width"] // 2
                cy = b["y"] + b["height"] // 2
                input_driver.mouse_click(cx, cy, button="left")
                return {
                    "success": True,
                    "methodUsed": "accessibility_bounds_center_click",
                    "element": el_data,
                    "coordinates": {"x": cx, "y": cy},
                    "message": f"Clicked center of element '{el_data.get('name')}' at ({cx}, {cy}).",
                }

        elif act in ("set_value", "type"):
            val_str = value or ""
            # Try ValuePattern
            try:
                pat = el.GetCurrentPattern(UIA_ValuePatternId)
                if pat:
                    val_pat = pat.QueryInterface(mod.IUIAutomationValuePattern)
                    val_pat.SetValue(val_str)
                    return {
                        "success": True,
                        "methodUsed": "semantic_value_pattern",
                        "element": el_data,
                        "value": val_str,
                        "message": f"Set value of element '{el_data.get('name')}' via UIA ValuePattern.",
                    }
            except Exception:
                pass

            # Fallback: Focus element and type via input_driver
            try:
                el.SetFocus()
                time.sleep(0.05)
                input_driver.type_text(val_str)
                return {
                    "success": True,
                    "methodUsed": "accessibility_focus_and_type",
                    "element": el_data,
                    "value": val_str,
                    "message": f"Focused element '{el_data.get('name')}' and typed text.",
                }
            except Exception:
                pass

    # 3. COORDINATE-BASED INTERACTION AS FALLBACK
    fb = selector.get("fallbackCoordinates")
    if fb and "x" in fb and "y" in fb:
        cx, cy = int(fb["x"]), int(fb["y"])
        if action.lower() in ("click", "invoke"):
            input_driver.mouse_click(cx, cy, button="left")
            return {
                "success": True,
                "methodUsed": "coordinate_fallback_click",
                "coordinates": {"x": cx, "y": cy},
                "message": f"Clicked fallback coordinate ({cx}, {cy}).",
            }
        elif action.lower() in ("set_value", "type"):
            input_driver.mouse_click(cx, cy, button="left")
            time.sleep(0.05)
            input_driver.type_text(value or "")
            return {
                "success": True,
                "methodUsed": "coordinate_fallback_type",
                "coordinates": {"x": cx, "y": cy},
                "value": value,
                "message": f"Clicked coordinate ({cx}, {cy}) and typed text.",
            }

    return {
        "success": False,
        "error": f"Element matching selector {selector} not found and no valid fallback coordinates provided.",
    }
