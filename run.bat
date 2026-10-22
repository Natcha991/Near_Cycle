@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_and_run.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Script failed with error code %ERRORLEVEL%.
)
echo.
echo Press any key to close this window...
pause >nul
