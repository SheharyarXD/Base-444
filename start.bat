@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies, this may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo npm install failed. Aborting.
        pause
        exit /b 1
    )
)

echo Starting Linked dev server...
echo Once it's running, open the URL it prints (usually http://localhost:5173) in your browser.
call npm run dev

pause
