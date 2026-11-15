"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.dpapi_helper
Purpose: Native Windows DPAPI (Data Protection API) Stdin Cryptographic Helper
===============================================================================

Subsystem:
Centralized Cryptographic Key Custody Architecture (F-06 & F-16 Hardening).

Key Responsibilities:
- Wraps sensitive master key and recovery key secrets with Windows DPAPI (`CryptProtectData`).
- Unwraps DPAPI blobs (`CryptUnprotectData`) strictly within the user logon context.
- Reads secret payloads EXCLUSIVELY via standard input (stdin) to prevent command-line
  secret sniffing in Task Manager, Process Explorer, or `Get-CimInstance Win32_Process`.
- Strictly rejects any command-line arguments beyond the single operation argument (`protect` or `unprotect`).

Security & Safety Guarantees:
- Zero command-line argument secrets: `sys.argv[2]` payload transport is strictly prohibited and rejected.
- Fails closed with distinct exit codes for missing dependencies, invalid usage, empty payload, or DPAPI error.
- Binds encryption to current Windows user login credentials with integrity hash.
===============================================================================
"""

import sys
import base64

try:
    import win32crypt
    HAS_WIN32CRYPT = True
except ImportError:
    HAS_WIN32CRYPT = False


def main():
    if not HAS_WIN32CRYPT:
        sys.stderr.write("ERROR_WIN32CRYPT_UNAVAILABLE: pywin32 is not installed or platform is not Windows\n")
        sys.exit(2)

    # Invariant: Strictly reject unexpected command-line arguments (prevent secret sniffing)
    if len(sys.argv) > 2:
        sys.stderr.write("ERROR_UNEXPECTED_ARGUMENTS: Secret payloads via command-line arguments are prohibited. Pass payload via stdin exclusively.\n")
        sys.exit(5)

    if len(sys.argv) < 2 or sys.argv[1] not in ("protect", "unprotect"):
        sys.stderr.write("ERROR_INVALID_USAGE: Usage: python dpapi_helper.py <protect|unprotect> (payload via stdin)\n")
        sys.exit(4)

    action = sys.argv[1]

    # Read payload strictly from stdin
    stdin_data = sys.stdin.read().strip()

    if not stdin_data:
        sys.stderr.write("ERROR_EMPTY_PAYLOAD\n")
        sys.exit(3)

    try:
        if action == "protect":
            raw = stdin_data.encode("utf-8")
            # CryptProtectData binds to current Windows user login credentials
            blob = win32crypt.CryptProtectData(raw, "ULTRON_KEY_CUSTODY", None, None, None, 0)
            sys.stdout.write(base64.b64encode(blob).decode("ascii"))
            sys.stdout.flush()
        elif action == "unprotect":
            blob = base64.b64decode(stdin_data.encode("ascii"))
            _, decrypted = win32crypt.CryptUnprotectData(blob, None, None, None, 0)
            sys.stdout.write(decrypted.decode("utf-8"))
            sys.stdout.flush()
        else:
            sys.stderr.write(f"ERROR_UNKNOWN_ACTION: {action}\n")
            sys.exit(4)
    except Exception as e:
        sys.stderr.write(f"ERROR_DPAPI_FAILURE: {str(e)}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
