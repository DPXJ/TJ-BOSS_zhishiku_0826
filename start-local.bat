@echo off
echo ========================================
echo 🚀 启动本地开发环境
echo ========================================

echo.
echo 📋 检查Node.js环境...
node --version
if %errorlevel% neq 0 (
    echo ❌ Node.js未安装，请先安装Node.js
    pause
    exit /b 1
)

echo.
echo 📦 安装依赖包...
npm install

echo.
echo 🔧 启动FastGPT SDK风格服务器...
start "FastGPT SDK Server" cmd /k "npm run start:sdk"

echo.
echo ⏳ 等待服务器启动...
timeout /t 3 /nobreak > nul

echo.
echo 📡 启动飞书代理服务器...
start "Feishu Proxy Server" cmd /k "node feishu-proxy-server.js"

echo.
echo ⏳ 等待飞书代理服务器启动...
timeout /t 2 /nobreak > nul

echo.
echo 🌐 启动HTTP服务器...
start "HTTP Server" cmd /k "python -m http.server 8080"

echo.
echo ✅ 本地环境启动完成！
echo.
echo 📍 访问地址：
echo   主页面: http://localhost:8080
echo   FastGPT服务器: http://localhost:3001
echo   健康检查: http://localhost:3001/health
echo.
echo 💡 提示：
echo   - 确保3001端口未被占用
echo   - 如果Python未安装，请手动启动HTTP服务器
echo   - 本地环境会自动使用localhost:3001的API
echo.
pause
