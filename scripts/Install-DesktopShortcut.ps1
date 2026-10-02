$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$launcher = Join-Path $projectRoot 'Open-LifeOS.vbs'
if (-not (Test-Path -LiteralPath $launcher)) { throw 'LifeOS silent launcher is missing.' }
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path -LiteralPath $desktop)) { throw 'Windows desktop folder is missing.' }
$shortcutPath = Join-Path $desktop 'LifeOS.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
  $backup = $shortcutPath + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak'
  Copy-Item -LiteralPath $shortcutPath -Destination $backup
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'LifeOS - local tasks and growth reviews'
$shortcut.IconLocation = (Join-Path $env:WINDIR 'System32\shell32.dll') + ',167'
$shortcut.WindowStyle = 7
$shortcut.Save()
$check = $shell.CreateShortcut($shortcutPath)
if ($check.TargetPath -ne $shortcut.TargetPath -or $check.Arguments -ne $shortcut.Arguments -or $check.WorkingDirectory -ne $projectRoot) { throw 'Desktop shortcut verification failed.' }
Write-Output "Desktop shortcut: $shortcutPath"
