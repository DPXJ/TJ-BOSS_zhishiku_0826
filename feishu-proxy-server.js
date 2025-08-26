const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3002;

// 启用CORS和JSON解析
app.use(cors());
app.use(express.json());

// 飞书API代理路由
app.all('/feishu-proxy/*', async (req, res) => {
    try {
        // 提取实际的API路径
        const apiPath = req.path.replace('/feishu-proxy/', '');
        const feishuUrl = `https://open.feishu.cn/open-apis/${apiPath}`;
        
        console.log(`🔄 代理请求: ${req.method} ${feishuUrl}`);
        console.log('📋 请求头:', req.headers);
        console.log('📋 请求体:', req.body);
        
        // 构建请求选项
        const requestOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            }
        };
        
        // 如果有请求体，添加到选项中
        if (req.method !== 'GET' && req.body) {
            requestOptions.body = JSON.stringify(req.body);
        }
        
        // 发送请求到飞书API
        const response = await fetch(feishuUrl, requestOptions);
        const data = await response.json();
        
        console.log('📡 飞书API响应:', {
            status: response.status,
            statusText: response.statusText,
            data
        });
        
        // 返回响应
        res.status(response.status).json(data);
        
    } catch (error) {
        console.error('❌ 代理服务器错误:', error);
        res.status(500).json({
            code: -1,
            msg: `代理服务器错误: ${error.message}`
        });
    }
});

// 健康检查路由
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: '飞书代理服务器运行正常' });
});

app.listen(PORT, () => {
    console.log(`🚀 飞书代理服务器启动成功`);
    console.log(`📡 监听端口: ${PORT}`);
    console.log(`🔗 健康检查: http://localhost:${PORT}/health`);
    console.log(`🔗 代理地址: http://localhost:${PORT}/feishu-proxy/*`);
});
