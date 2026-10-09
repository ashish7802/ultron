import os
import subprocess
import sys

desktop_dir = os.path.expanduser("~/Desktop")
startup_dir = os.path.expanduser("~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup")
app_dir = r"c:\Users\Ashish\Documents\spiderman"
pythonw_exe = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
if not os.path.isfile(pythonw_exe):
    pythonw_exe = "pythonw.exe"
launch_script = os.path.join(app_dir, "launch_app.py")

# Create batch runner ULTRON.bat
bat_path = os.path.join(app_dir, "ULTRON.bat")
bat_content = (
    f'@echo off\ncd /d "{app_dir}"\n'
    f'start "" "{pythonw_exe}" "{launch_script}"\n'
)

with open(bat_path, "w") as f:
    f.write(bat_content)

# Create VBS runner to run silently without black cmd window
vbs_path = os.path.join(app_dir, "ULTRON.vbs")
vbs_content = (
    'Set WshShell = CreateObject("WScript.Shell")\n'
    f'WshShell.Run """{pythonw_exe}"" ""{launch_script}""", 0, False\n'
)

with open(vbs_path, "w") as f:
    f.write(vbs_content)

# PowerShell script to generate .lnk shortcuts
def create_shortcut(target_vbs, shortcut_path):
    ps_script = f'''
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
    $Shortcut.TargetPath = "{target_vbs}"
    $Shortcut.WorkingDirectory = "{app_dir}"
    $Shortcut.Description = "ULTRON AI Companion"
    $Shortcut.Save()
    '''
    ps_file = os.path.join(app_dir, "make_shortcut.ps1")
    with open(ps_file, "w") as f:
        f.write(ps_script)

    try:
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps_file],
            check=True,
        )
    finally:
        if os.path.exists(ps_file):
            os.remove(ps_file)

desktop_lnk = os.path.join(desktop_dir, "ULTRON.lnk")
startup_lnk = os.path.join(startup_dir, "ULTRON.lnk")

create_shortcut(vbs_path, desktop_lnk)
create_shortcut(vbs_path, startup_lnk)

print("Created Desktop shortcut:", desktop_lnk)
print("Created Startup shortcut:", startup_lnk)
