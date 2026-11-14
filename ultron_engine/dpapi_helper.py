import win32crypt
import base64
import sys

def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "protect"
    data = sys.argv[2] if len(sys.argv) > 2 else ""

    if action == "protect":
        raw = data.encode("utf-8")
        blob = win32crypt.CryptProtectData(raw, "ULTRON_KEY_CUSTODY", None, None, None, 0)
        print(base64.b64encode(blob).decode("ascii"))
    elif action == "unprotect":
        blob = base64.b64decode(data.encode("ascii"))
        _, decrypted = win32crypt.CryptUnprotectData(blob, None, None, None, 0)
        print(decrypted.decode("utf-8"))

if __name__ == "__main__":
    main()
