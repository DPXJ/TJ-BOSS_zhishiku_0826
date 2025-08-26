// GitHub Pages版本 - 使用CORS代理服务
// 这个版本使用公共CORS代理服务解决跨域问题

const isLocalEnvironment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

// 使用CORS代理服务
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
const API_BASE = isLocalEnvironment ? 'http://localhost:3001/api/fastgpt' : `${CORS_PROXY}https://api.fastgpt.in/api`;

console.log('🌐 当前环境:', isLocalEnvironment ? '本地' : 'GitHub Pages + CORS代理');
console.log('🌐 API_BASE:', API_BASE);

// 显示CORS代理使用提示
if (!isLocalEnvironment) {
    console.log('🔧 使用CORS代理服务，首次使用需要激活：');
    console.log('1. 点击链接激活代理：https://cors-anywhere.herokuapp.com/corsdemo');
    console.log('2. 激活后返回页面刷新即可正常使用');
    
    // 显示激活提示
    setTimeout(() => {
        const alertDiv = document.createElement('div');
        alertDiv.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10000; 
                        background: #2c3e50; color: white; padding: 25px; border-radius: 12px; 
                        max-width: 400px; box-shadow: 0 8px 25px rgba(0,0,0,0.3); font-family: -apple-system, sans-serif;">
                <h3 style="margin: 0 0 15px 0; text-align: center; color: #3498db;">
                    🔧 首次使用需要激活CORS代理
                </h3>
                <div style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">
                    <p style="margin: 0 0 10px 0;">为了解决CORS跨域问题，我们使用了代理服务。</p>
                    <p style="margin: 0 0 15px 0; background: rgba(52, 152, 219, 0.1); padding: 10px; border-radius: 6px;">
                        <strong>请点击下方按钮激活代理服务：</strong>
                    </p>
                    <ol style="margin: 10px 0; padding-left: 20px;">
                        <li>点击"激活代理"按钮</li>
                        <li>在新页面点击"Request temporary access"</li>
                        <li>返回本页面刷新即可使用</li>
                    </ol>
                </div>
                <div style="text-align: center;">
                    <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" 
                       style="display: inline-block; background: #3498db; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">
                        🚀 激活代理
                    </a>
                    <button onclick="this.closest('div').parentElement.remove()" 
                            style="background: #95a5a6; color: white; padding: 12px 24px; border: none; 
                                   border-radius: 6px; font-weight: bold; cursor: pointer;">
                        稍后激活
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(alertDiv);
    }, 2000);
}

// 复制原有的API配置和所有函数（省略重复代码，这里只是示例）
// API配置 - 用户配置信息
let API_CONFIG = {
    // 阿里云OSS配置
    OSS: {
        region: 'oss-cn-beijing',
        accessKeyId: '',
        accessKeySecret: '',
        bucket: 'tian-jiu-boss-zhishiku',
        endpoint: 'https://oss-cn-beijing.aliyuncs.com'
    },
    // FastGPT配置 - 风格分析
    FASTGPT_STYLE: {
        baseUrl: API_BASE,
        apiKey: 'fastgpt-uWWVnoPpJIc57h6BiLumhzeyk89gfyPmQCCYn8R214C71i6tL6Pa5Gsov7NnIYH',
        workflowId: '685f87df49b71f158b57ae61'
    },
    // FastGPT配置 - 内容生成
    FASTGPT_CONTENT: {
        baseUrl: API_BASE,
        apiKey: 'fastgpt-p2WSK5LRZZM3tVzk0XRT4vERkQ2PYLXi6rFAZdHzzuB7mSicDLRBXiymej',
        workflowId: '685c9d7e6adb97a0858caaa6'
    },
    // 接口模式选择：'workflow' 或 'chat'
    MODE: 'chat'
};

// 添加切换到CORS代理版本的函数
window.switchToCorsProxy = function() {
    console.log('🔄 切换到CORS代理版本...');
    
    // 重新加载脚本
    const newScript = document.createElement('script');
    newScript.src = 'script-cors-proxy.js?v=' + Date.now();
    document.head.appendChild(newScript);
    
    // 显示切换成功提示
    setTimeout(() => {
        alert('✅ 已切换到CORS代理版本！\n请按照提示激活代理服务。');
    }, 1000);
};

// 注意：这里只是一个示例框架，实际使用时需要复制完整的script-github-pages.js内容
console.log('📝 注意：这是CORS代理版本的示例框架');
console.log('💡 如需完整功能，请手动复制script-github-pages.js的所有函数到此文件');
