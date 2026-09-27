$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localRoot = Join-Path $env:LOCALAPPDATA 'LifeOS'
$profileDir = Join-Path $localRoot 'BrowserProfile'
$logsDir = Join-Path $localRoot 'logs'
$browserChoice = Join-Path $localRoot 'browser-path.txt'
$serverScript = Join-Path $projectRoot 'scripts\lifeos-local-server.mjs'
$distIndex = Join-Path $projectRoot 'dist\index.html'
$expectedDataFile = Join-Path $localRoot 'data\lifeos-backup.json'
$serverUrl = 'http://127.0.0.1:4179/'
$statusUrl = $serverUrl + 'api/status'

New-Item -ItemType Directory -Path $profileDir, $logsDir -Force | Out-Null

$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

if (Test-Path -LiteralPath $browserChoice) {
  $browser = (Get-Content -LiteralPath $browserChoice -Raw -Encoding UTF8).Trim()
  if (-not (Test-Path -LiteralPath $browser)) {
    throw "The previously selected browser is missing: $browser. Browser profile was not switched."
  }
} else {
  $candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )
  $browser = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $browser) { throw 'Chrome or Edge was not found.' }
  Set-Content -LiteralPath $browserChoice -Value $browser -Encoding UTF8
}

$sourceFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -File -Recurse)
foreach ($relativePath in @('index.html', 'vite.config.ts', 'package-lock.json')) {
  $sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot $relativePath)
}
if (Test-Path -LiteralPath (Join-Path $projectRoot 'public')) {
  $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public') -File -Recurse
}
$latestSource = $sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not (Test-Path -LiteralPath $distIndex) -or
    $latestSource.LastWriteTimeUtc -gt (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc) {
  $buildLog = Join-Path $logsDir 'build.log'
  Push-Location $projectRoot
  try {
    & $npm run build *> $buildLog
    if ($LASTEXITCODE -ne 0) {
      throw "LifeOS build failed. See $buildLog"
    }
  } finally {
    Pop-Location
  }
}

function Get-LifeOSStatus {
  try {
    $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
    if ($status.appId -ne 'lifeos-local-file-v1' -or
        $status.projectDir -ne $projectRoot -or
        $status.dataFile -ne $expectedDataFile) {
      throw 'Port 4179 has a different service or data directory. Close that service first.'
    }
    return $status
  } catch [System.Net.WebException] {
    return $null
  }
}

$status = Get-LifeOSStatus
if (-not $status) {
  $listening = Get-NetTCPConnection -LocalPort 4179 -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw 'Port 4179 is occupied. No second server was started.' }

  $stdout = Join-Path $logsDir 'server.stdout.log'
  $stderr = Join-Path $logsDir 'server.stderr.log'
  $arguments = @('"' + $serverScript + '"', '4179')
  Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $projectRoot `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $status = Get-LifeOSStatus
    if ($status) { break }
  }
  if (-not $status) { throw "LifeOS local server failed to start. See $stderr" }
}

$profileArgument = '--user-data-dir="' + $profileDir + '"'
$appArgument = '--app="' + $serverUrl + '"'
Start-Process -FilePath $browser -ArgumentList @($profileArgument, $appArgument, '--no-first-run')
Write-Host "LifeOS opened: $serverUrl"
Write-Host "Data file: $($status.dataFile)"
Write-Host "Browser profile: $profileDir"
