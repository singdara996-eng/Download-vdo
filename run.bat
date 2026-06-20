@echo off
title VeloYT - Starting YouTube Downloader...
echo ====================================================
echo             VeloYT YouTube Downloader
echo ====================================================
echo.
echo Checking dependencies...
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Pip failed to verify requirements.
    echo Attempting to launch the application anyway...
    echo.
)
echo.
echo Starting Flask Server...
echo Your browser should open automatically. If it doesn't, navigate to http://localhost:5000
echo.
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application failed to start.
    echo Please make sure Python is installed and added to your PATH.
    echo.
)
pause
