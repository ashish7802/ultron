"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Test Suite: tests_computer_intelligence.py
Purpose: Comprehensive Verification of Native Python Desktop & Computer Modules (01 - 11)
===============================================================================

Tests Covered:
- Test 1: Desktop Engine OS & Display Introspection (Module 02)
- Test 2: Window Enumeration & Active Window Identification (Module 02)
- Test 3: Application Intelligence Discovery & Fuzzy Matching (Module 03)
- Test 4: Mouse & Keyboard Input Simulation Contract (Module 04)
- Test 5: UI Automation (UIA) COM Interface & Element Dumping (Module 05)
- Test 6: Guarded File System Intelligence & Automatic Backups (Module 06)
- Test 7: Terminal Intelligence, Shell Detection & Controlled Execution (Module 07)
- Test 8: Browser Discovery & Safe URL Validation (Module 08)
- Test 9: Development Environment Intelligence & Port Probing (Module 09)
- Test 10: Computer Safety Controls & Independent Emergency Stop (Module 10)
- Test 11: Unified CLI Dispatcher Contract (Module 11)
===============================================================================
"""

import os
import sys
import time
import json
import unittest

from ultron_engine.computer import (
    desktop_engine,
    app_manager,
    input_driver,
    uia_engine,
    visual_recognizer,
    filesystem_driver,
    terminal_driver,
    browser_driver,
    dev_driver,
    safety_controller,
)
from ultron_engine.computer.computer_intelligence_cli import dispatch


class TestComputerIntelligence(unittest.TestCase):
    def setUp(self):
        # Ensure Emergency Stop is cleared before each test
        safety_controller.reset_emergency_stop("Test setup reset")

    def tearDown(self):
        safety_controller.reset_emergency_stop("Test teardown reset")

    def test_01_desktop_os_and_monitors(self):
        """Module 02: Validates OS build metadata and monitor enumeration."""
        os_info = desktop_engine.get_os_metadata()
        self.assertEqual(os_info["platform"], "windows")
        self.assertIn("Windows", os_info["system"])
        self.assertTrue(len(os_info["current_build"]) > 0)

        monitors = desktop_engine.get_display_monitors()
        self.assertTrue(len(monitors) >= 1)
        self.assertTrue(monitors[0]["resolution"]["width"] > 0)
        self.assertTrue(monitors[0]["resolution"]["height"] > 0)
        print("  -> Passed: OS metadata and monitor enumeration.")

    def test_02_window_enumeration(self):
        """Module 02: Validates live desktop window enumeration."""
        wins = desktop_engine.enumerate_windows(include_hidden=True)
        self.assertIsInstance(wins, list)
        self.assertTrue(len(wins) > 0)
        for w in wins[:3]:
            self.assertIn("hwnd", w)
            self.assertIn("bounds", w)
            self.assertIn("processName", w)
        print(f"  -> Passed: Enumerated {len(wins)} desktop windows.")

    def test_03_app_manager_discovery(self):
        """Module 03: Validates application discovery across Start Menu and registry."""
        apps = app_manager.discover_installed_apps()
        self.assertTrue(len(apps) >= 5)

        notepad = app_manager.find_app("notepad")
        self.assertIsNotNone(notepad)
        self.assertEqual(notepad["name"], "Notepad")

        chrome = app_manager.find_app("chrome")
        self.assertIsNotNone(chrome)
        print(f"  -> Passed: Discovered {len(apps)} installed apps; fuzzy match verified.")

    def test_04_mouse_and_keyboard(self):
        """Module 04: Validates SendInput cursor query and unicode typing."""
        pos = input_driver.get_cursor_position()
        self.assertIsInstance(pos, tuple)
        self.assertEqual(len(pos), 2)

        type_res = input_driver.type_text("")
        self.assertTrue(type_res["success"])
        self.assertEqual(type_res["characterCount"], 0)

        # Test hotkey resolution without stuck modifiers
        hk_res = input_driver.send_hotkey(["ctrl"])
        self.assertTrue(hk_res["success"])
        print("  -> Passed: Cursor query and hardware keyboard simulation verified.")

    def test_05_uia_element_dump(self):
        """Module 05: Validates native COM UIA client initialization and element dumping."""
        uia = uia_engine.get_uia()
        self.assertIsNotNone(uia)

        wins = desktop_engine.enumerate_windows()
        if wins:
            elems = uia_engine.dump_window_elements(wins[0]["hwnd"], max_elements=5)
            self.assertIsInstance(elems, list)
            print(f"  -> Passed: UIA connected; dumped {len(elems)} elements from '{wins[0]['title']}'.")
        else:
            print("  -> Passed: UIA COM initialized.")

    def test_06_filesystem_intelligence(self):
        """Module 06: Validates safe file writing, automatic .bak backups, and verification."""
        test_file = os.path.abspath("test_computer_fs_temp.txt")

        # 1. Initial write
        w_res = filesystem_driver.write_file(test_file, "First content string", overwrite=True)
        self.assertTrue(w_res["success"])
        self.assertTrue(w_res["verified"])
        self.assertIsNotNone(w_res["sha256"])

        # 2. Overwrite and verify backup was created
        w_res2 = filesystem_driver.write_file(test_file, "Overwritten content string", overwrite=True)
        self.assertTrue(w_res2["success"])
        self.assertIsNotNone(w_res2["backupPath"])
        self.assertTrue(os.path.exists(w_res2["backupPath"]))

        # 3. Read back
        r_res = filesystem_driver.read_file(test_file)
        self.assertTrue(r_res["success"])
        self.assertEqual(r_res["content"], "Overwritten content string")

        # 4. Safe delete
        d_res = filesystem_driver.delete_file(test_file)
        self.assertTrue(d_res["success"])
        self.assertTrue(d_res["verified"])
        self.assertFalse(os.path.exists(test_file))

        # Cleanup backup
        if w_res2["backupPath"] and os.path.exists(w_res2["backupPath"]):
            try:
                os.remove(w_res2["backupPath"])
            except Exception:
                pass
        print("  -> Passed: Filesystem write, automatic .bak backup, and deletion verified.")

    def test_07_terminal_intelligence(self):
        """Module 07: Validates shell detection, risk analysis, and controlled command execution."""
        shells = terminal_driver.detect_shells()
        self.assertIn("powershell", shells)

        # Risk classification
        safe_risk = terminal_driver.classify_command_risk("git status")
        self.assertEqual(safe_risk["riskLevel"], "low")
        self.assertFalse(safe_risk["isBlocked"])

        blocked_risk = terminal_driver.classify_command_risk("format c:")
        self.assertEqual(blocked_risk["riskLevel"], "critical")
        self.assertTrue(blocked_risk["isBlocked"])

        # Controlled execution
        exec_res = terminal_driver.execute_command("echo ULTRON_CLI_TEST", timeout_sec=10)
        self.assertTrue(exec_res["success"])
        self.assertEqual(exec_res["exitCode"], 0)
        self.assertIn("ULTRON_CLI_TEST", exec_res["stdout"])
        print("  -> Passed: Shell detection, risk gating, and controlled execution verified.")

    def test_08_browser_interaction(self):
        """Module 08: Validates browser detection and URL validation."""
        browsers = browser_driver.detect_installed_browsers()
        self.assertTrue(len(browsers) >= 1)

        default_b = browser_driver.get_default_browser()
        self.assertIsNotNone(default_b)

        # Validate URL safety
        safe_url = browser_driver._validate_url_safety("https://github.com")
        self.assertEqual(safe_url, "https://github.com")

        # Verify SSRF block
        with self.assertRaises(ValueError):
            browser_driver._validate_url_safety("http://169.254.169.254/latest/meta-data")
        print(f"  -> Passed: Discovered {len(browsers)} browsers; SSRF blocked.")

    def test_09_dev_environment(self):
        """Module 09: Validates project context and git status inspection."""
        ctx = dev_driver.detect_project_context()
        self.assertIn("next", ctx["projectType"])
        self.assertTrue(ctx["hasGit"])

        git = dev_driver.get_git_status()
        self.assertTrue(git["isGitRepo"])
        self.assertIsNotNone(git["branch"])

        port_check = dev_driver.check_port_listening(49999)
        self.assertFalse(port_check["isListening"])
        print(f"  -> Passed: Project context ({ctx['projectType']}), git branch '{git['branch']}'.")

    def test_10_safety_and_emergency_stop(self):
        """Module 10: Validates fail-closed boundaries and independent Emergency Stop."""
        # 1. Protected process guard
        term_check = safety_controller.validate_safety_boundaries("terminate", "csrss.exe")
        self.assertTrue(term_check["blocked"])
        self.assertEqual(term_check["riskLevel"], "critical")

        # 2. Trigger Emergency Stop
        stop_res = safety_controller.trigger_emergency_stop("Automated test emergency trigger")
        self.assertTrue(stop_res["emergencyStopActive"])
        self.assertTrue(safety_controller.is_emergency_stop_active())

        # 3. Operations must now be blocked
        blocked_op = safety_controller.validate_safety_boundaries("click", "any_target")
        self.assertTrue(blocked_op["blocked"])
        self.assertIn("Emergency Stop", blocked_op["reason"])

        # 4. Reset Emergency Stop
        reset_res = safety_controller.reset_emergency_stop("Test reset")
        self.assertFalse(reset_res["emergencyStopActive"])
        self.assertFalse(safety_controller.is_emergency_stop_active())
        print("  -> Passed: Fail-closed boundaries and Emergency Stop lifecycle verified.")

    def test_11_cli_dispatcher(self):
        """Module 11: Validates unified JSON CLI dispatcher."""
        res = dispatch("os_info", {})
        self.assertTrue(res["success"])
        self.assertIn("data", res)
        self.assertEqual(res["data"]["platform"], "windows")

        res_apps = dispatch("find_app", {"query": "notepad"})
        self.assertTrue(res_apps["success"])
        self.assertEqual(res_apps["data"]["name"], "Notepad")
        print("  -> Passed: Unified JSON CLI dispatcher verified.")


if __name__ == "__main__":
    print("\n=======================================================")
    print("   RUNNING ULTRON COMPUTER INTELLIGENCE PYTHON TESTS")
    print("=======================================================\n")
    unittest.main(verbosity=2)
