@echo off
echo 启动飞书API代理服务器...
echo 请确保已安装 Node.js 和相关依赖包

:: 检查node_modules是否存在
if not exist "node_modules" (
    echo 正在安装依赖包...
    npm install express cors node-fetch
)

:: 启动代理服务器
echo 启动代理服务器在端口 3002...
node feishu-proxy-server.js

pause
