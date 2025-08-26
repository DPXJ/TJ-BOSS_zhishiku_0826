// Vercel serverless function for Feishu API proxy
export default async function handler(req, res) {
    // 设置CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 允许常见方法：GET/POST/PATCH/PUT/DELETE
    const allowedMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    if (!allowedMethods.includes(req.method)) {
        return res.status(405).json({
            error: 'Method not allowed',
            allowedMethods
        });
    }

    try {
        // 从URL查询参数获取path
        const { path } = req.query;
        
        console.log('🔍 Proxy Request Details:', {
            method: req.method,
            path: path,
            query: req.query,
            hasBody: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : []
        });
        
        if (!path) {
            console.log('❌ Missing path parameter');
            return res.status(400).json({ 
                error: 'Missing path parameter',
                received: req.query 
            });
        }

        // 构建飞书API URL
        const feishuUrl = `https://open.feishu.cn/open-apis/${path}`;
        
        // 准备请求头
        const requestHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'Boss-Knowledge-Base/1.0'
        };
        
        // 转发Authorization头
        if (req.headers.authorization) {
            requestHeaders['Authorization'] = req.headers.authorization;
        }
        
        console.log('🚀 Feishu API Proxy Request:', {
            method: req.method,
            url: feishuUrl,
            headers: requestHeaders,
            bodyType: typeof req.body,
            body: req.body
        });

        // 组装请求选项，转发真实方法与请求体
        const forwardOptions = {
            method: req.method,
            headers: requestHeaders
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            forwardOptions.body = req.body ? JSON.stringify(req.body) : undefined;
        }

        // 转发到飞书API
        const response = await fetch(feishuUrl, forwardOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ Feishu API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            return res.status(response.status).json({
                error: 'Feishu API Error',
                status: response.status,
                message: errorText
            });
        }

        const responseData = await response.json();
        
        console.log('📥 Feishu API Response:', {
            status: response.status,
            statusText: response.statusText,
            code: responseData.code,
            msg: responseData.msg
        });

        // 返回飞书API的响应
        res.status(response.status).json(responseData);
        
    } catch (error) {
        console.error('❌ Feishu API Proxy Error:', error);
        res.status(500).json({
            error: 'Feishu API proxy error',
            message: error.message,
            details: error.stack
        });
    }
}
