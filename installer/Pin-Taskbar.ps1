$ErrorActionPreference = "Stop"

$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$shortcut = Get-ChildItem -LiteralPath $programs -Filter "ULTRON.lnk" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
$taskbar = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
$pinnedShortcut = Join-Path $taskbar "ULTRON.lnk"

if (Test-Path -LiteralPath $pinnedShortcut) {
    exit 0
}
if (-not $shortcut) {
    Write-Error "Could not find the ULTRON Start Menu shortcut."
    exit 1
}

$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace($shortcut.DirectoryName)
$item = $folder.ParseName($shortcut.Name)
$pinVerb = $item.Verbs() |
    Where-Object { $_.Name.Replace("&", "") -match "Pin to taskbar" } |
    Select-Object -First 1

if (-not $pinVerb) {
    Write-Error "Windows did not offer the Pin to taskbar action."
    exit 1
}

$pinVerb.DoIt()
Start-Sleep -Seconds 2
if (-not (Test-Path -LiteralPath $pinnedShortcut)) {
    Write-Error "Windows did not create the ULTRON taskbar pin."
    exit 1
}
