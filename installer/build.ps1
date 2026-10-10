$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$installerDir = $PSScriptRoot
$repoDir = Split-Path -Parent $installerDir
$payloadDir = Join-Path $installerDir "payload"
$buildDir = Join-Path $installerDir ".build"
$outputDir = Join-Path $installerDir "output"
$candidateDir = Join-Path $outputDir "candidate"
$certificateThumbprint = ($env:ULTRON_SIGN_CERT_SHA1 -replace '\s', '').ToUpperInvariant()
$timestampUrl = if ($env:ULTRON_TIMESTAMP_URL) {
    $env:ULTRON_TIMESTAMP_URL
} else {
    "https://timestamp.digicert.com"
}

if ($certificateThumbprint -notmatch '^[0-9A-F]{40}$') {
    throw @"
A trusted Authenticode code-signing certificate is required to build the installer.
Set ULTRON_SIGN_CERT_SHA1 to its 40-character certificate thumbprint and rerun.
Self-signed certificates are not accepted for Smart App Control signing.
"@
}

$signTool = if ($env:ULTRON_SIGNTOOL) { $env:ULTRON_SIGNTOOL } else { $null }
if (-not $signTool) {
    $signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Source -First 1
}
if (-not $signTool -or -not (Test-Path -LiteralPath $signTool)) {
    throw "SignTool is required. Install the Windows SDK or set ULTRON_SIGNTOOL to signtool.exe."
}

$certificatePath = "Cert:\CurrentUser\My\$certificateThumbprint"
$certificate = Get-Item -LiteralPath $certificatePath -ErrorAction SilentlyContinue
if (-not $certificate -or -not $certificate.HasPrivateKey) {
    throw "The selected CurrentUser\My certificate does not exist or has no accessible private key."
}
if ($certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) {
    throw "The selected code-signing certificate is not currently valid."
}
if ($certificate.EnhancedKeyUsageList.ObjectId.Value -notcontains "1.3.6.1.5.5.7.3.3") {
    throw "The selected certificate does not include the Code Signing EKU."
}
if ($certificate.Subject -eq $certificate.Issuer) {
    throw "A self-signed certificate cannot satisfy Smart App Control signing requirements."
}

$chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
try {
    if (-not $chain.Build($certificate)) {
        $chainIssues = $chain.ChainStatus |
            ForEach-Object { "$($_.Status): $($_.StatusInformation.Trim())" }
        throw "The signing certificate chain is not trusted: $($chainIssues -join '; ')"
    }
}
finally {
    $chain.Dispose()
}

if ((Resolve-Path $repoDir).Path -ne (Resolve-Path (Join-Path $PSScriptRoot "..")).Path) {
    throw "Installer build directory did not resolve to the repository root."
}
New-Item -ItemType Directory -Path $outputDir,$buildDir -Force | Out-Null
if (Test-Path -LiteralPath $candidateDir) {
    Remove-Item -LiteralPath $candidateDir -Recurse -Force
}
New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
if (Test-Path -LiteralPath $payloadDir) {
    Remove-Item -LiteralPath $payloadDir -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null

function Invoke-SignTool {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & $signTool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "SignTool failed with exit code $LASTEXITCODE."
    }
}

function Sign-And-VerifyPeFiles {
    param([Parameter(Mandatory)][string]$Directory)

    $peFiles = @(
        Get-ChildItem -LiteralPath $Directory -Recurse -File |
            Where-Object { $_.Extension -in ".exe", ".dll" }
    )
    $filesToSign = @(
        $peFiles | Where-Object {
            (Get-AuthenticodeSignature -FilePath $_.FullName).Status -ne "Valid"
        }
    )

    foreach ($file in $filesToSign) {
        Invoke-SignTool -Arguments @(
            "sign",
            "/s", "My",
            "/sha1", $certificateThumbprint,
            "/fd", "SHA256",
            "/tr", $timestampUrl,
            "/td", "SHA256",
            "/d", "ULTRON",
            $file.FullName
        )
    }

    foreach ($file in $peFiles) {
        $signature = Get-AuthenticodeSignature -FilePath $file.FullName
        if ($signature.Status -ne "Valid") {
            throw "Executable or DLL is not Authenticode-valid after signing: $($file.FullName)"
        }
        if ($filesToSign.FullName -contains $file.FullName -and
            $signature.SignerCertificate.Thumbprint -ne $certificateThumbprint) {
            throw "The newly signed file has the wrong signer: $($file.FullName)"
        }
        Invoke-SignTool -Arguments @("verify", "/pa", "/all", $file.FullName)
    }
    Write-Output "Authenticode verified $($peFiles.Count) executable/DLL files; signed $($filesToSign.Count)."
}

Push-Location $repoDir
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "Next.js production build failed with exit code $LASTEXITCODE."
    }

    $standaloneDir = Join-Path $repoDir ".next\standalone"
    if (-not (Test-Path (Join-Path $standaloneDir "server.js"))) {
        throw "Next.js standalone server output was not generated."
    }

    $serverPayload = Join-Path $payloadDir "server"
    Copy-Item -LiteralPath $standaloneDir -Destination $serverPayload -Recurse

    $staticSource = Join-Path $repoDir ".next\static"
    if (Test-Path $staticSource) {
        $staticDestination = Join-Path $serverPayload ".next\static"
        New-Item -ItemType Directory -Path $staticDestination -Force | Out-Null
        Copy-Item -Path (Join-Path $staticSource "*") -Destination $staticDestination -Recurse -Force
    }

    $python = (Get-Command python -ErrorAction Stop).Source
    $launcherDist = Join-Path $payloadDir "launcher"
    & $python -m PyInstaller --noconfirm --clean --onedir --windowed --name ULTRON --distpath $launcherDist --workpath (Join-Path $buildDir "launcher") --specpath (Join-Path $buildDir "spec") --collect-all webview --collect-all clr_loader --collect-all pythonnet --hidden-import clr launch_app.py
    if ($LASTEXITCODE -ne 0) {
        throw "Packaging the desktop launcher failed with exit code $LASTEXITCODE."
    }

    $sttDist = Join-Path $payloadDir "stt_server"
    & $python -m PyInstaller --noconfirm --clean --onedir --console --name stt_server --distpath $sttDist --workpath (Join-Path $buildDir "stt") --specpath (Join-Path $buildDir "spec") --collect-all faster_whisper --collect-all av --collect-all ctranslate2 --collect-all onnxruntime stt_server.py
    if ($LASTEXITCODE -ne 0) {
        throw "Packaging the transcription service failed with exit code $LASTEXITCODE."
    }

    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $nodePayload = Join-Path $payloadDir "node"
    New-Item -ItemType Directory -Path $nodePayload -Force | Out-Null
    Copy-Item -LiteralPath $nodePath -Destination (Join-Path $nodePayload "node.exe")

    Sign-And-VerifyPeFiles -Directory $payloadDir

    $iscc = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $iscc) {
        throw "Inno Setup 6 ISCC.exe was not found."
    }

    $environmentBeforeIscc = @{}
    foreach ($name in "ULTRON_SIGNTOOL", "ULTRON_SIGN_CERT_SHA1", "ULTRON_TIMESTAMP_URL") {
        $environmentBeforeIscc[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }
    try {
        $env:ULTRON_SIGNTOOL = $signTool
        $env:ULTRON_SIGN_CERT_SHA1 = $certificateThumbprint
        $env:ULTRON_TIMESTAMP_URL = $timestampUrl
        & $iscc (Join-Path $installerDir "ULTRON.iss") "/O$candidateDir"
        if ($LASTEXITCODE -ne 0) {
            throw "Inno Setup failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        foreach ($name in $environmentBeforeIscc.Keys) {
            [Environment]::SetEnvironmentVariable(
                $name,
                $environmentBeforeIscc[$name],
                "Process"
            )
        }
    }

    $candidateInstaller = Join-Path $candidateDir "ULTRON-Setup.exe"
    if (-not (Test-Path -LiteralPath $candidateInstaller)) {
        throw "Inno Setup did not produce the signed installer."
    }
    $setupSignature = Get-AuthenticodeSignature -FilePath $candidateInstaller
    if ($setupSignature.Status -ne "Valid") {
        throw "The final setup executable does not have a valid Authenticode signature."
    }
    if ($setupSignature.SignerCertificate.Thumbprint -ne $certificateThumbprint) {
        throw "The final setup executable was not signed by the configured certificate."
    }
    Invoke-SignTool -Arguments @("verify", "/pa", "/all", $candidateInstaller)

    $finalInstaller = Join-Path $outputDir "ULTRON-Setup.exe"
    Move-Item -LiteralPath $candidateInstaller -Destination $finalInstaller -Force
    Write-Output "Signed setup SHA256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $finalInstaller).Hash)"
    Write-Output "Installed signer: $((Get-AuthenticodeSignature -FilePath $finalInstaller).SignerCertificate.Subject)"
}
finally {
    if (Test-Path -LiteralPath $candidateDir) {
        Remove-Item -LiteralPath $candidateDir -Recurse -Force
    }
    Pop-Location
}

Write-Output "Trusted, signed installer created at: $(Join-Path $outputDir 'ULTRON-Setup.exe')"
