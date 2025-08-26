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

    try {
        // 获取请求参数
        const { path, _headers = {}, ...requestData } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        // 构建飞书API URL
        const feishuUrl = `https://open.feishu.cn${path}`;
        
        // 准备请求头，优先使用_headers中的内容
        const requestHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'Boss-Knowledge-Base/1.0',
            ..._headers,
            // 转发其他必要的headers
            ...(req.headers.authorization && { 'Authorization': req.headers.authorization }),
            ...(req.headers['x-lark-signature'] && { 'X-Lark-Signature': req.headers['x-lark-signature'] }),
            ...(req.headers['x-lark-request-timestamp'] && { 'X-Lark-Request-Timestamp': req.headers['x-lark-request-timestamp'] }),
            ...(req.headers['x-lark-request-nonce'] && { 'X-Lark-Request-Nonce': req.headers['x-lark-request-nonce'] })
        };
        
        console.log('🚀 Feishu API Proxy Request:', {
            method: req.method,
            url: feishuUrl,
            headers: requestHeaders,
            body: requestData
        });

        // 转发请求到飞书API
        const response = await fetch(feishuUrl, {
            method: req.method,
            headers: requestHeaders,
            body: req.method !== 'GET' ? JSON.stringify(requestData) : undefined
        });

        const responseData = await response.json();
        
        console.log('📥 Feishu API Response:', {
            status: response.status,
            statusText: response.statusText,
            data: responseData
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
