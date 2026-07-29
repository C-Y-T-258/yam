param(
    [switch]$SkipTests,
    [string]$Version,
    [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\staging'),
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktopDir = Join-Path $root 'yam-desktop'
$packageJson = Get-Content (Join-Path $desktopDir 'package.json') -Raw | ConvertFrom-Json
$projectVersion = [string]$packageJson.version
$normalizedVersion = if ($Version) { $Version -replace '^v', '' } else { $projectVersion }

if ($normalizedVersion -ne $projectVersion) {
    throw "Requested version $normalizedVersion does not match project version $projectVersion"
}

Write-Host '[release] Checking project versions'
& node (Join-Path $PSScriptRoot 'check-version.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($DryRun) {
    if (-not $SkipTests) { Write-Host '[release] DRY RUN: npm run test:release:auto' }
    Write-Host '[release] DRY RUN: scripts/build-python-backend.ps1'
    Write-Host '[release] DRY RUN: npm exec tauri build -- --bundles nsis,msi'
    Write-Host "[release] DRY RUN: stage Windows $normalizedVersion artifacts in $OutputDir"
    Write-Host '[release] DRY RUN complete; no files changed'
    exit 0
}

if (-not $SkipTests) {
    Write-Host '[release] Running release gate'
    Push-Location $desktopDir
    try {
        & npm run 'test:release:auto'
        if ($LASTEXITCODE -ne 0) { throw "Release gate failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

Write-Host '[release] Building bundled Python backend'
& (Join-Path $PSScriptRoot 'build-python-backend.ps1')
if ($LASTEXITCODE -ne 0) { throw "Python backend build failed with exit code $LASTEXITCODE" }
$backendExe = Join-Path $desktopDir 'src-tauri\resources\yam-backend.exe'
if (-not (Test-Path $backendExe -PathType Leaf) -or (Get-Item $backendExe).Length -eq 0) {
    throw "Missing or empty Python backend: $backendExe"
}

Write-Host '[release] Building NSIS and MSI bundles'
Push-Location $desktopDir
try {
    & npm run tauri -- build --bundles 'nsis,msi'
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$targetRelease = Join-Path $desktopDir 'src-tauri\target\release'
$portablePath = Join-Path $targetRelease 'yam-desktop.exe'
$nsis = Get-ChildItem (Join-Path $targetRelease 'bundle\nsis\*.exe') -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
$msi = Get-ChildItem (Join-Path $targetRelease 'bundle\msi\*.msi') -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1

if (-not (Test-Path $portablePath -PathType Leaf)) { throw "Missing portable artifact: $portablePath" }
if (-not $nsis) { throw 'Missing NSIS artifact under bundle/nsis' }
if (-not $msi) { throw 'Missing MSI artifact under bundle/msi' }

if (Test-Path $OutputDir) {
    Get-ChildItem $OutputDir -Force | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$artifacts = @(
    @{ Source = $nsis.FullName; Name = "YAM-Setup-$normalizedVersion.exe"; Description = 'NSIS installer' },
    @{ Source = $msi.FullName; Name = "YAM-Setup-$normalizedVersion.msi"; Description = 'MSI installer' },
    @{ Source = $portablePath; Name = "YAM-Portable-$normalizedVersion.exe"; Description = 'Portable executable' }
)

foreach ($artifact in $artifacts) {
    $destination = Join-Path $OutputDir $artifact.Name
    Copy-Item $artifact.Source $destination -Force
    if ((Get-Item $destination).Length -eq 0) { throw "Artifact is empty: $destination" }
}

$checksumLines = foreach ($artifact in $artifacts) {
    $destination = Join-Path $OutputDir $artifact.Name
    $hash = (Get-FileHash $destination -Algorithm SHA256).Hash
    $line = "$hash  $($artifact.Name)"
    Set-Content -Path "$destination.sha256" -Value $line -Encoding ascii
    $line
}
Set-Content -Path (Join-Path $OutputDir 'checksums.txt') -Value $checksumLines -Encoding ascii

$templatePath = Join-Path $root 'release\RELEASE-NOTES.template.md'
if (-not (Test-Path $templatePath)) { throw "Missing release notes template: $templatePath" }
$artifactRows = ($artifacts | ForEach-Object {
    $size = (Get-Item (Join-Path $OutputDir $_.Name)).Length
    "| $($_.Name) | $($_.Description) | $size bytes |"
}) -join "`n"
$notes = (Get-Content $templatePath -Raw).
    Replace('{{VERSION}}', $normalizedVersion).
    Replace('{{DATE}}', (Get-Date -Format 'yyyy-MM-dd')).
    Replace('{{ARTIFACT_ROWS}}', $artifactRows).
    Replace('{{CHECKSUMS}}', ($checksumLines -join "`n"))
Set-Content -Path (Join-Path $OutputDir 'RELEASE-NOTES.md') -Value $notes -Encoding utf8

foreach ($requiredName in @('checksums.txt', 'RELEASE-NOTES.md')) {
    $requiredPath = Join-Path $OutputDir $requiredName
    if (-not (Test-Path $requiredPath) -or (Get-Item $requiredPath).Length -eq 0) {
        throw "Missing or empty output: $requiredPath"
    }
}

Write-Host "[release] Windows $normalizedVersion artifacts staged in $OutputDir"
