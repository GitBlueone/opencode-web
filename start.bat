@echo off
REM OpenCode Web 管理界面启动脚本

echo.
echo ========================================
echo   OpenCode Web 管理界面
echo ========================================
echo.

REM 检查 node 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败！
        pause
        exit /b 1
    )
    echo.
)

echo 正在启动服务器...
echo.
echo 提示: 按 Ctrl + C 停止服务器
echo.

node server.js

pause
