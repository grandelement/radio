@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create-Everything.ps1"
pause

echo.
echo ---------------------------------------------
echo   Finished. Opening the run.log for details.
echo ---------------------------------------------
echo.
pause
notepad "%~dp0run.log"
