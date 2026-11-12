"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Package: ultron_engine.computer
Purpose: Native Windows 11 Desktop Automation, Introspection, and Control Subsystem
===============================================================================

Key Responsibilities:
- Module 01: Native Screen Capture and High-Performance Display Drivers
- Module 02: Desktop Understanding & Window Topology Engine
- Module 03: Application Intelligence & Lifecycle Supervisor
- Module 04: Mouse, Keyboard, and Hardware Input Automation (SendInput & UIA)
- Module 05: Visual Element Recognition & Accessibility Selection Engine
- Module 06: Guarded File System Intelligence & Backup Architecture
- Module 07: Terminal & Subprocess Supervision with Shell Introspection
- Module 08: Browser Detection, Navigation, and Web State Verification
- Module 09: Development Environment Intelligence (VS Code, Git, Server Probes)
- Module 10: Computer Safety Controls, Boundaries & Independent Emergency Stop
- Module 11: End-to-End Task Orchestration (OBSERVE -> UNDERSTAND -> PLAN -> VERIFY)

Architectural Role & Interactions:
- Provides native Windows Win32, COM, UIA, and GDI bindings for the Node.js /
  Electron desktop shell and API gateways.
- Enforces fail-closed safety invariants and independent Emergency Stop controls.

Safety / Security Guarantees:
- Never executes unapproved destructive operations.
- Zero raw credential persistence.
- Fail-closed execution gatekeeper prevents parameter tampering.
===============================================================================
"""

from typing import List

__all__: List[str] = [
    "desktop_engine",
    "app_manager",
    "input_driver",
    "uia_engine",
    "filesystem_driver",
    "terminal_driver",
    "browser_driver",
    "dev_driver",
    "safety_controller",
]
