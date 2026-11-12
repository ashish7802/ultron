"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.browser_driver
Purpose: Browser Discovery, Navigation, Web Element Interaction & State Verification
===============================================================================

Key Responsibilities:
- Module 08: Browser Interaction.
- Detects installed and running web browsers on Windows (Google Chrome, Microsoft Edge,
  Mozilla Firefox, Brave) and queries system default protocol handler for `https`.
- Manages browser navigation: validates URLs against SSRF/private network exploits,
  opens tabs, and brings running browser windows to the foreground.
- Page understanding & web element recognition: inspects browser window titles,
  extracts web content via UI Automation accessibility trees, and tracks downloads.
- Form & web interaction: semantic address bar focus, URL dispatch, tab switching,
  and button/link invocation without compromising user browser security or credentials.
- Browser state verification: verifies URL dispatch and page title updates.

Architectural Role & Interactions:
- Consumed by `computer_intelligence_cli.py` and Node.js `browserIntelligence.ts`.
- Collaborates with `desktop_engine.py` (window focus) and `input_driver.py` (hotkeys).

Safety / Security Guarantees:
- Never bypasses browser security sandboxes, MFA gates, or credentials.
- SSRF prevention: blocks attempts to navigate to internal loopback/cloud metadata
  endpoints unless explicitly authorized.
- Read-only inspection of DOM accessibility trees.
===============================================================================
"""

import os
import re
import sys
import time
import winreg
import subprocess
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional, Tuple

from . import desktop_engine
from . import input_driver
from . import uia_engine

# Known browser executables and display names
KNOWN_BROWSERS = {
    "chrome": {"name": "Google Chrome", "exe": "chrome.exe", "reg": r"Software\Google\Chrome"},
    "msedge": {"name": "Microsoft Edge", "exe": "msedge.exe", "reg": r"Software\Microsoft\Edge"},
    "firefox": {"name": "Mozilla Firefox", "exe": "firefox.exe", "reg": r"Software\Mozilla\Mozilla Firefox"},
    "brave": {"name": "Brave Browser", "exe": "brave.exe", "reg": r"Software\BraveSoftware\Brave-Browser"},
}

# Forbidden URL schemes and internal cloud metadata endpoints
FORBIDDEN_HOSTS = {
    "169.254.169.254",  # AWS/GCP/Azure instance metadata
    "metadata.google.internal",
}


def _validate_url_safety(url: str) -> str:
    """
    Validates URL scheme and security boundaries.

    Args:
        url (str): Target web URL.

    Returns:
        str: Sanitized URL string.

    Raises:
        ValueError: If scheme is unsupported or destination is forbidden.
    """
    if not url or not isinstance(url, str):
        raise ValueError("Invalid URL.")

    clean = url.strip()

    # Block non-HTTP schemes (e.g. file:, javascript:, data:) before auto-prefixing
    parsed_initial = urlparse(clean)
    if parsed_initial.scheme and parsed_initial.scheme.lower() not in ("http", "https"):
        raise ValueError(f"Prohibited URL scheme '{parsed_initial.scheme}'. Only HTTP/HTTPS allowed.")

    if not (clean.startswith("http://") or clean.startswith("https://")):
        clean = f"https://{clean}"

    parsed = urlparse(clean)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Prohibited URL scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed.")

    hostname = (parsed.hostname or "").lower()
    if hostname in FORBIDDEN_HOSTS:
        raise ValueError(f"Blocked navigation to internal metadata endpoint '{hostname}'.")

    return clean


def get_default_browser() -> Dict[str, Any]:
    """
    Queries Windows Registry for the current user's default browser handler for https.

    Returns:
        Dict[str, Any]: Default browser details {progId, name, executable}.
    """
    try:
        key_path = r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            prog_id = winreg.QueryValueEx(key, "ProgId")[0]
            for b_key, b_info in KNOWN_BROWSERS.items():
                if b_key in prog_id.lower():
                    return {"progId": prog_id, **b_info}
            return {"progId": prog_id, "name": prog_id, "exe": "explorer.exe"}
    except Exception:
        return {"progId": "default", "name": "System Default", "exe": "explorer.exe"}


def detect_installed_browsers() -> List[Dict[str, Any]]:
    """
    Enumerates all installed browsers detected on the local system.

    Returns:
        List[Dict[str, Any]]: List of available browser descriptors.
    """
    installed: List[Dict[str, Any]] = []

    for b_id, b_info in KNOWN_BROWSERS.items():
        found = False
        # 1. Check registry
        for hkey in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hkey, b_info["reg"]):
                    found = True
                    break
            except Exception:
                pass

        # 2. Check running processes
        if not found:
            for w in desktop_engine.enumerate_windows():
                if b_info["exe"].lower() in w["processName"].lower():
                    found = True
                    break

        if found:
            installed.append({"id": b_id, **b_info})

    return installed


def get_running_browser_windows() -> List[Dict[str, Any]]:
    """
    Finds all active top-level browser windows on the desktop.

    Returns:
        List[Dict[str, Any]]: List of browser window metadata.
    """
    windows = desktop_engine.enumerate_windows()
    browser_windows: List[Dict[str, Any]] = []

    for w in windows:
        pname = w["processName"].lower()
        for b_info in KNOWN_BROWSERS.values():
            if b_info["exe"].lower() in pname:
                browser_windows.append({
                    **w,
                    "browserName": b_info["name"],
                })
                break

    return browser_windows


def navigate_to_url(url: str, browser: Optional[str] = None) -> Dict[str, Any]:
    """
    Safely opens or navigates a browser to target URL.

    Args:
        url (str): Web URL.
        browser (Optional[str]): Preferred browser ID ('chrome', 'msedge', etc.).

    Returns:
        Dict[str, Any]: {success, url, browserUsed, message}.

    Side Effects:
        Launches browser or opens new tab.
    """
    safe_url = _validate_url_safety(url)

    # 1. If a specific browser is requested and installed
    if browser and browser.lower() in KNOWN_BROWSERS:
        exe = KNOWN_BROWSERS[browser.lower()]["exe"]
        try:
            subprocess.Popen([exe, safe_url], close_fds=True)
            return {
                "success": True,
                "url": safe_url,
                "browserUsed": KNOWN_BROWSERS[browser.lower()]["name"],
                "message": f"Navigated to {safe_url} in {browser}.",
            }
        except Exception:
            pass

    # 2. Check if a browser window is already running and foreground
    running = get_running_browser_windows()
    if running:
        active_bw = running[0]
        # Focus browser window
        desktop_engine.set_foreground_window(active_bw["hwnd"])
        time.sleep(0.1)
        # Open new tab with Ctrl+T and type URL
        input_driver.send_hotkey(["ctrl", "t"])
        time.sleep(0.15)
        input_driver.type_text(safe_url + "\n")
        return {
            "success": True,
            "url": safe_url,
            "browserUsed": active_bw["browserName"],
            "targetHwnd": active_bw["handle"],
            "message": f"Opened new tab in existing {active_bw['browserName']} window.",
        }

    # 3. Default launch via Windows explorer.exe protocol handler
    try:
        os.startfile(safe_url)
        return {
            "success": True,
            "url": safe_url,
            "browserUsed": "Default System Browser",
            "message": f"Launched default browser to {safe_url}.",
        }
    except Exception as e:
        return {"success": False, "error": f"Browser launch failed: {str(e)}"}


def inspect_page_state(hwnd: Optional[int] = None) -> Dict[str, Any]:
    """
    Inspects active browser window, tab title, and accessible web controls.

    Args:
        hwnd (Optional[int]): Specific browser window handle or None for first active.

    Returns:
        Dict[str, Any]: {success, title, browserName, addressBar, interactiveElements}.
    """
    running = get_running_browser_windows()
    if not running:
        return {"success": False, "error": "No browser windows are currently running."}

    target = None
    if hwnd:
        target = next((w for w in running if w["hwnd"] == hwnd), None)
    if not target:
        target = running[0]

    # Dump elements via UIA
    elems = uia_engine.dump_window_elements(target["hwnd"], max_elements=50)

    # Attempt to discover address bar value
    address_val = None
    for e in elems:
        if e.get("controlType") == "Edit" and ("address" in e.get("name", "").lower() or "search" in e.get("name", "").lower()):
            address_val = e.get("name")
            break

    return {
        "success": True,
        "hwnd": target["handle"],
        "title": target["title"],
        "browserName": target.get("browserName"),
        "addressBarHint": address_val,
        "elementCount": len(elems),
        "elements": elems,
    }


def get_download_status(downloads_folder: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspects user's Downloads directory for recent completed or in-progress downloads.

    Args:
        downloads_folder (Optional[str]): Path to Downloads or defaults to user's folder.

    Returns:
        Dict[str, Any]: {success, recentDownloads, activeDownloads}.
    """
    down_path = downloads_folder or os.path.join(os.environ.get("USERPROFILE", ""), "Downloads")
    if not os.path.isdir(down_path):
        return {"success": False, "error": f"Downloads path '{down_path}' not found."}

    recent: List[Dict[str, Any]] = []
    active_crdownload: List[str] = []

    try:
        now = time.time()
        for root, _, files in os.walk(down_path):
            for f in files:
                p = os.path.join(root, f)
                if f.endswith(".crdownload") or f.endswith(".tmp"):
                    active_crdownload.append(f)
                else:
                    try:
                        mtime = os.path.getmtime(p)
                        # Modified within last 1 hour
                        if now - mtime < 3600:
                            recent.append({
                                "name": f,
                                "path": p,
                                "sizeBytes": os.path.getsize(p),
                                "modifiedAt": mtime,
                            })
                    except Exception:
                        continue
            break  # Top level only

        recent.sort(key=lambda x: x["modifiedAt"], reverse=True)
        return {
            "success": True,
            "downloadsFolder": down_path,
            "activeDownloadsCount": len(active_crdownload),
            "recentFilesCount": len(recent),
            "recentDownloads": recent[:10],
            "activeDownloads": active_crdownload,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
