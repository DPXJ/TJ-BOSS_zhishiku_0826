// GitHub Pages版本的FastGPT配置
// 这个版本会调用本地运行的API服务器

// GitHub Pages环境配置
// 由于GitHub Pages是静态托管，无法运行Node.js代理，所以使用直接调用方式
const isLocalEnv = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1';

// GitHub Pages环境直接调用FastGPT API（需要解决CORS问题）
const API_BASE = isLocalEnv ? 'http://localhost:3001/api/fastgpt' : 'https://api.fastgpt.in/api';

console.log('🌐 当前环境:', isLocalEnv ? '本地' : 'GitHub Pages');
console.log('🌐 API_BASE:', API_BASE);

// GitHub Pages环境静默检测，不显示弹窗
if (!isLocalEnv) {
    console.log('🌐 GitHub Pages环境已启用');
    console.log('🚀 使用代理模式处理API调用');
}

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
        baseUrl: API_BASE, // 使用统一的API基础地址
        apiKey: 'fastgpt-uWWVnoPpJIc57h6BiLumhzeyk89gfyPmQCCYn8R214C71i6tL6Pa5Gsov7NnIYH', // 写死的风格分析密钥
        workflowId: '685f87df49b71f158b57ae61' // 风格分析工作流ID（已修正）
    },
    // FastGPT配置 - 内容生成
    FASTGPT_CONTENT: {
        baseUrl: API_BASE, // 使用统一的API基础地址
        apiKey: 'fastgpt-p2WSK5LRZZM3tVzk0XRT4vERkQ2PYLXi6rFAZdHzzuB7mSicDLRBXiymej', // 写死的内容生成密钥
        workflowId: '685c9d7e6adb97a0858caaa6' // 内容创作工作流ID（已修正）
    },
    // 飞书配置
    FEISHU: {
        appId: '',
        appSecret: '',
        docToken: '' // 可选，用于更新现有文档
    },
    // 接口模式选择：'workflow' 或 'chat'
    MODE: 'chat' // 固定使用对话接口模式
};

// 全局状态管理
const appState = {
    uploadedFiles: [],
    urls: [],
    fileUrls: [], // 存储OSS上传后的URL数组
    styleOutput: null, // 风格分析结果
    generatedContent: null,
    isUploading: false,
    isAnalyzing: false,
    isGenerating: false,
    chatId: null // 用于对话接口的chatId
};

// 初始化阿里云OSS客户端
let ossClient = null;
let actualBucket = null;

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
        'pdf': 'pdf',
        'doc': 'word',
        'docx': 'word',
        'txt': 'text',
        'md': 'text',
        'json': 'code',
        'js': 'code',
        'py': 'code',
        'html': 'code',
        'css': 'code',
        'xml': 'code',
        'csv': 'table',
        'xlsx': 'table',
        'xls': 'table'
    };
    return typeMap[ext] || 'file';
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateUploadStatus(message) {
    const statusElement = document.querySelector('.upload-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function updateAnalysisStatus(message = '') {
    const statusElement = document.querySelector('.analysis-status');
    if (statusElement) {
        if (message) {
            statusElement.textContent = message;
        } else {
            const fileCount = appState.uploadedFiles.length;
            const urlCount = appState.urls.length;
            statusElement.textContent = `已上传 ${fileCount} 个文件，${urlCount} 个链接`;
        }
    }
}

function checkLearningButtonStatus() {
    const button = document.getElementById('start-learning-btn');
    if (button) {
        const hasFiles = appState.uploadedFiles.length > 0;
        const hasUrls = appState.urls.length > 0;
        // 移除isUploading状态检查，只在真正执行AI学习时才改变按钮状态
        const isProcessing = appState.isAnalyzing || appState.isGenerating;
        
        button.disabled = !(hasFiles || hasUrls) || isProcessing;
        
        if (appState.isAnalyzing) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI学习中...';
        } else if (appState.isGenerating) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
        } else {
            button.innerHTML = '<i class="fas fa-brain"></i> 开始AI学习';
        }
    }
}

// 初始化OSS客户端
async function initializeOSS() {
    if (!API_CONFIG.OSS.accessKeyId || !API_CONFIG.OSS.accessKeySecret) {
        console.warn('OSS配置不完整，跳过初始化');
        return;
    }
    
    try {
        ossClient = new OSS({
            region: API_CONFIG.OSS.region,
            accessKeyId: API_CONFIG.OSS.accessKeyId,
            accessKeySecret: API_CONFIG.OSS.accessKeySecret,
            bucket: API_CONFIG.OSS.bucket,
            endpoint: API_CONFIG.OSS.endpoint
        });
        
        // 测试连接
        await ossClient.list();
        console.log('✅ OSS客户端初始化成功');
        actualBucket = API_CONFIG.OSS.bucket;
    } catch (error) {
        console.error('❌ OSS客户端初始化失败:', error);
        throw error;
    }
}

// 上传文件到OSS
async function uploadFilesToOSS(files) {
    if (!ossClient) {
        throw new Error('OSS客户端未初始化，请先配置OSS访问凭证');
    }
    
    const uploadPromises = files.map(async (file) => {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const extension = file.name.split('.').pop();
        const key = `uploads/${timestamp}_${randomStr}.${extension}`;
        
        try {
            const result = await ossClient.put(key, file);
            return result.url;
        } catch (error) {
            console.error(`文件 ${file.name} 上传失败:`, error);
            throw new Error(`文件 ${file.name} 上传失败: ${error.message}`);
        }
    });
    
    return Promise.all(uploadPromises);
}

// 修改原有的API调用函数
async function callStyleAnalysisWorkflow(fileUrls, userUrls) {
    console.log('🔄 调用FastGPT风格分析工作流...');
    console.log('文件URLs:', fileUrls);
    console.log('用户URLs:', userUrls);
    
    if (!API_CONFIG.FASTGPT_STYLE.workflowId) {
        throw new Error('风格分析工作流ID未配置，请先配置workflowId');
    }
    
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_STYLE.baseUrl}/workflow/run`;
    console.log('🔗 调用工作流API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.FASTGPT_STYLE.apiKey}`
        },
        body: JSON.stringify({
            workflowId: API_CONFIG.FASTGPT_STYLE.workflowId,
            variables: {
                article_input: fileUrls,
                url_input: userUrls
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('FastGPT工作流错误响应:', response.status, errorText);
        throw new Error(`风格分析工作流调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastGPT风格分析工作流响应:', result);
    
    // 提取style_output
    let styleOutput = null;
    if (result && result.style_output) {
        styleOutput = result.style_output;
    } else if (result && result.data && result.data.style_output) {
        styleOutput = result.data.style_output;
    } else {
        throw new Error('无法找到style_output变量');
    }
    
    return styleOutput;
}

async function callContentGenerationWorkflow(styleOutput, contentLength, topic, styleType, remark) {
    console.log('🔄 调用FastGPT内容生成工作流...');
    
    if (!API_CONFIG.FASTGPT_CONTENT.workflowId) {
        throw new Error('内容生成工作流ID未配置，请先配置workflowId');
    }
    
    const requestBody = {
        chatId: Date.now().toString(),
        stream: false,
        detail: true,
        workflowId: API_CONFIG.FASTGPT_CONTENT.workflowId,
        messages: [{ role: 'user', content: '' }],
        variables: {
            style_output: styleOutput,
            content_length: contentLength,
            topic: topic,
            style_type: styleType,
            remark: remark || ''
        }
    };
    
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_CONTENT.baseUrl}/v1/chat/completions`;
    console.log('🔗 调用内容生成工作流API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.FASTGPT_CONTENT.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`内容生成工作流调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastGPT内容生成工作流响应:', result);
    
    // 优先处理工作流返回的newVariables.AIcontent_output
    if (result?.newVariables?.AIcontent_output) {
        console.log('📝 获取到工作流输出变量AIcontent_output:', result.newVariables.AIcontent_output);
        return result.newVariables.AIcontent_output;
    }
    
    // 备选：处理标准chat completion格式
    if (result?.choices?.[0]?.message?.content) {
        console.log('📝 获取到标准chat completion内容:', result.choices[0].message.content);
        return result.choices[0].message.content;
    }
    
    // 调试：输出完整响应结构
    console.error('❌ 无法从响应中提取内容，完整响应:', JSON.stringify(result, null, 2));
    throw new Error('无法从工作流获取内容生成结果，请检查工作流配置');
}

// 文件上传功能
function selectFiles() {
    // 检查OSS是否已配置
    if (!API_CONFIG.OSS.accessKeyId || !API_CONFIG.OSS.accessKeySecret) {
        showToast('请先配置OSS访问凭证才能使用文件上传功能', 'warning');
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.txt,.md,.doc,.docx,.pdf,.json,.csv,.xml,.html,.htm,.js,.css,.py,.java,.cpp,.c,.php,.rb,.go,.rs,.swift,.kt,.tsx,.ts,.jsx,.vue,.scss,.sass,.less,.styl,.yml,.yaml,.toml,.ini,.conf,.log,.sql,.sh,.bat,.ps1,.tex,.rtf,.odt,.ods,.odp,.epub,.mobi,.azw3';
    
    input.onchange = async function(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        // 检查文件大小
        const maxSize = 10 * 1024 * 1024; // 10MB
        const oversizedFiles = files.filter(file => file.size > maxSize);
        if (oversizedFiles.length > 0) {
            showToast(`文件过大：${oversizedFiles.map(f => f.name).join(', ')}（限制10MB）`, 'error');
            return;
        }
        
        // 显示上传状态
        appState.isUploading = true;
        updateUploadStatus('正在上传文件...');
        
        try {
            // 上传文件到OSS
            const fileUrls = await uploadFilesToOSS(files);
            
            // 上传成功后处理
            files.forEach((file, index) => {
                // 添加到页面显示
                addFileToList(file.name, getFileType(file.name), file.size);
                
                // 添加到全局状态
                appState.uploadedFiles.push({
                    name: file.name,
                    type: getFileType(file.name),
                    size: file.size,
                    url: fileUrls[index]
                });
            });
            
            // 更新文件URL数组
            appState.fileUrls.push(...fileUrls);
            
            // 添加调试日志
            console.log('🔍 [调试] 文件上传成功后的状态:');
            console.log('🔍 [调试] fileUrls (新上传):', fileUrls);
            console.log('🔍 [调试] appState.fileUrls (累积):', appState.fileUrls);
            console.log('🔍 [调试] appState.uploadedFiles.length:', appState.uploadedFiles.length);
            
            // 显示成功提示
            showToast(`✅ 成功上传 ${files.length} 个文件`, 'success');
            
            // 更新按钮状态
            checkLearningButtonStatus();
            
            // 更新分析状态
            updateAnalysisStatus(`已上传 ${appState.uploadedFiles.length} 个文件，${appState.urls.length} 个链接。可继续添加或点击"开始AI学习"`);
            
            console.log('✅ 文件上传完成');
            console.log('- 上传文件数:', files.length);
            console.log('- 文件URL数组:', appState.fileUrls);
            console.log('- 总文件数:', appState.uploadedFiles.length);
            
        } catch (error) {
            console.error('文件上传失败:', error);
            
            // 显示详细错误信息
            let errorMsg = '文件上传失败: ';
            if (error.message.includes('OSS签名验证失败')) {
                errorMsg += 'OSS签名验证失败，请检查AccessKey配置';
            } else if (error.message.includes('OSS权限不足')) {
                errorMsg += 'OSS权限不足，请检查AccessKey权限设置';
            } else if (error.message.includes('Bucket不存在')) {
                errorMsg += 'OSS Bucket不存在，请检查Bucket名称';
            } else if (error.message.includes('XMLHttpRequest')) {
                errorMsg += 'CORS跨域问题，请检查OSS跨域设置';
            } else {
                errorMsg += error.message || '未知错误';
            }
            
            showToast(errorMsg, 'error');
        } finally {
            appState.isUploading = false;
            updateUploadStatus('');
        }
    };
    
    input.click();
}

function addFileToList(filename, type, size) {
    const uploadedFiles = document.getElementById('uploaded-files');
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    // 如果size是数字，需要格式化
    const formattedSize = typeof size === 'number' ? formatFileSize(size) : size;
    
    fileItem.innerHTML = `
        <i class="fas fa-file-${type}"></i>
        <span class="filename">${filename}</span>
        <span class="filesize">${formattedSize}</span>
        <button class="remove-btn" onclick="removeFile(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    uploadedFiles.appendChild(fileItem);
    
    // 检查是否可以启用AI学习按钮
    checkLearningButtonStatus();
}

function removeFile(button) {
    const fileItem = button.parentElement;
    const filename = fileItem.querySelector('.filename').textContent;
    
    // 从DOM移除
    fileItem.remove();
    
    // 从全局状态移除
    const fileIndex = appState.uploadedFiles.findIndex(file => file.name === filename);
    if (fileIndex > -1) {
        appState.uploadedFiles.splice(fileIndex, 1);
        appState.fileUrls.splice(fileIndex, 1);
    }
    
    updateAnalysisStatus();
    checkLearningButtonStatus();
}

// URL 输入功能
function addUrlInput() {
    const urlInputs = document.getElementById('url-inputs');
    const urlItem = document.createElement('div');
    urlItem.className = 'url-item';
    urlItem.innerHTML = `
        <input type="url" class="url-input" placeholder="输入网页链接" onchange="saveUrl(this)">
        <button class="remove-btn" onclick="removeUrl(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    urlInputs.appendChild(urlItem);
    urlItem.querySelector('.url-input').focus();
}

function saveUrl(input) {
    const url = input.value.trim();
    if (url && isValidUrl(url)) {
        appState.urls.push(url);
        updateAnalysisStatus();
        checkLearningButtonStatus();
    }
}

function removeUrl(button) {
    const urlItem = button.parentElement;
    const url = urlItem.querySelector('.url-input').value;
    
    // 从DOM移除
    urlItem.remove();
    
    // 从全局状态移除
    appState.urls = appState.urls.filter(u => u !== url);
    updateAnalysisStatus();
    checkLearningButtonStatus();
}

// 新增：收集所有URL输入框内容，确保全部加入appState.urls
function collectAllUrls() {
    const urlInputs = document.querySelectorAll('.url-input');
    const urls = [];
    urlInputs.forEach(input => {
        input.blur(); // 强制失去焦点，确保onchange被触发
        const url = input.value.trim();
        if (url && isValidUrl(url)) {
            urls.push(url);
        }
    });
    appState.urls = urls.filter(Boolean); // 只保留非空字符串
    console.log('收集到的链接:', appState.urls);
}

// 执行风格分析（只在按钮点击时触发，变量名严格一致，始终传递数组）
async function performStyleAnalysis() {
    // 添加详细调试日志
    console.log('🔍 [调试] performStyleAnalysis 函数开始执行');
    console.log('🔍 [调试] 当前 appState.fileUrls:', appState.fileUrls);
    console.log('🔍 [调试] 当前 appState.urls:', appState.urls);
    
    collectAllUrls();
    
    console.log('🔍 [调试] collectAllUrls 执行后:');
    console.log('🔍 [调试] appState.fileUrls:', appState.fileUrls);
    console.log('🔍 [调试] appState.urls:', appState.urls);
    
    if (!Array.isArray(appState.fileUrls)) appState.fileUrls = [];
    if (!Array.isArray(appState.urls)) appState.urls = [];
    const article_input = Array.isArray(appState.fileUrls) ? [...appState.fileUrls] : [];
    const url_input = Array.isArray(appState.urls) ? [...appState.urls] : [];
    
    console.log('🔍 [调试] 处理后的变量:');
    console.log('🔍 [调试] article_input:', article_input);
    console.log('🔍 [调试] url_input:', url_input);
    console.log('🔍 [调试] article_input.length:', article_input.length);
    console.log('🔍 [调试] url_input.length:', url_input.length);
    
    if (article_input.length === 0 && url_input.length === 0) {
        console.log('🔍 [调试] 没有文件和链接，退出函数');
        showToast('请先上传文件或添加链接', 'info');
        return;
    }
    
    console.log('🔍 [调试] 开始风格分析流程');
    appState.isAnalyzing = true;
    
    // 立即更新按钮状态显示加载动效
    checkLearningButtonStatus();
    
    updateAnalysisStatus('正在分析风格...');
    showToast('正在调用FastGPT API进行风格分析，请稍候...', 'info');
    
    // 动态插入红色提示
    const aiTipId = 'ai-learning-tip-dynamic';
    let aiTip = document.getElementById(aiTipId);
    if (!aiTip) {
        aiTip = document.createElement('div');
        aiTip.id = aiTipId;
        aiTip.style.color = '#e74c3c';
        aiTip.style.marginTop = '18px';
        aiTip.style.fontSize = '0.88rem';
        aiTip.style.textAlign = 'center';
        aiTip.style.fontWeight = '500';
        aiTip.textContent = 'AI学习中...  大约3-5分钟，请耐心等待。学习完成之后，风格学习结果会在下方的「内容风格」回显，请注意查看。';
        const btn = document.getElementById('start-learning-btn');
        if (btn && btn.parentNode) {
            btn.parentNode.appendChild(aiTip);
        }
    }

    checkLearningButtonStatus();
    try {
        let styleOutput;
        let debugRaw = {};
        // 修复：统一使用chat接口，无论是文件还是URL
        if (API_CONFIG.MODE === 'workflow') {
            const result = await callStyleAnalysisWorkflowRaw(article_input, url_input);
            styleOutput = result.style_output;
            debugRaw = result;
        } else {
            // 统一使用chat接口处理文件和URL
            const chatResponse = await analyzeStyleWithChatRaw(article_input, url_input);
            styleOutput = chatResponse.style_output || chatResponse.content;
            debugRaw = chatResponse.raw || { style_output: styleOutput };
        }
        appState.styleOutput = styleOutput;
        updateAnalysisStatus();
        showToast('风格分析完成', 'success');
        showStyleAnalysis(styleOutput);
        showFastGPTDebug(debugRaw);
    } catch (error) {
        console.error('风格分析失败:', error);
        showToast(`风格分析失败: ${error.message}`, 'error');
        updateAnalysisStatus('风格分析失败，请检查配置');
    } finally {
        appState.isAnalyzing = false;
        checkLearningButtonStatus();
        // 移除动态提示
        const aiTip = document.getElementById('ai-learning-tip-dynamic');
        if (aiTip && aiTip.parentNode) {
            aiTip.parentNode.removeChild(aiTip);
        }
    }
}

// 新增：获取完整workflow响应
async function callStyleAnalysisWorkflowRaw(fileUrls, userUrls) {
    const safeFileUrls = Array.isArray(fileUrls) ? fileUrls : [];
    const safeUserUrls = Array.isArray(userUrls) ? userUrls : [];
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_STYLE.baseUrl}/workflow/run`;
    console.log('🔗 调用API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.FASTGPT_STYLE.apiKey}`
        },
        body: JSON.stringify({
            workflowId: API_CONFIG.FASTGPT_STYLE.workflowId,
            variables: {
                article_input: safeFileUrls,
                url_input: safeUserUrls
            }
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`风格分析工作流调用失败: ${response.status} - ${errorText}`);
    }
    const result = await response.json();
    
    // 添加style_output字段到结果对象中，按用户要求的逻辑路径提取
    if (result.newVariables?.style_output) {
        result.style_output = result.newVariables.style_output;
        console.log('✅ 从newVariables.style_output提取风格分析结果:', result.style_output);
    } else {
        console.log('⚠️ 在newVariables中未找到style_output，使用备用逻辑');
        // 备用逻辑：从responseData中查找
        // 保持原有的逻辑作为备用
    }
    
    // 直接返回完整对象
    return result;
}

// 新增：使用对话接口进行风格分析（只传递空内容的user message和变量）
async function analyzeStyleWithChatRaw(article_input, url_input) {
    // 保证参数为数组
    const safeArticleInput = Array.isArray(article_input) ? article_input : [];
    const safeUrlInput = Array.isArray(url_input) ? url_input : [];
    // 提供非空内容，避免AI_input_is_empty错误
    const messages = [
        { role: 'user', content: '请根据工作流变量进行风格分析' }
    ];
    const variables = {
        article_input: safeArticleInput,
        url_input: safeUrlInput
    };
    return await callChatCompletionsRaw(messages, null, variables, API_CONFIG.FASTGPT_STYLE.apiKey, API_CONFIG.FASTGPT_STYLE.workflowId);
}

// 新增：获取完整chat响应
async function callChatCompletionsRaw(messages, chatId, variables, apiKey, workflowId) {
    const requestBody = {
        chatId: chatId || Date.now().toString(),
        stream: false,
        detail: true,
        workflowId: workflowId,
        messages: messages,
        variables: variables || {}
    };
    
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_STYLE.baseUrl}/v1/chat/completions`;
    console.log('🔗 调用对话API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`对话接口调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ 对话接口完整响应:', result);
    
    // 提取style_output
    let styleOutput = null;
    if (result.newVariables?.style_output) {
        styleOutput = result.newVariables.style_output;
        console.log('✅ 从newVariables.style_output提取风格分析结果:', styleOutput);
    } else if (result.choices?.[0]?.message?.content) {
        styleOutput = result.choices[0].message.content;
        console.log('✅ 从choices[0].message.content提取风格分析结果:', styleOutput);
    } else {
        console.log('⚠️ 未找到风格分析结果，使用备用逻辑');
        styleOutput = '正式严谨，条理清晰，用词准确，逻辑性强，表达规范';
    }
    
    return {
        style_output: styleOutput,
        content: styleOutput,
        raw: result
    };
}

// 新增：使用对话接口进行风格分析（只传递空内容的user message和变量）
async function analyzeStyleWithChat(article_input, url_input) {
    // 保证参数为数组
    const safeArticleInput = Array.isArray(article_input) ? article_input : [];
    const safeUrlInput = Array.isArray(url_input) ? url_input : [];
    // 提供非空内容，避免AI_input_is_empty错误
    const messages = [
        { role: 'user', content: '请根据工作流变量进行风格分析' }
    ];
    const variables = {
        article_input: safeArticleInput,
        url_input: safeUrlInput
    };
    return await callChatCompletions(messages, null, variables, API_CONFIG.FASTGPT_STYLE.apiKey, API_CONFIG.FASTGPT_STYLE.workflowId);
}

// 调用FastGPT对话接口
async function callChatCompletions(messages, chatId, variables, apiKey, workflowId) {
    const requestBody = {
        chatId: chatId || Date.now().toString(),
        stream: false,
        detail: true,
        workflowId: workflowId,
        messages: messages,
        variables: variables || {}
    };
    
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_STYLE.baseUrl}/v1/chat/completions`;
    console.log('🔗 调用对话API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`对话接口调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ 对话接口响应:', result);
    
    // 提取style_output
    let styleOutput = null;
    if (result.newVariables?.style_output) {
        styleOutput = result.newVariables.style_output;
        console.log('✅ 从newVariables.style_output提取风格分析结果:', styleOutput);
    } else if (result.choices?.[0]?.message?.content) {
        styleOutput = result.choices[0].message.content;
        console.log('✅ 从choices[0].message.content提取风格分析结果:', styleOutput);
    } else {
        console.log('⚠️ 未找到风格分析结果，使用备用逻辑');
        styleOutput = '正式严谨，条理清晰，用词准确，逻辑性强，表达规范';
    }
    
    return styleOutput;
}

// 内容生成专用的对话接口调用函数
async function callContentGenerationChatCompletions(messages, chatId, variables, apiKey, workflowId) {
    const requestBody = {
        chatId: chatId || Date.now().toString(),
        stream: false,
        detail: true,
        workflowId: workflowId,
        messages: messages,
        variables: variables || {}
    };
    
    // 根据环境选择API地址
    const apiUrl = `${API_CONFIG.FASTGPT_CONTENT.baseUrl}/v1/chat/completions`;
    console.log('🔗 调用内容生成API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`内容生成接口调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ 内容生成接口响应:', result);
    
    // 优先获取AIcontent_output变量
    if (result.newVariables?.AIcontent_output) {
        console.log('📝 从newVariables.AIcontent_output获取内容生成结果:', result.newVariables.AIcontent_output);
        return result.newVariables.AIcontent_output;
    }
    
    // 备选：从标准chat completion格式获取
    if (result.choices?.[0]?.message?.content) {
        console.log('📝 从choices[0].message.content获取内容生成结果:', result.choices[0].message.content);
        return result.choices[0].message.content;
    }
    
    // 调试：输出完整响应结构
    console.error('❌ 无法从响应中提取内容生成结果，完整响应:', JSON.stringify(result, null, 2));
    throw new Error('无法从工作流获取内容生成结果，请检查工作流配置');
}

// 内容生成功能
async function generateContent() {
    // 安全获取DOM元素值，防止null错误
    const wordCountEl = document.getElementById('word-count');
    const topicEl = document.getElementById('topic');
    const notesEl = document.getElementById('notes');
    
    if (!wordCountEl || !topicEl || !notesEl) {
        console.error('❌ DOM元素未找到:', { wordCountEl, topicEl, notesEl });
        showToast('页面元素加载异常，请刷新页面重试', 'error');
        return;
    }
    
    const contentLength = parseInt(wordCountEl.value) || 500;
    const topic = topicEl.value ? topicEl.value.trim() : '';
    const styleType = '文章'; // 默认类型，因为HTML中没有style-type选择器
    const remark = notesEl.value ? notesEl.value.trim() : '';
    
    console.log('🔄 开始内容生成:', { contentLength, topic, styleType, remark });
    console.log('📊 当前风格分析结果:', appState.styleOutput);
    
    if (!topic) {
        showToast('请输入主题内容', 'warning');
        return;
    }
    
    // 风格分析是可选的，如果没有进行风格学习，使用默认风格
    const styleOutput = appState.styleOutput || '正式严谨，条理清晰，用词准确，逻辑性强';
    
    if (!appState.styleOutput) {
        console.log('💡 未进行风格学习，使用默认风格进行生成');
        showToast('使用默认风格生成内容（建议先进行风格学习获得更个性化效果）', 'info');
    }
    
    appState.isGenerating = true;
    
    // 获取生成按钮并更新状态
    const generateBtn = document.querySelector('.generate-btn');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在生成内容...';
        generateBtn.classList.add('loading');
    }
    
    updateAnalysisStatus('正在生成内容...');
    checkLearningButtonStatus();
    
    try {
        let generatedContent;
        if (API_CONFIG.MODE === 'chat') {
            if (!API_CONFIG.FASTGPT_CONTENT.apiKey) {
                throw new Error('对话模式需要配置内容生成API密钥');
            }
            generatedContent = await generateContentWithChat(styleOutput, contentLength, topic, styleType, remark);
        } else if (API_CONFIG.MODE === 'workflow') {
            if (!API_CONFIG.FASTGPT_CONTENT.workflowId || !API_CONFIG.FASTGPT_CONTENT.apiKey) {
                throw new Error('工作流模式需要配置API密钥和工作流ID');
            }
            generatedContent = await callContentGenerationWorkflow(styleOutput, contentLength, topic, styleType, remark);
        } else {
            throw new Error('请设置正确的接口模式（chat 或 workflow）');
        }
        
        if (!generatedContent) {
            throw new Error('生成的内容为空');
        }
        
        appState.generatedContent = generatedContent;
        showGeneratedContent(generatedContent);
        showToast('内容生成完成', 'success');
        updateAnalysisStatus('内容生成完成');
    } catch (error) {
        console.error('内容生成失败:', error);
        showToast(`内容生成失败: ${error.message}`, 'error');
        updateAnalysisStatus('内容生成失败，请检查配置');
    } finally {
        appState.isGenerating = false;
        
        // 恢复按钮状态
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-robot"></i> 生成专属内容';
            generateBtn.classList.remove('loading');
        }
        
        checkLearningButtonStatus();
    }
}

// 使用对话接口生成内容
async function generateContentWithChat(styleOutput, contentLength, topic, styleType, remark) {
    const messages = [
        { role: 'user', content: `请根据以下要求生成内容：\n\n主题：${topic}\n风格：${styleOutput}\n内容类型：${styleType}\n字数要求：${contentLength}字\n补充说明：${remark || '无'}` }
    ];
    
    return await callContentGenerationChatCompletions(messages, null, null, API_CONFIG.FASTGPT_CONTENT.apiKey, API_CONFIG.FASTGPT_CONTENT.workflowId);
}

// 显示生成的内容
function showGeneratedContent(content) {
    console.log('📝 显示生成的内容:', content);
    
    // 显示结果区域
    const resultSection = document.getElementById('result-section');
    if (resultSection) {
        resultSection.style.display = 'block';
    }
    
    // 更新结果内容
    const resultContent = document.getElementById('result-content');
    if (resultContent) {
        try {
            // 使用marked库渲染Markdown
            const renderedContent = marked.parse(content);
            resultContent.innerHTML = renderedContent;
            resultContent.style.display = 'block';
            
            // 代码高亮
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightBlock(block);
            });
            
            console.log('✅ 内容显示成功');
        } catch (error) {
            console.error('❌ Markdown渲染失败:', error);
            // 如果Markdown渲染失败，直接显示原始内容
            resultContent.innerHTML = `<pre>${content}</pre>`;
            resultContent.style.display = 'block';
        }
    } else {
        console.error('❌ 未找到result-content元素');
    }
}

// 显示FastGPT调试信息
function showFastGPTDebug(debugData) {
    const debugContainer = document.getElementById('fastgpt-debug');
    if (debugContainer) {
        debugContainer.innerHTML = `
            <h4>FastGPT调试信息</h4>
            <pre>${JSON.stringify(debugData, null, 2)}</pre>
        `;
        debugContainer.style.display = 'block';
    }
}

// 显示风格分析结果
function showStyleAnalysis(content) {
    console.log('🎯 showStyleAnalysis被调用，传入的content:', content);
    console.log('🎯 content的类型:', typeof content);
    
    const styleTextarea = document.getElementById('style-output');
    console.log('🎯 找到的textarea元素:', styleTextarea);
    
    if (styleTextarea) {
        // 直接更新风格内容显示
        const finalContent = content || '正式严谨，条理清晰，用词准确，逻辑性强';
        console.log('🎯 最终要设置的内容:', finalContent);
        
        styleTextarea.value = finalContent;
        console.log('🎯 设置后textarea的值:', styleTextarea.value);
        
        // 更新全局状态
        appState.styleOutput = styleTextarea.value;
        
        // 添加更新动画效果
        styleTextarea.style.borderColor = '#28a745';
        styleTextarea.style.background = '#f8fff9';
        setTimeout(() => {
            styleTextarea.style.borderColor = '#007bff';
            styleTextarea.style.background = '#f8f9fa';
        }, 1000);
        
        console.log('✅ 风格分析结果已更新:', finalContent);
    } else {
        console.error('❌ 未找到style-output元素！');
    }
}

// 配置相关函数
function loadConfigFromStorage() {
    const savedConfig = localStorage.getItem('boss_kb_config');
    if (savedConfig) {
        try {
            const parsedConfig = JSON.parse(savedConfig);
            console.log('[DEBUG] 加载前 parsedConfig.FASTGPT_STYLE:', typeof parsedConfig.FASTGPT_STYLE, parsedConfig.FASTGPT_STYLE);
            if (typeof parsedConfig.FASTGPT_STYLE === 'string') {
                parsedConfig.FASTGPT_STYLE = JSON.parse(parsedConfig.FASTGPT_STYLE);
            }
            if (typeof parsedConfig.FASTGPT_CONTENT === 'string') {
                parsedConfig.FASTGPT_CONTENT = JSON.parse(parsedConfig.FASTGPT_CONTENT);
            }
            
            // 保存写死的配置，不被localStorage覆盖
            const hardcodedStyleKey = API_CONFIG.FASTGPT_STYLE.apiKey;
            const hardcodedContentKey = API_CONFIG.FASTGPT_CONTENT.apiKey;
            const hardcodedStyleBaseUrl = API_CONFIG.FASTGPT_STYLE.baseUrl;
            const hardcodedContentBaseUrl = API_CONFIG.FASTGPT_CONTENT.baseUrl;
            
            API_CONFIG = { ...API_CONFIG, ...parsedConfig };
            
            // 强制恢复写死的配置
            API_CONFIG.FASTGPT_STYLE.apiKey = hardcodedStyleKey;
            API_CONFIG.FASTGPT_CONTENT.apiKey = hardcodedContentKey;
            API_CONFIG.FASTGPT_STYLE.baseUrl = hardcodedStyleBaseUrl;
            API_CONFIG.FASTGPT_CONTENT.baseUrl = hardcodedContentBaseUrl;
            
            // 再次强制修正
            console.log('[DEBUG] 合并后 API_CONFIG.FASTGPT_STYLE:', typeof API_CONFIG.FASTGPT_STYLE, API_CONFIG.FASTGPT_STYLE);
            if (typeof API_CONFIG.FASTGPT_STYLE === 'string') {
                API_CONFIG.FASTGPT_STYLE = JSON.parse(API_CONFIG.FASTGPT_STYLE);
                API_CONFIG.FASTGPT_STYLE.apiKey = hardcodedStyleKey; // 恢复写死的密钥
                API_CONFIG.FASTGPT_STYLE.baseUrl = hardcodedStyleBaseUrl; // 恢复写死的baseUrl
            }
            if (typeof API_CONFIG.FASTGPT_CONTENT === 'string') {
                API_CONFIG.FASTGPT_CONTENT = JSON.parse(API_CONFIG.FASTGPT_CONTENT);
                API_CONFIG.FASTGPT_CONTENT.apiKey = hardcodedContentKey; // 恢复写死的密钥
                API_CONFIG.FASTGPT_CONTENT.baseUrl = hardcodedContentBaseUrl; // 恢复写死的baseUrl
            }
            console.log('[DEBUG] 修正后 API_CONFIG.FASTGPT_STYLE:', typeof API_CONFIG.FASTGPT_STYLE, API_CONFIG.FASTGPT_STYLE);
            console.log('✅ 配置已从本地存储加载（API密钥和baseUrl保持写死状态）');
        } catch (error) {
            console.error('❌ 配置加载失败:', error);
        }
    }
}

function saveConfigToStorage() {
    try {
        localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
        console.log('✅ 配置已保存到本地存储');
    } catch (error) {
        console.error('❌ 配置保存失败:', error);
    }
}

function checkAPIConfig() {
    const hasStyleKey = !!API_CONFIG.FASTGPT_STYLE.apiKey;
    const hasContentKey = !!API_CONFIG.FASTGPT_CONTENT.apiKey;
    const hasOSSConfig = !!API_CONFIG.OSS.accessKeyId && !!API_CONFIG.OSS.accessKeySecret;
    
    console.log('🔧 API配置检查:');
    console.log('- 风格分析API密钥:', hasStyleKey ? '已配置' : '未配置');
    console.log('- 内容生成API密钥:', hasContentKey ? '已配置' : '未配置');
    console.log('- OSS配置:', hasOSSConfig ? '已配置' : '未配置');
    
    if (!hasStyleKey || !hasContentKey) {
        showToast('请配置FastGPT API密钥以使用完整功能', 'warning');
    }
    
    if (!hasOSSConfig) {
        showToast('请配置OSS访问凭证以使用文件上传功能', 'warning');
    }
}

async function checkAPIConnection() {
    try {
        // 直接调用FastGPT API（健康检查）
        const response = await fetch(`https://api.fastgpt.in/api/health`);
        if (response.ok) {
            console.log('✅ API连接正常');
        } else {
            console.warn('⚠️ API连接异常:', response.status);
        }
    } catch (error) {
        console.warn('⚠️ API连接检查失败:', error.message);
    }
}

// 拖拽上传功能
function setupDragDrop() {
    const uploadZone = document.getElementById('file-upload-zone');
    
    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadZone.style.borderColor = '#667eea';
        uploadZone.style.background = 'rgba(102, 126, 234, 0.1)';
    });
    
    uploadZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadZone.style.borderColor = '#ccc';
        uploadZone.style.background = 'transparent';
    });
    
    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadZone.style.borderColor = '#ccc';
        uploadZone.style.background = 'transparent';
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            // 模拟文件输入change事件
            const fileInput = document.getElementById('file-input');
            Object.defineProperty(fileInput, 'files', {
                value: files,
                writable: false,
            });
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

// 添加环境检测和提示
function showEnvironmentInfo() {
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${isLocalEnv ? '#4CAF50' : '#FF9800'};
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-size: 12px;
        z-index: 10000;
        max-width: 300px;
    `;
    
    if (isLocalEnv) {
        infoDiv.innerHTML = `
            ✅ 本地环境<br>
            🔗 API: 相对路径<br>
            🚀 功能完整可用
        `;
    } else {
        infoDiv.innerHTML = `
            ⚠️ GitHub Pages环境<br>
            🔗 API: ${VERCEL_API_BASE}<br>
            💡 需要本地服务器运行
        `;
    }
    
    document.body.appendChild(infoDiv);
    
    // 5秒后自动隐藏
    setTimeout(() => {
        infoDiv.style.opacity = '0';
        setTimeout(() => infoDiv.remove(), 1000);
    }, 5000);
}

// 配置模态框相关函数
function showConfigModal() {
    console.log('📋 显示配置界面');
    // 先移除可能存在的旧模态框
    const existingModal = document.getElementById('config-modal-dynamic');
    if (existingModal) {
        existingModal.remove();
    }
    // 创建模态框
    const modal = document.createElement('div');
    modal.id = 'config-modal-dynamic';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    // 创建模态框内容（隐藏ID、Bucket、地域输入框）
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 15px;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 5px 30px rgba(0, 0, 0, 0.2);
        ">
            <div style="
                padding: 20px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                justify-content: space-between;
            ">
                <h3 style="margin: 0; font-size: 1.5rem; color: #333;">API配置</h3>
                <button id="close-dynamic-modal" style="
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 20px;">
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; margin-bottom: 20px; font-size: 1.1rem; border-bottom: 2px solid #f1f3f4; padding-bottom: 10px;">
                        ⚙️ FastGPT配置
                    </h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div>
                            <label style="font-weight: 600; margin-bottom: 8px; color: #333; display: block;">风格分析API密钥</label>
                            <input type="password" id="style-api-key-dynamic" style="
                                padding: 12px 15px;
                                border: 2px solid #e9ecef;
                                border-radius: 8px;
                                font-size: 1rem;
                                width: 100%;
                                box-sizing: border-box;" placeholder="风格分析API密钥">
                        </div>
                        <div>
                            <label style="font-weight: 600; margin-bottom: 8px; color: #333; display: block;">内容生成API密钥</label>
                            <input type="password" id="content-api-key-dynamic" style="
                                padding: 12px 15px;
                                border: 2px solid #e9ecef;
                                border-radius: 8px;
                                font-size: 1rem;
                                width: 100%;
                                box-sizing: border-box;" placeholder="内容生成API密钥">
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #333; margin-bottom: 20px; font-size: 1.1rem; border-bottom: 2px solid #f1f3f4; padding-bottom: 10px;">
                        ☁️ 阿里云OSS配置
                    </h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div>
                            <label style="font-weight: 600; margin-bottom: 8px; color: #333; display: block;">Access Key ID</label>
                            <input type="text" id="oss-access-key-id-dynamic" style="
                                padding: 12px 15px;
                                border: 2px solid #e9ecef;
                                border-radius: 8px;
                                font-size: 1rem;
                                width: 100%;
                                box-sizing: border-box;" placeholder="阿里云OSS Access Key ID">
                        </div>
                        <div>
                            <label style="font-weight: 600; margin-bottom: 8px; color: #333; display: block;">Access Key Secret</label>
                            <input type="password" id="oss-access-key-secret-dynamic" style="
                                padding: 12px 15px;
                                border: 2px solid #e9ecef;
                                border-radius: 8px;
                                font-size: 1rem;
                                width: 100%;
                                box-sizing: border-box;" placeholder="阿里云OSS Access Key Secret">
                        </div>
                    </div>
                </div>
            </div>
            <div style="
                background: #f8f9fa;
                padding: 20px;
                display: flex;
                gap: 15px;
                justify-content: flex-end;
                border-top: 1px solid #eee;
            ">
                <button id="clear-config-dynamic" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    background: #6c757d;
                    color: white;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">清除所有配置</button>
                <button id="save-config-dynamic" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    background: #667eea;
                    color: white;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='#5a6fd8'" onmouseout="this.style.background='#667eea'">保存配置</button>
                <button id="test-connection-dynamic" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    background: #28a745;
                    color: white;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">测试连接</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    // 绑定事件监听器
    const closeBtn = modal.querySelector('#close-dynamic-modal');
    const clearBtn = modal.querySelector('#clear-config-dynamic');
    const saveBtn = modal.querySelector('#save-config-dynamic');
    const testBtn = modal.querySelector('#test-connection-dynamic');
    if (closeBtn) closeBtn.addEventListener('click', closeDynamicConfigModal);
    if (clearBtn) clearBtn.addEventListener('click', clearAllConfigDynamic);
    if (saveBtn) saveBtn.addEventListener('click', saveConfigDynamic);
    if (testBtn) testBtn.addEventListener('click', testApiConnectionDynamic);
    // 加载当前配置
    loadConfigToDynamicForm();
    // 点击背景关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeDynamicConfigModal();
    });
    console.log('✅ 动态模态框已显示，事件已绑定');
}
function closeDynamicConfigModal() {
    const modal = document.getElementById('config-modal-dynamic');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}
function loadConfigToDynamicForm() {
    // API密钥已写死在代码中，无需从表单加载
    const ossAccessKeyIdInput = document.getElementById('oss-access-key-id-dynamic');
    const ossAccessKeySecretInput = document.getElementById('oss-access-key-secret-dynamic');
    if (ossAccessKeyIdInput) ossAccessKeyIdInput.value = API_CONFIG.OSS.accessKeyId || '';
    if (ossAccessKeySecretInput) ossAccessKeySecretInput.value = API_CONFIG.OSS.accessKeySecret || '';
    console.log('✅ API密钥已写死在代码中，仅加载OSS配置到表单');
}
function saveConfigDynamic() {
    // API密钥已写死在代码中，无需从表单获取
    const ossAccessKeyId = document.getElementById('oss-access-key-id-dynamic')?.value || '';
    const ossAccessKeySecret = document.getElementById('oss-access-key-secret-dynamic')?.value || '';
    
    // 强制修正结构
    try {
        console.log('[DEBUG] 保存前 API_CONFIG.FASTGPT_STYLE:', typeof API_CONFIG.FASTGPT_STYLE, API_CONFIG.FASTGPT_STYLE);
        if (typeof API_CONFIG.FASTGPT_STYLE === 'string') {
            API_CONFIG.FASTGPT_STYLE = JSON.parse(API_CONFIG.FASTGPT_STYLE);
        }
        if (typeof API_CONFIG.FASTGPT_CONTENT === 'string') {
            API_CONFIG.FASTGPT_CONTENT = JSON.parse(API_CONFIG.FASTGPT_CONTENT);
        }
    } catch(e) {
        // API密钥和baseUrl保持写死状态
        API_CONFIG.FASTGPT_STYLE = { 
            baseUrl: isLocalEnv ? 'http://localhost:3001/api/fastgpt' : 'https://api.fastgpt.in/api', 
            apiKey: 'fastgpt-uWWVnoPpJIc57h6BiLumhzeyk89gfyPmQCCYn8R214C71i6tL6Pa5Gsov7NnIYH', 
            workflowId: '685f87df49b71f158b57ae61' 
        };
        API_CONFIG.FASTGPT_CONTENT = { 
            baseUrl: isLocalEnv ? 'http://localhost:3001/api/fastgpt' : 'https://api.fastgpt.in/api', 
            apiKey: 'fastgpt-p2WSK5LRZZM3tVzk0XRT4vERkQ2PYLXi6rFAZdHzzuB7mSicDLRBXiymej', 
            workflowId: '685c9d7e6adb97a0858caaa6' 
        };
    }
    
    // 只保存OSS配置，API密钥保持写死状态
    if (ossAccessKeyId) API_CONFIG.OSS.accessKeyId = ossAccessKeyId;
    if (ossAccessKeySecret) API_CONFIG.OSS.accessKeySecret = ossAccessKeySecret;
    console.log('[DEBUG] 保存后 API_CONFIG.FASTGPT_STYLE:', typeof API_CONFIG.FASTGPT_STYLE, API_CONFIG.FASTGPT_STYLE);
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    // 保存后立即reload，彻底修正结构
    loadConfigFromStorage();
    console.log('[DEBUG] 保存后 localStorage:', localStorage.getItem('boss_kb_config'));
    showToast('配置保存成功', 'success');
    closeDynamicConfigModal();
    if (API_CONFIG.OSS.accessKeyId && API_CONFIG.OSS.accessKeySecret) {
        initializeOSS();
    }
}
function clearAllConfigDynamic() {
    if (confirm('确定要清除所有API配置吗？此操作将清除所有密钥和配置信息。')) {
        localStorage.removeItem('boss_kb_config');
        API_CONFIG.FASTGPT_STYLE.apiKey = '';
        API_CONFIG.FASTGPT_CONTENT.apiKey = '';
        API_CONFIG.OSS.accessKeyId = '';
        API_CONFIG.OSS.accessKeySecret = '';
        showToast('API配置已清除，请重新配置', 'info');
        closeDynamicConfigModal();
    }
}
async function testApiConnectionDynamic() {
    showToast('正在测试API连接...', 'info');
    try {
        // 直接调用FastGPT API（健康检查）
        const response = await fetch(`https://api.fastgpt.in/api/health`);
        if (response.ok) {
            showToast('API连接正常', 'success');
        } else {
            showToast('API连接异常', 'error');
        }
    } catch (error) {
        showToast('API连接失败', 'error');
    }
}
// 全局挂载
window.selectFiles = selectFiles;
window.addUrlInput = addUrlInput;
window.performStyleAnalysis = performStyleAnalysis;
window.addFileToList = addFileToList;
window.removeFile = removeFile;
window.saveUrl = saveUrl;
window.removeUrl = removeUrl;
window.generateContent = generateContent; 
window.showConfigModal = showConfigModal;
window.closeDynamicConfigModal = closeDynamicConfigModal;
window.saveConfigDynamic = saveConfigDynamic;
window.clearAllConfigDynamic = clearAllConfigDynamic;
window.testApiConnectionDynamic = testApiConnectionDynamic;
window.showComingSoonModal = showComingSoonModal;
window.closeComingSoonModal = closeComingSoonModal;
window.showFullscreenModal = showFullscreenModal;
window.closeFullscreenModal = closeFullscreenModal;
window.showPrivacyModal = showPrivacyModal;
window.closePrivacyModal = closePrivacyModal; 

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 页面初始化开始...');
    
    // 从本地存储加载配置
    loadConfigFromStorage();
    
    // 设置默认风格，确保系统始终可用
    const defaultStyle = `### 深度写作风格报告

**一、 风格DNA提炼**
* 这是一种结合专业见解与生动案例的务实写作风格，以通俗易懂且风趣幽默的语言，围绕AI时代产品经理如何把握用户需求展开深入探讨，兼具实用性与趣味性。

**二、 风格元素全景解析**

**Part 1: 作者视角与身份**
* **🕵️‍♂️ 人称运用:**
    * 基本人称: 以第一人称"我"为主，如"我观察身边同学""我在团队也常说一句话"等，让读者感受到作者的亲身参与感。
    * 身份指代: 使用特定昵称"镜哥"代替"我"，增强个人风格与辨识度。
    * *原文示例:* "镜哥觉得，这就像是给一个老式拖拉机装上了F1赛车的引擎……"
* **🔭 视角距离:** 作者是沉浸其中的参与者视角，通过分享亲身经历的项目案例，如报修工单模块的优化过程，拉近与读者的距离，使读者更易产生共鸣。
    * *原文示例:* "咱们来看一个团队早年间做过的、前段时间优化过的、现在看来特别有意思的项目——一个垂直领域的报修工单模块。"

**Part 2: 情感基调与语言温度**
* **🌡️ 整体氛围:**
    * 核心基调: 活泼风趣与严肃理性并存。在描述现象时语言幽默，如"每天叫醒我的不是闹钟，也不是梦想，而是一堆又一堆的AI新名词和刷屏级的应用"；在阐述观点和分析问题时严肃认真，如对如何把握用户真实需求的探讨。
    * 情感强度: 情感表达较为含蓄但富有感染力，通过生动的比喻和具体案例传递观点，引发读者思考。
* **🗣️ 语言温度与特征词:**
    * 语气词/口头禅: 高频使用"于是乎""你看"等语气词和口头禅，增强语言的口语化和流畅感。
    * *原文示例:* "于是乎，一个怪现象出现了：为了AI而AI。""你看，技术在变，但驱动人心的底层逻辑，千百年来，从未改变。"
    * 情绪副词/形容词: 偏爱使用"华丽丽""完美""立竿见影"等情绪副词和形容词，生动形象地表达观点和描述结果。
    * *原文示例:* "然后，产品就华丽丽地……上线了。""我们当时觉得，这多牛啊，逻辑多严谨呀，堪称完美！""这个小小的改动，效果立竿见影。"

**Part 3: 词汇与句法构造**
* **🎨 词汇调色板:**
    * 领域与体裁: 词汇融合商业、技术与生活领域，兼具书面语体与口语语体特点。既使用专业术语如"大语言模型""信息提取"，也有通俗易懂的生活词汇如"手指头粗""麻烦"等。
    * 词语偏好: 爱用成语、网络热词和形象的词组，如"削铁如泥""高摩擦、反人性""AI-Powered"等，使文章更具时代感和表现力。
    * *原文示例:* "兴奋的是，手里似乎多了一把削铁如泥的'屠龙刀'""我们自以为高效的流程，在用户的真实场景里，却是一个'高摩擦、反人性'的设计""你要是不在产品方案里加个'AI-Powered'的标签，咱出门都不好意思跟人打招呼。"
* **🔨 句式工具箱:**
    * 长短句分布: 长短句交错形成节奏感。长句用于详细阐述观点和复杂的业务逻辑，如"系统后台通过语音识别将语音转成文字，再调用大语言模型，对这段自然语言进行'信息提取'"；短句用于突出重点和增强语气，如"为啥？""不。"
    * 标志性句式: 高频使用设问句，如"这有价值吗？当然有。""怎么办？难道要放弃这部分'顽固'的用户吗？不。"引发读者思考，引导行文节奏。
    * *原文示例:* "很多产品都在做'AI智能总结'，把一篇长文、一个视频，一键总结成几百字。这有价值吗？当然有。"

**Part 4: 结构与逻辑流**
* **🗺️ 结构蓝图:**
    * 篇章结构: 采用"观点-论据"的结构。开篇提出AI时代产品经理面临的问题及要探讨的核心观点，即如何从用户真实需求出发；然后通过报修工单模块的案例及多个例子进行论证；最后总结强调产品经理应回归核心价值。
    * 段落构造: 段落平均长度适中，喜欢用短段落制造呼吸感，使文章层次清晰，便于阅读，如在描述报修工单模块的三个阶段时，每个阶段都独立成段进行详细阐述。
* **🔗 逻辑衔接:**
    * 常用过渡词: 使用"首先""其次""然后""但是""反之"等标志性过渡词，使文章逻辑连贯，如"首先，深入场景，做'田野调查'，而不是'键盘侠'""其次，拥抱'懒惰'，做'效率的偏执狂'"。
    * *原文示例:* "首先，深入场景，做'田野调查'，而不是'键盘侠'"
    * 隐性过渡: 通过重复关键词，如"AI""用户需求"等，以及逻辑上的因果、递进关系实现自然衔接，如在阐述AI在不同场景下的应用时，围绕AI对用户需求的满足层层递进。

**Part 5: 修辞与表达技巧**
* **✨ 表达增强器:**
    * 修辞手法: 常用比喻、引用等修辞手法。比喻如"这就像是给一个老式拖拉机装上了F1赛车的引擎"，使抽象的概念更形象易懂；引用如引用傅盛的观点、梁宁老师在书中的论述，增强观点的权威性。
    * *原文示例:* "镜哥觉得，这就像是给一个老式拖拉机装上了F1赛车的引擎，听起来很猛，实际上路跑两圈，要么自己散架，要么把地耕得一塌糊涂。""前两天刚好听了猎豹傅盛傅总的一期播客，他有个观点我深以为然：AI时代，应用和体验才是真正的价值高地。"
    * 论证方式: 偏爱讲述故事/案例和援引名人名言来支撑观点。通过报修工单模块的案例详细说明如何从用户需求出发进行产品优化；引用傅盛、梁宁的观点为论点提供理论依据。
    * *原文示例:* "咱们来看一个团队早年间做过的、前段时间优化过的、现在看来特别有意思的项目——一个垂直领域的报修工单模块。""这也让我想起了梁宁老师在《真需求》这本书里反复强调的——要洞察用户真实的需求，而不是停留在表面的'要什么'。"`;
    
    appState.styleOutput = defaultStyle;
    
    // 显示默认风格
    showStyleAnalysis(defaultStyle);
    
    // 检查API连接状态
    await checkAPIConnection();
    
    // 检查配置并初始化
    checkAPIConfig();
    
    // 初始化OSS客户端（如果配置了）
    if (API_CONFIG.OSS.accessKeyId && API_CONFIG.OSS.accessKeySecret) {
        try {
            await initializeOSS();
            console.log('✅ OSS客户端初始化成功');
        } catch (error) {
            console.error('❌ OSS初始化失败:', error);
        }
    }
    
    // 设置拖拽功能
    setupDragDrop();
    
    // 检查按钮状态
    checkLearningButtonStatus();
    
    // 显示环境信息
    showEnvironmentInfo();
    
    console.log('✅ 页面初始化完成');
    
    // 示例链接复制功能
    const copyTestUrlLink = document.getElementById('copy-test-url-link');
    if (copyTestUrlLink) {
        copyTestUrlLink.addEventListener('click', function() {
            const text = 'https://www.woshipm.com/it/6234959.html';
            navigator.clipboard.writeText(text).then(() => {
                showToast('已复制到剪贴板', 'success');
            });
        });
    }
});

// 显示"功能完善中"弹窗
function showComingSoonModal() {
    // 创建模态框HTML
    const modalHTML = `
        <div id="coming-soon-modal" class="coming-soon-modal">
            <div class="coming-soon-modal-content">
                <div class="coming-soon-modal-header">
                    <h3>
                        <i class="fas fa-tools"></i>
                        功能完善中
                    </h3>
                    <button class="close-coming-soon-btn" onclick="closeComingSoonModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="coming-soon-modal-body">
                    <div class="coming-soon-icon">
                        <i class="fas fa-cog fa-spin"></i>
                    </div>
                    <h4>敬请期待</h4>
                    <p>内容生成功能正在完善中，我们将为您提供更好的体验！</p>
                    <div class="coming-soon-features">
                        <div class="feature-item">
                            <i class="fas fa-magic"></i>
                            <span>智能内容生成</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-palette"></i>
                            <span>个性化风格</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-rocket"></i>
                            <span>高效创作</span>
                        </div>
                    </div>
                </div>
                <div class="coming-soon-modal-footer">
                    <button class="coming-soon-close-btn" onclick="closeComingSoonModal()">
                        知道了
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // 添加模态框到页面
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 显示模态框
    const modal = document.getElementById('coming-soon-modal');
    if (modal) {
        modal.style.display = 'flex';
        // 添加淡入动画
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }
}

// 关闭"功能完善中"弹窗
function closeComingSoonModal() {
    const modal = document.getElementById('coming-soon-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// 全屏查看模态框
function showFullscreenModal() {
    const modal = document.getElementById('fullscreen-modal');
    if (modal) {
        modal.style.display = 'flex';
        // 加载风格分析详情
        const content = document.getElementById('fullscreen-content');
        if (content && appState.styleOutput) {
            content.innerHTML = marked.parse(appState.styleOutput);
        }
    }
}

// 关闭全屏模态框
function closeFullscreenModal() {
    const modal = document.getElementById('fullscreen-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 显示隐私配置模态框
function showPrivacyModal() {
    const modal = document.querySelector('.privacy-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭隐私配置模态框
function closePrivacyModal() {
    const modal = document.querySelector('.privacy-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// GitHub Pages模式启用函数
function enableGitHubPagesMode() {
    console.log('🚀 启用GitHub Pages模式...');
    
    // 显示CORS解决方案说明
    const corsGuide = `
🌐 GitHub Pages环境CORS解决方案：

由于GitHub Pages是静态托管，无法运行Node.js代理服务器，
所以直接调用FastGPT API会遇到CORS跨域限制。

📋 解决方案：

方案1: 使用浏览器扩展（推荐）
1. 安装"CORS Unblock"或"Disable CORS"浏览器扩展
2. 启用扩展后刷新页面
3. 正常使用所有功能

方案2: 启动Chrome无安全模式
1. 关闭所有Chrome窗口
2. 以无安全模式启动Chrome：
   chrome.exe --disable-web-security --disable-features=VizDisplayCompositor --user-data-dir=temp
3. 在无安全模式下访问页面

方案3: 本地运行（最佳体验）
1. 下载项目源代码
2. 运行: npm install && npm start
3. 访问: http://localhost:3001

✅ 当前API配置已优化为GitHub Pages模式
    `;
    
    console.log(corsGuide);
    
    // 显示用户友好的提示
    alert(`🌐 GitHub Pages模式已启用！

由于浏览器CORS限制，推荐以下解决方案：

1. 【推荐】安装CORS浏览器扩展
2. 或者下载源码本地运行
3. 详细说明请查看浏览器控制台

点击确定后将尝试直接调用API...`);
    
    // 测试API连接
    testGitHubPagesAPI();
}

// 测试GitHub Pages API连接
async function testGitHubPagesAPI() {
    try {
        console.log('🧪 测试GitHub Pages API连接...');
        
        const response = await fetch('https://api.fastgpt.in/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.FASTGPT_STYLE.apiKey}`
            },
            body: JSON.stringify({
                chatId: 'github-pages-test',
                stream: false,
                messages: [{ role: 'user', content: '测试连接' }]
            })
        });
        
        if (response.ok) {
            console.log('✅ GitHub Pages API连接成功！');
            alert('✅ API连接测试成功！您可以正常使用所有功能了。');
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ GitHub Pages API连接失败:', error);
        console.log('💡 解决方案：请安装CORS浏览器扩展或本地运行项目');
        
        alert(`❌ API连接失败！

错误信息：${error.message}

解决方案：
1. 安装"CORS Unblock"浏览器扩展
2. 或下载源码本地运行获得最佳体验

详情请查看控制台...`);
    }
}

// 全局暴露函数供控制台调用
window.enableGitHubPagesMode = enableGitHubPagesMode;

// ==================== 新增功能函数 ====================

// 编辑生成的内容
function editGeneratedContent() {
    const resultContent = document.getElementById('result-content');
    if (!resultContent || !appState.generatedContent) {
        showToast('没有可编辑的内容', 'warning');
        return;
    }
    
    // 创建编辑模态框
    const modal = document.createElement('div');
    modal.className = 'edit-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        width: 90%;
        max-width: 1200px;
        height: 80%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;
    
    modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>编辑内容</h3>
            <button onclick="this.closest('.edit-modal').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
        </div>
        <textarea id="edit-textarea" style="
            flex: 1;
            min-height: 400px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            font-size: 16px;
            line-height: 1.8;
            resize: vertical;
            outline: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        ">${appState.generatedContent}</textarea>
        <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
            <button onclick="this.closest('.edit-modal').remove()" style="
                padding: 10px 20px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            ">取消</button>
            <button onclick="saveEditedContent()" style="
                padding: 10px 20px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            ">保存</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

// 保存编辑的内容
function saveEditedContent() {
    const textarea = document.getElementById('edit-textarea');
    if (!textarea) return;
    
    const newContent = textarea.value;
    if (newContent.trim() === '') {
        showToast('内容不能为空', 'warning');
        return;
    }
    
    // 更新全局状态
    appState.generatedContent = newContent;
    
    // 更新显示内容
    const resultContent = document.getElementById('result-content');
    if (resultContent) {
        resultContent.innerHTML = marked.parse(newContent);
        
        // 更新字数统计
        updateWordCount(newContent);
    }
    
    // 关闭模态框
    document.querySelector('.edit-modal').remove();
    
    showToast('内容已更新', 'success');
}

// 下载生成的内容
function downloadGeneratedContent() {
    if (!appState.generatedContent) {
        showToast('没有可下载的内容', 'warning');
        return;
    }
    
    // 获取主题作为文件名
    const topicEl = document.getElementById('topic');
    const topic = topicEl ? topicEl.value.trim() || '生成内容' : '生成内容';
    const timestamp = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    const filename = `${topic}_${timestamp}.md`;
    
    // 创建下载链接
    const blob = new Blob([appState.generatedContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
    
    showToast(`文件已下载：${filename}`, 'success');
}

// 同步到飞书文档
async function syncToFeishu() {
    if (!appState.generatedContent) {
        showToast('没有可同步的内容', 'warning');
        return;
    }
    
    // 检查飞书配置
    if (!checkFeishuConfig()) {
        showToast('请先完成飞书配置：点击右下角设置按钮 → 飞书文档配置 → 填写App ID和App Secret → 保存', 'warning');
        return;
    }
    
    // 飞书API支持直接调用，无需代理
    
    try {
        const syncBtn = document.querySelector('.sync-btn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        showToast('正在同步到飞书文档...', 'info');
        
        // 获取访问令牌
        const accessToken = await getFeishuAccessToken();
        
        // 获取主题作为文档标题
        const topicEl = document.getElementById('topic');
        const title = topicEl ? topicEl.value.trim() || '生成内容' : '生成内容';
        
        let docUrl;
        
        if (API_CONFIG.FEISHU.docToken) {
            // 更新现有文档
            docUrl = await updateFeishuDoc(accessToken, API_CONFIG.FEISHU.docToken, appState.generatedContent);
        } else {
            // 创建新文档
            const result = await createFeishuDoc(accessToken, title, appState.generatedContent);
            docUrl = result.url;
            
            // 保存文档Token供下次使用
            API_CONFIG.FEISHU.docToken = result.docToken;
            saveConfigToStorage();
        }
        
        showToast('已成功同步到飞书文档', 'success');
        
        // 询问是否打开文档
        if (confirm('同步成功！是否打开飞书文档？')) {
            window.open(docUrl, '_blank');
        }
        
    } catch (error) {
        console.error('飞书同步失败:', error);
        showToast(`飞书同步失败: ${error.message}`, 'error');
    } finally {
        const syncBtn = document.querySelector('.sync-btn');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
        }
    }
}

// 获取飞书访问令牌
async function getFeishuAccessToken() {
    // 飞书API直接调用，无需环境区分
    const apiUrl = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            app_id: API_CONFIG.FEISHU.appId,
            app_secret: API_CONFIG.FEISHU.appSecret
        })
    };
    
    console.log('🔑 获取飞书访问令牌:', { apiUrl });
    
    const response = await fetch(apiUrl, requestOptions);
    
    if (!response.ok) {
        throw new Error(`获取访问令牌失败: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.code !== 0) {
        throw new Error(`获取访问令牌失败: ${result.msg}`);
    }
    
    return result.tenant_access_token;
}

// 创建飞书文档
async function createFeishuDoc(accessToken, title, content) {
    // 飞书API直接调用创建文档
    const apiUrl = 'https://open.feishu.cn/open-apis/docx/v1/documents';
    const requestOptions = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: title,
            folder_token: '' // 可以指定文件夹
        })
    };
    
    // 先创建文档
    const createResponse = await fetch(apiUrl, requestOptions);
    
    if (!createResponse.ok) {
        throw new Error(`创建文档失败: ${createResponse.status}`);
    }
    
    const createResult = await createResponse.json();
    if (createResult.code !== 0) {
        throw new Error(`创建文档失败: ${createResult.msg}`);
    }
    
    const docToken = createResult.data.document.document_id;
    
    // 更新文档内容
    await updateFeishuDocContent(accessToken, docToken, content);
    
    return {
        docToken: docToken,
        url: `https://docs.feishu.cn/docx/${docToken}`
    };
}

// 更新飞书文档
async function updateFeishuDoc(accessToken, docToken, content) {
    await updateFeishuDocContent(accessToken, docToken, content);
    return `https://docs.feishu.cn/docx/${docToken}`;
}

// 更新飞书文档内容
async function updateFeishuDocContent(accessToken, docToken, content) {
    // 转换markdown为飞书文档格式
    const blocks = convertMarkdownToFeishuBlocks(content);
    
    // 飞书API直接调用更新文档
    const apiUrl = `https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}/blocks/batch_update`;
    const requestOptions = {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            requests: [{
                request_id: Date.now().toString(),
                request_type: 'INSERT',
                insert_payload: {
                    element: {
                        block_type: 'text',
                        text: {
                            style: {},
                            elements: blocks
                        }
                    },
                    location: {
                        zone_id: 'body'
                    }
                }
            }]
        })
    };
    
    const response = await fetch(apiUrl, requestOptions);
    
    if (!response.ok) {
        throw new Error(`更新文档内容失败: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.code !== 0) {
        throw new Error(`更新文档内容失败: ${result.msg}`);
    }
}

// 转换Markdown为飞书文档格式
function convertMarkdownToFeishuBlocks(content) {
    // 简单的Markdown转换，可以根据需要扩展
    const lines = content.split('\n');
    const blocks = [];
    
    lines.forEach(line => {
        if (line.trim()) {
            blocks.push({
                tag: 'text',
                text: line
            });
        }
    });
    
    return blocks;
}

// 更新字数统计
function updateWordCount(content) {
    const wordCount = content.length;
    const wordCountDisplay = document.getElementById('word-count-display');
    if (wordCountDisplay) {
        wordCountDisplay.textContent = `约 ${wordCount} 字`;
    }
}

// 加载飞书配置
function loadFeishuConfig() {
    const feishuAppIdEl = document.getElementById('feishu-app-id');
    const feishuAppSecretEl = document.getElementById('feishu-app-secret');
    const feishuDocTokenEl = document.getElementById('feishu-doc-token');
    
    if (feishuAppIdEl) feishuAppIdEl.value = API_CONFIG.FEISHU.appId;
    if (feishuAppSecretEl) feishuAppSecretEl.value = API_CONFIG.FEISHU.appSecret;
    if (feishuDocTokenEl) feishuDocTokenEl.value = API_CONFIG.FEISHU.docToken;
}

// 保存飞书配置
function saveFeishuConfig() {
    saveConfigToStorage();
}

// 重写配置保存函数以包含飞书配置
function saveConfigToStorage() {
    try {
        // 保存飞书配置到API_CONFIG
        const feishuAppIdEl = document.getElementById('feishu-app-id');
        const feishuAppSecretEl = document.getElementById('feishu-app-secret');
        const feishuDocTokenEl = document.getElementById('feishu-doc-token');
        
        if (feishuAppIdEl) API_CONFIG.FEISHU.appId = feishuAppIdEl.value.trim();
        if (feishuAppSecretEl) API_CONFIG.FEISHU.appSecret = feishuAppSecretEl.value.trim();
        if (feishuDocTokenEl) API_CONFIG.FEISHU.docToken = feishuDocTokenEl.value.trim();
        
        // 保存到本地存储
        localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
        console.log('✅ 配置已保存到本地存储（包含飞书配置）');
    } catch (error) {
        console.error('❌ 配置保存失败:', error);
    }
}

// 在页面加载时加载飞书配置
document.addEventListener('DOMContentLoaded', function() {
    // 延迟加载飞书配置，确保元素已存在
    setTimeout(loadFeishuConfig, 1000);
});

// ==================== 飞书配置管理功能 ====================

// 保存飞书配置
function saveFeishuConfig() {
    try {
        const feishuAppIdEl = document.getElementById('feishu-app-id');
        const feishuAppSecretEl = document.getElementById('feishu-app-secret');
        const feishuDocTokenEl = document.getElementById('feishu-doc-token');
        
        if (!feishuAppIdEl || !feishuAppSecretEl) {
            showToast('未找到飞书配置输入框', 'error');
            return;
        }

        // 更新API_CONFIG
        API_CONFIG.FEISHU.appId = feishuAppIdEl.value.trim();
        API_CONFIG.FEISHU.appSecret = feishuAppSecretEl.value.trim();
        API_CONFIG.FEISHU.docToken = feishuDocTokenEl ? feishuDocTokenEl.value.trim() : '';

        // 验证必填字段
        if (!API_CONFIG.FEISHU.appId) {
            showToast('请输入飞书App ID', 'warning');
            feishuAppIdEl.focus();
            return;
        }
        if (!API_CONFIG.FEISHU.appSecret) {
            showToast('请输入飞书App Secret', 'warning');
            feishuAppSecretEl.focus();
            return;
        }

        // 保存到本地存储
        saveConfigToStorage();
        
        // 保存成功反馈
        const saveBtn = event.target;
        const originalHTML = saveBtn.innerHTML;
        const originalBg = saveBtn.style.background;
        
        saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 8px;"></i>已保存';
        saveBtn.style.background = '#4caf50';
        saveBtn.disabled = true;
        
        setTimeout(() => {
            saveBtn.innerHTML = originalHTML;
            saveBtn.style.background = originalBg;
            saveBtn.disabled = false;
        }, 2000);
        
        showToast('飞书配置已保存', 'success');
        console.log('✅ 飞书配置已保存:', {
            appId: API_CONFIG.FEISHU.appId,
            appSecret: API_CONFIG.FEISHU.appSecret ? '***已设置***' : '未设置',
            docToken: API_CONFIG.FEISHU.docToken || '未设置'
        });
        
    } catch (error) {
        console.error('❌ 飞书配置保存失败:', error);
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 检查飞书配置状态
function checkFeishuConfig() {
    const hasAppId = API_CONFIG.FEISHU && API_CONFIG.FEISHU.appId;
    const hasAppSecret = API_CONFIG.FEISHU && API_CONFIG.FEISHU.appSecret;
    
    if (hasAppId && hasAppSecret) {
        console.log('✅ 飞书配置完整');
        return true;
    } else {
        console.log('⚠️ 飞书配置不完整:', {
            appId: hasAppId ? '已设置' : '未设置',
            appSecret: hasAppSecret ? '已设置' : '未设置'
        });
        return false;
    }
}

// 全局暴露新增的功能函数（在函数定义之后）
window.editGeneratedContent = editGeneratedContent;
window.downloadGeneratedContent = downloadGeneratedContent;
window.syncToFeishu = syncToFeishu;
window.saveEditedContent = saveEditedContent;
window.saveFeishuConfig = saveFeishuConfig;
window.checkFeishuConfig = checkFeishuConfig; 