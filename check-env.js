// 环境配置检查脚本
const http = require('http');

console.log('🔍 检查本地环境配置...\n');

// 检查FastGPT服务器
function checkFastGPTServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3001,
            path: '/health',
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('✅ FastGPT SDK服务器运行正常');
                    console.log('   📍 地址: http://localhost:3001');
                    console.log('   🔧 配置:', response.config);
                    resolve(true);
                } catch (e) {
                    console.log('⚠️  FastGPT服务器响应格式异常');
                    console.log('   📝 响应:', data);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.log('❌ FastGPT SDK服务器未运行');
            console.log('   💡 请运行: npm run start:sdk');
            resolve(false);
        });

        req.setTimeout(5000, () => {
            console.log('⏰ FastGPT SDK服务器响应超时');
            resolve(false);
        });

        req.end();
    });
}

// 检查HTTP服务器
function checkHTTPServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/',
            method: 'GET'
        }, (res) => {
            console.log('✅ HTTP服务器运行正常');
            console.log('   📍 地址: http://localhost:8080');
            resolve(true);
        });

        req.on('error', (err) => {
            console.log('❌ HTTP服务器未运行');
            console.log('   💡 请运行: python -m http.server 8080');
            resolve(false);
        });

        req.setTimeout(5000, () => {
            console.log('⏰ HTTP服务器响应超时');
            resolve(false);
        });

        req.end();
    });
}

// 检查飞书代理服务器
function checkFeishuProxyServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3002,
            path: '/health',
            method: 'GET'
        }, (res) => {
            console.log('✅ 飞书代理服务器运行正常');
            console.log('   📍 地址: http://localhost:3002');
            resolve(true);
        });

        req.on('error', (err) => {
            console.log('❌ 飞书代理服务器未运行');
            console.log('   💡 请运行: node feishu-proxy-server.js');
            resolve(false);
        });

        req.setTimeout(5000, () => {
            console.log('⏰ 飞书代理服务器响应超时');
            resolve(false);
        });

        req.end();
    });
}

// 检查端口占用
function checkPorts() {
    const net = require('net');
    
    function checkPort(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, () => {
                server.close();
                resolve(true);
            });
            server.on('error', () => {
                resolve(false);
            });
        });
    }

    return Promise.all([
        checkPort(3001),
        checkPort(3002),
        checkPort(8080)
    ]);
}

async function main() {
    console.log('📋 检查端口占用...');
    const [port3001, port3002, port8080] = await checkPorts();
    
    if (!port3001) {
        console.log('⚠️  端口3001被占用');
    } else {
        console.log('✅ 端口3001可用');
    }
    
    if (!port3002) {
        console.log('⚠️  端口3002被占用');
    } else {
        console.log('✅ 端口3002可用');
    }
    
    if (!port8080) {
        console.log('⚠️  端口8080被占用');
    } else {
        console.log('✅ 端口8080可用');
    }

    console.log('\n📋 检查服务状态...');
    await checkFastGPTServer();
    await checkFeishuProxyServer();
    await checkHTTPServer();

    console.log('\n📋 环境配置总结:');
    console.log('   🌐 本地环境: http://localhost:8080');
    console.log('   🔧 FastGPT API: http://localhost:3001');
    console.log('   📡 飞书代理: http://localhost:3002');
    console.log('   📡 线上环境: Vercel部署');
    console.log('   🔑 API密钥: 已配置在代码中');
    console.log('   📋 工作流ID: 已配置在代码中');
    
    console.log('\n✅ 环境检查完成！');
}

main().catch(console.error);
