@echo off
cd /d "%~dp0opencode-web"

echo 步骤 1: 导入 OpenCode 历史会话...
node import_history.js

echo.
echo 步骤 2: 启动 Web 服务器...
node server.js

pause
