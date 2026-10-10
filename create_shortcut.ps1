param([string]$target, [string]$linkPath, [string]$iconPath, [string]$args = '')
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($linkPath)
$shortcut.TargetPath = $target
$shortcut.Arguments = $args
$shortcut.WorkingDirectory = Split-Path -Parent $target
if ($iconPath -and (Test-Path $iconPath)) {
    $shortcut.IconLocation = $iconPath
}
$shortcut.Save()
