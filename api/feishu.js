// 飞书API代理 - 简化版本
export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed',
            allowed: 'POST'
        });
    }

    try {
        const { path } = req.query;
        
        if (!path) {
            return res.status(400).json({
                error: 'Missing path parameter'
            });
        }

        // 构建飞书API URL
        const url = `https://open.feishu.cn/open-apis/${path}`;
        
        console.log('Feishu API call:', {
            url,
            body: req.body
        });

        // 调用飞书API
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && {
                    'Authorization': req.headers.authorization
                })
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        
        console.log('Feishu API response:', {
            status: response.status,
            data
        });

        return res.status(response.status).json(data);

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({
            error: 'Proxy error',
            message: error.message
        });
    }
}
