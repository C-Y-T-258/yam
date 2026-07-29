param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'set-version.cjs'
$arguments = @($scriptPath)
if ($DryRun) { $arguments += '--dry-run' }
$arguments += $Version

& node @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
