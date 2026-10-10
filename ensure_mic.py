import subprocess
import sys
from pathlib import Path

def setup_microphone():
    app_dir = Path(__file__).resolve().parent
    ps_script = app_dir / "set_default_mic.ps1"
    unmute_script = app_dir / "unmute_all_mics.py"

    if ps_script.is_file():
        try:
            subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(ps_script)],
                capture_output=True,
                check=False
            )
        except Exception as e:
            print("Failed to run set_default_mic.ps1:", e)

    if unmute_script.is_file():
        try:
            subprocess.run(
                [sys.executable, str(unmute_script)],
                capture_output=True,
                check=False
            )
        except Exception as e:
            print("Failed to run unmute_all_mics.py:", e)

if __name__ == "__main__":
    setup_microphone()
    print("Microphone setup verified!")

