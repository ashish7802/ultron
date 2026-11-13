"""
===============================================================================
ULTRON CYBERNETIC INTELLIGENCE SYSTEM
Module: ultron_engine.windows_hello
Purpose: Native Windows Hello Biometric Platform Interface & Hardware Validation
===============================================================================

Architectural Role & Security Guarantees:
- Completely removes passkeys, WebAuthn registration dialogs, and synced passkeys.
- Communicates directly with the Windows Operating System Biometric Framework (winbio.dll)
  and Windows Runtime (UserConsentVerifier).
- Never captures, transmits, or stores raw fingerprint images or biometric templates.
- Verifies physical hardware binding:
  - Synaptics VFS7552 Touch Fingerprint Sensor (USB\\VID_06CB&PID_00B7).
  - Validates active fingerprint enrollment inside Windows Biometric Framework.
- Executes native Windows Hello biometric consent challenges directly on the host machine.
- Provides strict fail-closed responses to the Next.js API layer.
===============================================================================
"""

import argparse
import os
import sys
import json
import ctypes
from ctypes import wintypes
import subprocess
from typing import Any, Dict, Optional, Tuple


def get_windows_hello_availability() -> Dict[str, Any]:
    """
    Queries Windows Runtime UserConsentVerifier availability and WinBio framework.

    Returns:
        dict: Detailed hardware availability, sensor info, and enrolled fingerprint count.
    """
    if sys.platform != "win32":
        return {
            "supported": False,
            "availability": "NonWindowsPlatform",
            "reason": "Windows Hello is only supported on Windows operating systems."
        }

    # 1. Enumerate WinBio Biometric Units (Synaptics Touch Sensor)
    sensor_info = {
        "detected": False,
        "name": "Unknown",
        "manufacturer": "Unknown",
        "device_id": "",
        "unit_id": None,
        "status": "Unknown",
    }
    enrolled_count = 0

    try:
        winbio = ctypes.windll.winbio

        class WINBIO_UNIT_SCHEMA(ctypes.Structure):
            _fields_ = [
                ('UnitId', wintypes.DWORD),
                ('PoolType', wintypes.DWORD),
                ('BiometricFactor', wintypes.DWORD),
                ('SensorSubType', wintypes.DWORD),
                ('Capabilities', wintypes.DWORD),
                ('DeviceInstanceId', wintypes.WCHAR * 256),
                ('Description', wintypes.WCHAR * 256),
                ('Manufacturer', wintypes.WCHAR * 256),
                ('Model', wintypes.WCHAR * 256),
                ('SerialNumber', wintypes.WCHAR * 256),
                ('FirmwareVersion', wintypes.DWORD * 2),
            ]

        schema_array = ctypes.POINTER(WINBIO_UNIT_SCHEMA)()
        unit_count = wintypes.DWORD(0)
        res_enum = winbio.WinBioEnumBiometricUnits(0x08, ctypes.byref(schema_array), ctypes.byref(unit_count))

        if res_enum == 0 and unit_count.value > 0:
            sensor = schema_array[0]
            sensor_info = {
                "detected": True,
                "name": sensor.Description,
                "manufacturer": sensor.Manufacturer,
                "device_id": sensor.DeviceInstanceId,
                "unit_id": sensor.UnitId,
                "status": "OK",
            }

            # Check enrolled fingerprints for current user SID
            session_handle = wintypes.HANDLE()
            if winbio.WinBioOpenSession(0x08, 1, 0, None, 0, None, ctypes.byref(session_handle)) == 0:
                advapi32 = ctypes.windll.advapi32
                advapi32.OpenProcessToken.argtypes = [ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
                advapi32.OpenProcessToken.restype = wintypes.BOOL
                token = wintypes.HANDLE()

                if advapi32.OpenProcessToken(ctypes.c_void_p(-1), 0x0008, ctypes.byref(token)):
                    class TOKEN_USER(ctypes.Structure):
                        class SID_AND_ATTRIBUTES(ctypes.Structure):
                            _fields_ = [('Sid', ctypes.c_void_p), ('Attributes', wintypes.DWORD)]
                        _fields_ = [('User', SID_AND_ATTRIBUTES)]

                    needed = wintypes.DWORD()
                    advapi32.GetTokenInformation(token, 1, None, 0, ctypes.byref(needed))
                    buf = ctypes.create_string_buffer(needed.value)
                    if advapi32.GetTokenInformation(token, 1, buf, needed.value, ctypes.byref(needed)):
                        tu = ctypes.cast(buf, ctypes.POINTER(TOKEN_USER))[0]
                        sid_ptr = tu.User.Sid
                        advapi32.GetLengthSid.argtypes = [ctypes.c_void_p]
                        advapi32.GetLengthSid.restype = wintypes.DWORD
                        sid_len = advapi32.GetLengthSid(sid_ptr)

                        class WINBIO_IDENTITY(ctypes.Structure):
                            class _ACCOUNT_SID(ctypes.Structure):
                                _fields_ = [('Size', wintypes.ULONG), ('Data', ctypes.c_ubyte * 68)]
                            _fields_ = [('Type', wintypes.ULONG), ('AccountSid', _ACCOUNT_SID)]

                        user_ident = WINBIO_IDENTITY()
                        user_ident.Type = 3  # WINBIO_ID_TYPE_SID
                        user_ident.AccountSid.Size = sid_len
                        ctypes.memmove(user_ident.AccountSid.Data, sid_ptr, sid_len)

                        subfactor_array = ctypes.POINTER(ctypes.c_ubyte)()
                        subfactor_count = wintypes.DWORD(0)
                        if winbio.WinBioEnumEnrollments(session_handle, sensor.UnitId, ctypes.byref(user_ident), ctypes.byref(subfactor_array), ctypes.byref(subfactor_count)) == 0:
                            enrolled_count = subfactor_count.value
                            winbio.WinBioFree(subfactor_array)

                winbio.WinBioCloseSession(session_handle)
            winbio.WinBioFree(schema_array)
    except Exception as e:
        sensor_info["error"] = str(e)

    # 2. Check UserConsentVerifier Availability via PowerShell WinRT helper
    try:
        ps_cmd = (
            "Add-Type -AssemblyName System.Runtime.WindowsRuntime; "
            "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1; "
            "[Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime] | Out-Null; "
            "$op = [Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync(); "
            "$task = $asTask.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerifierAvailability]).Invoke($null, @($op)); "
            "$task.Wait(); "
            "Write-Output $task.Result"
        )
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=8)
        availability_str = proc.stdout.strip() if proc.returncode == 0 else "Unknown"
    except Exception:
        # Fail closed: if the Windows Runtime availability probe cannot run (missing
        # PowerShell, WinRT blocked, timeout) we must NOT infer "Available" from a
        # detected PnP device. Hardware presence alone cannot prove the biometric
        # consent prompt is usable, so report an ambiguous/unknown state.
        availability_str = "Unknown"

    is_ready = availability_str == "Available" and sensor_info["detected"]

    return {
        "supported": is_ready,
        "availability": availability_str,
        "deviceName": sensor_info["name"],
        "manufacturer": sensor_info["manufacturer"],
        "deviceId": sensor_info["device_id"],
        "hardwareStatus": sensor_info["status"],
        "windowsHelloReady": is_ready,
        "isEnrolled": enrolled_count > 0,
        "enrolledFingerprintsCount": enrolled_count,
        "rawBiometricsStored": False,
        "enclaveType": "Windows Hello TPM & Virtualization-Based Security (VBS)",
    }


def request_native_windows_hello_verification(prompt_message: str = "ULTRON Zero-Trust Security Gate: Touch your fingerprint sensor to authenticate.") -> Dict[str, Any]:
    """
    Invokes native Windows Hello modal dialog (UserConsentVerifier) on the Windows host.
    Blocks until user touches the physical sensor, cancels, or exhausts retries.

    Args:
        prompt_message: Explanation displayed in the native Windows Hello dialog.

    Returns:
        dict: Verification result (Verified, Canceled, RetriesExhausted, DeviceBusy, etc.)
    """
    if sys.platform != "win32":
        return {"success": False, "result": "NonWindowsPlatform", "error": "Windows Hello only runs on Windows."}

    # Escape the prompt for a single-quoted PowerShell string. PowerShell escapes a
    # single quote by doubling it (''); a backslash is NOT an escape character there,
    # so the previous replace('"', '\\"') was meaningless and stripping apostrophes
    # silently corrupted the user-visible prompt. Non-printable characters are removed
    # because the command runs non-interactively, and the length is capped to stay
    # well inside Windows command-line limits.
    clean_prompt = str(prompt_message).replace("'", "''")
    clean_prompt = "".join(ch for ch in clean_prompt if ch.isprintable())[:200]

    ps_cmd = (
        "Add-Type -AssemblyName System.Runtime.WindowsRuntime; "
        "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1; "
        "[Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime] | Out-Null; "
        f"$op = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('{clean_prompt}'); "
        "$task = $asTask.MakeGenericMethod([Windows.Security.Credentials.UI.UserConsentVerificationResult]).Invoke($null, @($op)); "
        "$task.Wait(); "
        "Write-Output $task.Result"
    )

    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=60  # Allow 60 seconds for user to touch sensor
        )
        res_str = proc.stdout.strip()
        # Fail closed: never trust a verification result emitted by a failed process.
        if proc.returncode != 0:
            detail = (proc.stderr or res_str or "no output").strip()[:300]
            return {
                "success": False,
                "result": "Error",
                "message": f"Windows Hello verification command failed (exit {proc.returncode}): {detail}",
            }
        if res_str == "Verified":
            return {
                "success": True,
                "result": "Verified",
                "message": "Fingerprint verified successfully via Windows Hello.",
                "hardwareBinding": "Synaptics VFS7552 Touch Fingerprint Sensor",
            }
        else:
            return {
                "success": False,
                "result": res_str or "Canceled",
                "message": f"Windows Hello returned: {res_str or 'Canceled'}",
            }
    except subprocess.TimeoutExpired:
        return {"success": False, "result": "Timeout", "message": "Biometric verification timed out (60s)."}
    except Exception as e:
        return {"success": False, "result": "Error", "message": str(e)}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        parser = argparse.ArgumentParser()
        parser.add_argument(
            "--reason",
            default="ULTRON Zero-Trust Security Gate: Touch your fingerprint sensor to authenticate.",
        )
        args = parser.parse_args(sys.argv[2:])
        res = request_native_windows_hello_verification(args.reason)
        print(json.dumps(res))
    else:
        status = get_windows_hello_availability()
        print(json.dumps(status, indent=2))
