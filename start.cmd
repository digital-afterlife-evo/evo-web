@echo off
setlocal
title Digital Afterlife - Web
pushd "%~dp0" || exit /b 1
echo Start evo-backend\start.cmd first. Website: http://127.0.0.1:5173
call npm.cmd run dev -- %*
set "START_EXIT=%ERRORLEVEL%"
echo.
echo Web server stopped. Exit code: %START_EXIT%
pause
popd
exit /b %START_EXIT%
