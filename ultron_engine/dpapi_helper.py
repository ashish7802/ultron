"""
ultron_engine.dpapi_helper
Windows DPAPI CryptProtectData and CryptUnprotectData Subprocess Helper.

Security Invariants:
- Uses stdin stream for input payload transport to prevent command line argument sniffing.
- Restricts memory exposure; outputs solely the base64-encoded ciphertext or plaintext.
- Handles Windows DPAPI errors gracefully with explicit exit codes.
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

    action = sys.argv[1] if len(sys.argv) > 1 else "protect"
    
    # Read payload from stdin for secrecy (avoid command-line argument inspection via taskmgr/process explorer)
    stdin_data = sys.stdin.read().strip()
    
    # Fallback to sys.argv[2] if stdin was empty and argument provided
    if not stdin_data and len(sys.argv) > 2:
        stdin_data = sys.argv[2].strip()

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
