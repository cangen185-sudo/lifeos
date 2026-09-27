@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-LifeOS.ps1"
if errorlevel 1 (
  echo.
  echo LifeOS could not start. See the error above.
  pause
)
endlocal
