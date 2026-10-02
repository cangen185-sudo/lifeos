$ErrorActionPreference = 'Stop'
$logsDir = Join-Path $env:LOCALAPPDATA 'LifeOS\logs'
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$logName = 'launcher-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID + '.log'
$logFile = Join-Path $logsDir $logName
try {
  & (Join-Path $PSScriptRoot 'Start-LifeOS.ps1') *> $logFile
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile -Encoding UTF8
  exit 1
}
