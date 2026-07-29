param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$resourcesDir = Join-Path $root 'yam-desktop\src-tauri\resources'
$workDir = Join-Path $root 'build\pyinstaller'
$venvDir = Join-Path $root 'build\python-backend-venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$output = Join-Path $resourcesDir 'yam-backend.exe'
$majorsData = Join-Path $root 'data\majors.yaml'

if (-not (Test-Path $venvPython -PathType Leaf)) {
    Write-Host '[python-backend] Creating isolated build environment'
    & python -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw "Virtual environment creation failed with exit code $LASTEXITCODE" }
}
if (-not $SkipInstall) {
    Write-Host '[python-backend] Installing build dependencies in isolated environment'
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed with exit code $LASTEXITCODE" }
    & $venvPython -m pip install '.[dynamic]' pyinstaller
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed with exit code $LASTEXITCODE" }
}

New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

Write-Host '[python-backend] Building yam-backend.exe'
Push-Location $root
try {
    & $venvPython -m PyInstaller `
        --onefile `
        --clean `
        --noconfirm `
        --name yam-backend `
        --distpath $resourcesDir `
        --workpath $workDir `
        --specpath $workDir `
        --add-data "$majorsData;data" `
        --collect-all playwright `
        --hidden-import yam.scripts.sync_to_tauri `
        --hidden-import yam.scripts.update_majors_catalog `
        --hidden-import yam.crawler.dynamic `
        --hidden-import yam.majors_searcher `
        'yam/backend_entry.py'
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

if (-not (Test-Path $output -PathType Leaf) -or (Get-Item $output).Length -eq 0) {
    throw "Missing or empty Python backend: $output"
}
Write-Host "[python-backend] Built $output ($((Get-Item $output).Length) bytes)"
