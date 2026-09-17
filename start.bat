@echo off
cd /d "%~dp0"
echo [sshterm] starting on http://localhost:1070
node server\index.js
