@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0ACTUALIZAR.ps1"
echo.
pause
