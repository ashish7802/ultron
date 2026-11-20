<#
.SYNOPSIS
    ULTRON Safe System RAM Optimizer & Working Set Compactor

.DESCRIPTION
    Module Name: ULTRON RAM Optimizer
    Purpose: Safely frees memory on Windows 10/11 systems by terminating non-essential
             background daemons (like Copilot background runtime processes) and calling
             Windows API EmptyWorkingSet on idle host processes.
    Subsystem: System Optimization & Performance Tuning.

    Safety / Security Guarantees:
    - Never terminates user IDE (VS Code), shell, browser tabs, or active editor.
    - Flushes idle OS and service working sets back to system pool.
    - Triggers .NET CLR Garbage Collection.
#>

[CmdletBinding()]
param(
    [switch]$Detailed
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ULTRON System RAM Optimizer & Cleaner   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Capture Initial State
$osBefore = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($osBefore.TotalVisibleMemorySize / 1MB, 2)
$freeBeforeGB = [math]::Round($osBefore.FreePhysicalMemory / 1MB, 2)
$usedBeforeGB = [math]::Round($totalGB - $freeBeforeGB, 2)

Write-Host "Initial System Memory:"
Write-Host "  Total RAM: $totalGB GB"
Write-Host "  Used RAM:  $usedBeforeGB GB"
Write-Host "  Free RAM:  $freeBeforeGB GB"
Write-Host ""

# 2. Terminate Non-Essential Background Bloatware
$unneededProcesses = @(
    "copilotapp",
    "copilotapphost",
    "copilot-runtime"
)

$stoppedCount = 0
foreach ($proc in $unneededProcesses) {
    Get-Process -Name $proc -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "-> Halting background daemon: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Yellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        $stoppedCount++
    }
}

# 3. Define Win32 EmptyWorkingSet API
$win32MemoryCleaner = @"
using System;
using System.Runtime.InteropServices;

public class Win32MemoryCleaner {
    [DllImport("psapi.dll", SetLastError = true)]
    public static extern int EmptyWorkingSet(IntPtr hwProc);

    public static void FlushWorkingSet(IntPtr handle) {
        try {
            EmptyWorkingSet(handle);
        } catch {}
    }
}
"@

try {
    Add-Type -TypeDefinition $win32MemoryCleaner -ErrorAction SilentlyContinue
} catch {}

# 4. Flush idle working sets for safe system host processes
$safeToFlush = @(
    "explorer",
    "TextInputHost",
    "SearchHost",
    "StartMenuExperienceHost",
    "svchost"
)

Write-Host "-> Compacting idle system process working sets..." -ForegroundColor Gray
Get-Process | Where-Object { $safeToFlush -contains $_.ProcessName } | ForEach-Object {
    try {
        [Win32MemoryCleaner]::FlushWorkingSet($_.Handle)
    } catch {}
}

# 5. Invoke Garbage Collection
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# 6. Report Recovered Memory
Start-Sleep -Milliseconds 800
$osAfter = Get-CimInstance Win32_OperatingSystem
$freeAfterGB = [math]::Round($osAfter.FreePhysicalMemory / 1MB, 2)
$usedAfterGB = [math]::Round($totalGB - $freeAfterGB, 2)
$freedMB = [math]::Round(($freeAfterGB - $freeBeforeGB) * 1024, 0)

Write-Host ""
Write-Host "Optimization Results:" -ForegroundColor Green
Write-Host "  Free RAM Before: $freeBeforeGB GB"
Write-Host "  Free RAM After:  $freeAfterGB GB" -ForegroundColor Green
if ($freedMB -gt 0) {
    Write-Host "  Memory Recovered: ~$freedMB MB" -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Cyan
