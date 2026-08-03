param(
    [ValidateSet('all', 'nsis', 'msi')]
    [string]$Bundle = 'all'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktopDir = Join-Path $root 'yam-desktop'

& (Join-Path $PSScriptRoot 'build-python-backend.ps1')
if ($LASTEXITCODE -ne 0) {
    throw "Python backend build failed with exit code $LASTEXITCODE"
}

Push-Location $desktopDir
try {
    if ($Bundle -eq 'all') {
        & npm run tauri -- build
    } else {
        & npm run tauri -- build --bundles $Bundle
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
