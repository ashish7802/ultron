"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Independent Verification Test Suite: tests_independent_verification_batch.py
Auditor: Independent Senior QA Engineer & Windows Security Auditor
===============================================================================

Comprehensive Test Harness for:
1. Module-by-Module Verification (Modules 01 - 11)
2. Adversarial Security & Red-Team Attack Suite (SEC-01 - SEC-06)
3. Failure, Crash & Edge Case Recovery Suite (FAIL-01 - FAIL-04)
4. Empirical Performance & Latency Benchmarks
===============================================================================
"""

import os
import sys
import time
import json
import shutil
import unittest
import tempfile

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
from ultron_engine import screen_capture_driver

# Temporary sandbox directory for safe filesystem testing
SANDBOX_DIR = os.path.join(tempfile.gettempdir(), "ultron_computer_verification_sandbox")


class IndependentVerificationSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.makedirs(SANDBOX_DIR, exist_ok=True)
        safety_controller.reset_emergency_stop("Class setup")

    @classmethod
    def tearDownClass(cls):
        safety_controller.reset_emergency_stop("Class teardown")
        if os.path.exists(SANDBOX_DIR):
            try:
                shutil.rmtree(SANDBOX_DIR)
            except Exception:
                pass

    def setUp(self):
        safety_controller.reset_emergency_stop("Test setup")

    def tearDown(self):
        safety_controller.reset_emergency_stop("Test teardown")

    # =========================================================================
    # 1. MODULE-BY-MODULE VERIFICATION
    # =========================================================================

    def test_m01_screen_awareness_capture(self):
        """M01 — Physical screen capture and GDI BitBlt frame acquisition."""
        t0 = time.perf_counter()
        monitors = screen_capture_driver.get_monitors()
        self.assertTrue(len(monitors) >= 1, "Must detect at least 1 physical monitor")
        primary = next((m for m in monitors if m.get("isPrimary")), monitors[0])
        w = primary["bounds"]["width"]
        h = primary["bounds"]["height"]

        # Capture small test region (100x100) to test GDI BitBlt
        bmp_data = screen_capture_driver.capture_rect(0, 0, 100, 100)
        dur_ms = round((time.perf_counter() - t0) * 1000, 2)

        self.assertTrue(len(bmp_data) > 54, "BMP data must contain standard headers")
        self.assertEqual(bmp_data[:2], b"BM", "Valid BMP signature required")
        print(f"  [M01] Physical screen capture acquired (100x100) in {dur_ms}ms. Monitors: {len(monitors)}")

    def test_m02_desktop_understanding(self):
        """M02 — Windows 11 build introspection and live window tree."""
        t0 = time.perf_counter()
        os_meta = desktop_engine.get_os_metadata()
        dur_ms = round((time.perf_counter() - t0) * 1000, 2)

        self.assertEqual(os_meta["platform"], "windows")
        self.assertTrue(len(os_meta["current_build"]) > 0)
        self.assertTrue(int(os_meta["current_build"]) >= 10240, "Build must be Windows 10/11")

        # Window tree
        windows = desktop_engine.enumerate_windows(include_hidden=True)
        self.assertTrue(len(windows) > 0, "Must enumerate active desktop windows")
        active = desktop_engine.get_active_window()
        print(f"  [M02] Desktop OS: {os_meta.get('product_name')} (Build {os_meta.get('current_build')}). Windows: {len(windows)}")

    def test_m03_application_intelligence(self):
        """M03 — Discovery of registered software and failure detection."""
        t0 = time.perf_counter()
        apps = app_manager.discover_installed_apps()
        dur_ms = round((time.perf_counter() - t0) * 1000, 2)

        self.assertTrue(len(apps) >= 10, "Must discover at least 10 installed applications")
        notepad = app_manager.find_app("notepad")
        self.assertIsNotNone(notepad)
        self.assertEqual(notepad["name"], "Notepad")

        # Failure detection on missing application
        fail_res = app_manager.launch_app("non_existent_binary_xyz_999.exe")
        self.assertFalse(fail_res["success"], "Launching non-existent binary must fail safely")
        print(f"  [M03] Discovered {len(apps)} applications in {dur_ms}ms. Missing app handled safely.")

    def test_m04_mouse_keyboard_input(self):
        """M04 — SendInput cursor telemetry and unicode typing contracts."""
        pos = input_driver.get_cursor_position()
        self.assertIsInstance(pos, tuple)
        self.assertEqual(len(pos), 2)

        # Move mouse
        new_pos = input_driver.mouse_move(pos[0], pos[1], smooth=False)
        self.assertIsInstance(new_pos, tuple)

        # Unicode text typing simulation
        type_res = input_driver.type_text("ULTRON_VERIFY_2026", delay_ms=1)
        self.assertTrue(type_res["success"])
        self.assertEqual(type_res["characterCount"], 18)

        # Hotkey safety release
        hk_res = input_driver.send_hotkey(["ctrl"])
        self.assertTrue(hk_res["success"])
        print("  [M04] Mouse coordinates queried; SendInput unicode typing and hotkeys verified.")

    def test_m05_visual_element_recognition(self):
        """M05 — UI Automation COM client traversal and element classification."""
        uia = uia_engine.get_uia()
        self.assertIsNotNone(uia, "CUIAutomation COM interface must be initialized")

        windows = desktop_engine.enumerate_windows()
        if windows:
            elems = uia_engine.dump_window_elements(windows[0]["hwnd"], max_elements=10)
            self.assertIsInstance(elems, list)
            for el in elems[:3]:
                category = visual_recognizer.classify_element(el)
                self.assertIsInstance(category, str)
            print(f"  [M05] UIA accessibility tree dumped ({len(elems)} elements) and classified.")

    def test_m06_filesystem_intelligence(self):
        """M06 — Guarded write, automatic backup creation, duplicate detection, and deletion."""
        test_file = os.path.join(SANDBOX_DIR, "fs_audit_test.txt")

        # Write 1
        w1 = filesystem_driver.write_file(test_file, "Payload Alpha", overwrite=True)
        self.assertTrue(w1["success"])
        self.assertTrue(w1["verified"])
        self.assertIsNotNone(w1["sha256"])

        # Write 2 (Overwrite): Must create .bak file
        w2 = filesystem_driver.write_file(test_file, "Payload Beta (Overwritten)", overwrite=True)
        self.assertTrue(w2["success"])
        self.assertIsNotNone(w2["backupPath"])
        self.assertTrue(os.path.exists(w2["backupPath"]), "Rolling .bak backup file must physically exist")

        # Duplicate detection
        dup_file = os.path.join(SANDBOX_DIR, "fs_audit_duplicate.txt")
        filesystem_driver.write_file(dup_file, "Payload Beta (Overwritten)", overwrite=True)
        dups = filesystem_driver.find_duplicates(SANDBOX_DIR)
        self.assertTrue(dups["success"])
        self.assertTrue(dups["duplicateGroupsCount"] >= 1, "Must detect duplicate SHA-256 hashes")

        # Safe delete
        d_res = filesystem_driver.delete_file(test_file)
        self.assertTrue(d_res["success"])
        self.assertFalse(os.path.exists(test_file))
        print("  [M06] Filesystem write, automatic .bak snapshot, duplicate detection, and delete verified.")

    def test_m07_terminal_intelligence(self):
        """M07 — Shell identification, risk gating, and process timeout termination."""
        shells = terminal_driver.detect_shells()
        self.assertIn("powershell", shells, "PowerShell must be detected on Windows")

        # Safe command execution
        res = terminal_driver.execute_command("echo ULTRON_TERMINAL_VERIFIED", timeout_sec=10)
        self.assertTrue(res["success"])
        self.assertEqual(res["exitCode"], 0)
        self.assertIn("ULTRON_TERMINAL_VERIFIED", res["stdout"])

        # Timeout termination
        timeout_res = terminal_driver.execute_command("Start-Sleep -Seconds 5", timeout_sec=1)
        self.assertFalse(timeout_res["success"])
        self.assertTrue(timeout_res.get("timedOut", False), "Process must be terminated on timeout")
        print("  [M07] Terminal execution verified; timeout termination enforced.")

    def test_m08_browser_interaction(self):
        """M08 — Browser detection and URL validation."""
        browsers = browser_driver.detect_installed_browsers()
        self.assertTrue(len(browsers) >= 1, "Must detect installed browsers (Chrome/Edge)")
        def_b = browser_driver.get_default_browser()
        self.assertIsNotNone(def_b)

        # Downloads directory status
        dl_status = browser_driver.get_download_status()
        self.assertTrue(dl_status["success"])
        print(f"  [M08] Detected {len(browsers)} browsers. Downloads folder inspected.")

    def test_m09_dev_environment(self):
        """M09 — Project profile, git status, and TCP port probing."""
        ctx = dev_driver.detect_project_context()
        self.assertIn("next", ctx["projectType"])
        self.assertTrue(ctx["hasGit"])

        git = dev_driver.get_git_status()
        self.assertTrue(git["isGitRepo"])
        self.assertEqual(git["branch"], "main")

        # Probe closed port
        probe = dev_driver.check_port_listening(59999)
        self.assertFalse(probe["isListening"])
        print(f"  [M09] Dev environment: {ctx['projectType']} on branch '{git['branch']}'.")

    def test_m10_computer_safety(self):
        """M10 — Emergency Stop lifecycle and process boundary enforcement."""
        # 1. Verify protected process boundary
        guard = safety_controller.validate_safety_boundaries("terminate", "csrss.exe")
        self.assertTrue(guard["blocked"], "Core system processes must be protected")

        # 2. Trigger Emergency Stop
        stop = safety_controller.trigger_emergency_stop("Verification audit trigger")
        self.assertTrue(stop["emergencyStopActive"])
        self.assertTrue(safety_controller.is_emergency_stop_active())

        # 3. Operations must be blocked while Emergency Stop is active
        blocked = safety_controller.validate_safety_boundaries("click", "target")
        self.assertTrue(blocked["blocked"])
        self.assertIn("Emergency Stop", blocked["reason"])

        # 4. Reset Emergency Stop
        reset = safety_controller.reset_emergency_stop("Verification audit reset")
        self.assertFalse(reset["emergencyStopActive"])
        self.assertFalse(safety_controller.is_emergency_stop_active())
        print("  [M10] Emergency Stop lockfile and protected process boundaries verified.")

    def test_m11_cli_contract(self):
        """M11 — Unified CLI dispatcher contract."""
        res = dispatch("os_info", {})
        self.assertTrue(res["success"])
        self.assertIn("platform", res["data"])
        print("  [M11] CLI dispatcher contract verified.")

    # =========================================================================
    # 2. SECURITY & ADVERSARIAL RED-TEAM TESTS
    # =========================================================================

    def test_sec_01_path_traversal_blocking(self):
        """SEC-01: Path traversal attempts to Windows system directories must be blocked."""
        # Attempt to write to C:\Windows\System32\malicious.dll
        traversal_path = r"C:\Windows\System32\malicious_payload.dll"
        with self.assertRaises(PermissionError):
            filesystem_driver._validate_path_safety(traversal_path, allow_protected=False)

        res = filesystem_driver.write_file(traversal_path, "payload", overwrite=True)
        self.assertFalse(res["success"])
        self.assertIn("Access Denied", res["error"])
        print("  [SEC-01] Path traversal attempt to System32 blocked fail-closed.")

    def test_sec_02_dangerous_command_blocking(self):
        """SEC-02: Destructive format/rmdir/registry delete commands must be classified CRITICAL and blocked."""
        dangerous_cmds = [
            "format C: /fs:NTFS",
            "rmdir /s /q C:\\",
            "reg delete HKLM\\Software\\Microsoft",
        ]
        for cmd in dangerous_cmds:
            risk = terminal_driver.classify_command_risk(cmd)
            self.assertEqual(risk["riskLevel"], "critical", f"Command '{cmd}' must be critical")
            self.assertTrue(risk["isBlocked"], f"Command '{cmd}' must be blocked")

            # Verify CLI execution rejects it
            exec_res = terminal_driver.execute_command(cmd)
            self.assertFalse(exec_res["success"])
            self.assertTrue(exec_res["blocked"])
        print("  [SEC-02] All destructive commands blocked from execution.")

    def test_sec_03_protected_process_kill_blocking(self):
        """SEC-03: Protected Windows processes must reject termination requests."""
        protected = ["csrss.exe", "lsass.exe", "services.exe", "svchost.exe", "explorer.exe"]
        for proc in protected:
            val = safety_controller.validate_safety_boundaries("terminate", proc)
            self.assertTrue(val["blocked"], f"Process '{proc}' must be protected")
            term_res = app_manager.terminate_app(proc)
            self.assertFalse(term_res["success"])
            self.assertTrue(term_res.get("blocked", False))
        print("  [SEC-03] Core Windows system processes protected against termination.")

    def test_sec_04_emergency_stop_lockout(self):
        """SEC-04: Emergency Stop engagement must strictly block any mutating interaction."""
        safety_controller.trigger_emergency_stop("Red-team active lockout test")
        try:
            # Attempt to execute command via CLI dispatcher
            cli_res = dispatch("exec_cmd", {"command": "echo hello"})
            self.assertFalse(cli_res["success"])
            self.assertTrue(cli_res.get("emergencyStop", False))

            # Attempt to write file via CLI
            fs_res = dispatch("write_file", {"path": "test.txt", "content": "data"})
            self.assertFalse(fs_res["success"])
            self.assertTrue(fs_res.get("emergencyStop", False))
        finally:
            safety_controller.reset_emergency_stop("Cleanup")
        print("  [SEC-04] Emergency Stop active lockout strictly enforced across CLI dispatcher.")

    def test_sec_05_ssrf_browser_navigation_blocking(self):
        """SEC-05: Prohibited URLs (cloud metadata 169.254.169.254) must be blocked."""
        with self.assertRaises(ValueError):
            browser_driver._validate_url_safety("http://169.254.169.254/latest/meta-data")
        with self.assertRaises(ValueError):
            browser_driver._validate_url_safety("file:///C:/Windows/System32/drivers/etc/hosts")
        print("  [SEC-05] SSRF and non-HTTP protocols blocked.")

    def test_sec_06_sensitive_window_masking(self):
        """SEC-06: Sensitive window titles (1Password, banking, authenticator) must be flagged."""
        sensitive_samples = [
            "1Password - Personal Vault",
            "Bitwarden - Master Password",
            "Bank of America - Login",
            "Microsoft Authenticator Prompt",
        ]
        for title in sensitive_samples:
            check = safety_controller.validate_safety_boundaries("click", title)
            self.assertTrue(check["blocked"])
            self.assertEqual(check["riskLevel"], "high")
        print("  [SEC-06] Sensitive credential/banking windows flagged and excluded.")

    # =========================================================================
    # 3. FAILURE & RECOVERY TESTS
    # =========================================================================

    def test_fail_01_missing_app_handling(self):
        """FAIL-01: Launching non-existent application must report error without crashing."""
        res = app_manager.launch_app("this_app_does_not_exist_xyz.exe")
        self.assertFalse(res["success"])
        self.assertIn("error", res)
        print("  [FAIL-01] Missing app launch returns honest failure.")

    def test_fail_02_invalid_window_handle(self):
        """FAIL-02: Interacting with invalid window handle must fail gracefully."""
        res = desktop_engine.close_window(0x99999999)
        self.assertFalse(res["success"])
        self.assertIn("error", res)
        print("  [FAIL-02] Invalid window handle rejected safely.")

    def test_fail_03_invalid_file_path(self):
        """FAIL-03: Reading non-existent file path must return honest failure."""
        res = filesystem_driver.read_file(os.path.join(SANDBOX_DIR, "non_existent.txt"))
        self.assertFalse(res["success"])
        self.assertIn("error", res)
        print("  [FAIL-03] Invalid file read returns honest failure.")

    def test_fail_04_command_timeout_recovery(self):
        """FAIL-04: Subprocess timeout must terminate child and report failure."""
        t0 = time.perf_counter()
        res = terminal_driver.execute_command("Start-Sleep -Seconds 10", timeout_sec=2)
        dur = time.perf_counter() - t0
        self.assertFalse(res["success"])
        self.assertTrue(res.get("timedOut", False))
        self.assertTrue(dur < 4.0, "Timeout handler must terminate process within bounded window")
        print(f"  [FAIL-04] Subprocess timeout enforced ({dur:.2f}s).")

    # =========================================================================
    # 4. PERFORMANCE BENCHMARKS
    # =========================================================================

    def test_perf_benchmarks(self):
        """Empirical latency measurements for core computer operations."""
        # 1. Screen capture latency
        t0 = time.perf_counter()
        _ = screen_capture_driver.capture_rect(0, 0, 400, 300)
        cap_lat = round((time.perf_counter() - t0) * 1000, 2)

        # 2. Window enumeration latency
        t0 = time.perf_counter()
        _ = desktop_engine.enumerate_windows(include_hidden=True)
        win_lat = round((time.perf_counter() - t0) * 1000, 2)

        # 3. App discovery latency
        t0 = time.perf_counter()
        _ = app_manager.discover_installed_apps(force_refresh=True)
        app_lat = round((time.perf_counter() - t0) * 1000, 2)

        # 4. File write and hash latency (64KB payload)
        t0 = time.perf_counter()
        test_payload = "A" * 65536
        target = os.path.join(SANDBOX_DIR, "perf_test.txt")
        _ = filesystem_driver.write_file(target, test_payload, overwrite=True)
        fs_lat = round((time.perf_counter() - t0) * 1000, 2)

        # 5. Port check latency
        t0 = time.perf_counter()
        _ = dev_driver.check_port_listening(59998)
        port_lat = round((time.perf_counter() - t0) * 1000, 2)

        print("\n  =======================================================")
        print("   EMPIRICAL PERFORMANCE BENCHMARKS (Windows 11 x64)")
        print("  =======================================================")
        print(f"   - Screen Capture Latency (400x300 GDI):     {cap_lat} ms")
        print(f"   - Window Tree Enumeration Latency:         {win_lat} ms")
        print(f"   - Full Installed App Registry Scan:        {app_lat} ms")
        print(f"   - File Write + SHA-256 Hash (64KB):        {fs_lat} ms")
        print(f"   - TCP Port Probe Latency:                  {port_lat} ms")
        print("  =======================================================\n")

        self.assertTrue(cap_lat < 200, "Screen capture latency must be < 200ms")
        self.assertTrue(win_lat < 500, "Window enumeration must be < 500ms")
        self.assertTrue(fs_lat < 200, "File write/hash must be < 200ms")


if __name__ == "__main__":
    print("\n=======================================================")
    print("   INDEPENDENT COMPUTER INTELLIGENCE VERIFICATION SUITE")
    print("=======================================================\n")
    unittest.main(verbosity=2)
