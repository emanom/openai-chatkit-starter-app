@echo off
echo Killing all Node.js processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Starting dev server with clean environment...
cd /d "%~dp0"
npm run dev

