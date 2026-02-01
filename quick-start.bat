@echo off
echo ========================================
echo    OpenCode Web 快速启动脚本
echo ========================================
echo.
echo [1] 检查 opencode serve 是否已启动...
netstat -ano | findstr ":4096" | findstr "LISTENING" >nul
if %errorlevel% == 0 (
    echo [OK] opencode serve 已运行在端口 4096
) else (
    echo [WARN] opencode serve 未运行
    echo.
    echo [2] 请在另一个终端窗口中运行以下命令启动 opencode serve:
    echo     opencode serve --port 4096 --hostname localhost
    echo.
    echo [3] 然后按任意键继续启动 Web 服务器...
    pause
)
echo.
echo [4] 启动 Web 服务器...
node server.js
echo.
echo ========================================
echo.
echo Web 服务器: http://localhost:3000
echo OpenCode serve: http://localhost:4096
echo ========================================
echo.
echo 按 Ctrl+C 停止 Web 服务器
echo.
echo 注意: opencode serve 需要单独停止 (Ctrl+C)
echo ========================================
pause
