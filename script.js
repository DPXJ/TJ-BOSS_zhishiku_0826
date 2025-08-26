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
        baseUrl: 'https://api.fastgpt.in/api', // FastGPT官方API地址
        apiKey: 'fastgpt-uWWVnoPpJIc57h6BiLumhzeyk89gfyPmQCCYn8R214C71i6tL6Pa5Gsov7NnIYH', // 写死的风格分析密钥
        workflowId: '685f87df49b71f158b57ae61' // 风格分析工作流ID（已修正）
    },
    // FastGPT配置 - 内容生成
    FASTGPT_CONTENT: {
        baseUrl: 'https://api.fastgpt.in/api', // FastGPT官方API地址
        apiKey: 'fastgpt-p2WSK5LRZZM3tVzk0XRT4vERkQ2PYLXi6rFAZdHzzuB7mSicDLRBXiymej', // 写死的内容生成密钥
        workflowId: '685c9d7e6adb97a0858caaa6' // 内容创作工作流ID（已修正）
    },
    // 飞书配置
    FEISHU: {
        appId: '',
        appSecret: '',
        docToken: '', // 可选，用于更新现有文档
        appToken: '', // 多维表格App Token
        tableId: ''   // 多维表格Table ID
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
let actualBucket = null; // 实际可用的bucket名称

async function initializeOSS() {
    if (!API_CONFIG.OSS.accessKeyId || !API_CONFIG.OSS.accessKeySecret) {
        console.warn('⚠️ OSS配置不完整，文件上传功能将不可用');
        console.warn('💡 提示：如需使用文件上传功能，请在配置中填写OSS AccessKey信息');
        showToast('OSS配置不完整，文件上传功能暂时不可用', 'warning');
        return;
    }
    
    try {
        // 先创建基础OSS客户端（不指定bucket）
        ossClient = new OSS({
            region: API_CONFIG.OSS.region,
            accessKeyId: API_CONFIG.OSS.accessKeyId,
            accessKeySecret: API_CONFIG.OSS.accessKeySecret,
            secure: true,
            timeout: 60000
        });
        
        console.log('OSS客户端基础初始化成功');
        
        // 自动查找或创建可用的bucket
        await setupBucket();
        
    } catch (error) {
        console.error('OSS初始化失败:', error);
        showToast('OSS初始化失败，文件上传功能暂时不可用', 'warning');
        // 不要抛出错误，让应用继续运行
    }
}

// 设置bucket - 直接使用指定的bucket
async function setupBucket() {
    try {
        // 直接使用配置的bucket
        actualBucket = API_CONFIG.OSS.bucket;
        console.log('使用指定的bucket:', actualBucket);
        
        // 重新初始化OSS客户端，指定bucket
        ossClient = new OSS({
            region: API_CONFIG.OSS.region,
            accessKeyId: API_CONFIG.OSS.accessKeyId,
            accessKeySecret: API_CONFIG.OSS.accessKeySecret,
            bucket: actualBucket,
            secure: true,
            timeout: 60000
        });
        
        console.log('✅ OSS完整初始化成功，使用bucket:', actualBucket);
        
        // 测试bucket连接和权限
        await testOSSUpload();
        
        showToast('OSS连接成功', 'success');
        
    } catch (error) {
        console.error('OSS设置失败:', error);
        
        if (error.status === 403) {
            showToast('OSS权限不足，请检查AccessKey权限', 'error');
        } else if (error.status === 404) {
            showToast('Bucket不存在，请检查bucket名称', 'error');
        } else {
            showToast('OSS连接失败: ' + error.message, 'error');
        }
    }
}

// 测试OSS上传功能
async function testOSSUpload() {
    try {
        const testFile = new Blob(['OSS test'], { type: 'text/plain' });
        const testFilename = `test/${Date.now()}-test.txt`;
        
        const result = await ossClient.put(testFilename, testFile);
        console.log('✅ OSS上传测试成功');
        
        // 清理测试文件
        await ossClient.delete(testFilename);
        console.log('✅ OSS删除测试成功');
        
        updateAnalysisStatus('OSS配置完成，可以上传文件');
        
    } catch (error) {
        console.error('OSS功能测试失败:', error);
        throw error;
    }
}

// 简化的文件上传到OSS
async function uploadFilesToOSS(files) {
    if (!ossClient || !actualBucket) {
        throw new Error('OSS未正确配置。请在配置中填写正确的OSS AccessKey信息后重试。');
    }
    
    const uploadResults = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = `boss-kb/${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;
        
        try {
            console.log(`正在上传文件: ${file.name}`);
            
            const result = await ossClient.put(filename, file, {
                headers: {
                    'Content-Type': file.type || 'application/octet-stream'
                }
            });
            
            console.log(`✅ 文件上传成功: ${file.name}`);
            uploadResults.push(result.url);
            
        } catch (error) {
            console.error(`❌ 文件上传失败: ${file.name}`, error);
            
            // 提供更详细的错误信息
            if (error.name === 'SignatureDoesNotMatchError') {
                throw new Error(`文件 ${file.name} 上传失败：OSS签名验证失败，请检查AccessKey配置是否正确`);
            } else if (error.status === 403) {
                throw new Error(`文件 ${file.name} 上传失败：OSS权限不足，请检查AccessKey权限设置`);
            } else if (error.status === 404) {
                throw new Error(`文件 ${file.name} 上传失败：OSS Bucket不存在，请检查Bucket名称`);
            } else {
                throw new Error(`文件 ${file.name} 上传失败: ${error.message}`);
            }
        }
    }
    
    return uploadResults;
}

// 调用FastGPT工作流接口（风格分析）
async function callStyleAnalysisWorkflow(fileUrls, userUrls) {
    // 保证参数为数组
    const safeFileUrls = Array.isArray(fileUrls) ? fileUrls : [];
    const safeUserUrls = Array.isArray(userUrls) ? userUrls : [];
    console.log('🔄 调用FastGPT风格分析工作流...');
    console.log('文件URLs:', safeFileUrls);
    console.log('用户URLs:', safeUserUrls);
    if (!API_CONFIG.FASTGPT_STYLE.workflowId) {
        throw new Error('风格分析工作流ID未配置，请先配置workflowId');
    }
    const response = await fetch(`/api/fastgpt/workflow/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.FASTGPT_STYLE.apiKey}`
        },
        body: JSON.stringify({
            workflowId: API_CONFIG.FASTGPT_STYLE.workflowId,
            variables: {
                article_input: safeFileUrls,  // 文件URL数组
                url_input: safeUserUrls      // 用户输入URL数组
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
    
    // 详细调试响应结构
    console.log('🔍 调试 - 响应结构分析:');
    console.log('- result类型:', typeof result);
    console.log('- result键名:', Object.keys(result || {}));
    
    if (result && result.data) {
        console.log('- result.data类型:', typeof result.data);
        console.log('- result.data键名:', Object.keys(result.data || {}));
    }
    
    // 尝试多种可能的路径提取style_output
    let styleOutput = null;
    
    if (result && result.style_output) {
        console.log('✓ 在 result.style_output 找到内容');
        styleOutput = result.style_output;
    } else if (result && result.data && result.data.style_output) {
        console.log('✓ 在 result.data.style_output 找到内容');
        styleOutput = result.data.style_output;
    } else if (result && result.outputs && result.outputs.style_output) {
        console.log('✓ 在 result.outputs.style_output 找到内容');
        styleOutput = result.outputs.style_output;
    } else if (result && result.variables && result.variables.style_output) {
        console.log('✓ 在 result.variables.style_output 找到内容');
        styleOutput = result.variables.style_output;
    } else {
        console.warn('❌ 在所有预期路径都未找到style_output变量');
        console.log('🔍 完整响应内容:', JSON.stringify(result, null, 2));
        
        // 尝试返回整个结果让用户看到实际结构
        throw new Error('无法找到style_output变量，请检查工作流输出配置');
    }
    
    console.log('✅ 提取到的style_output内容:', styleOutput);
    return styleOutput;
}



// 调用FastGPT工作流接口（内容生成）
async function callContentGenerationWorkflow(styleOutput, contentLength, topic, styleType, remark) {
    console.log('🔄 调用FastGPT内容生成工作流...');
    console.log('参数:', { styleOutput, contentLength, topic, styleType, remark });
    
    if (!API_CONFIG.FASTGPT_CONTENT.workflowId) {
        throw new Error('内容生成工作流ID未配置，请先配置workflowId');
    }

    // 构建详细的prompt
    const prompt = `请根据以下要求生成内容：

主题：${topic}
字数要求：${contentLength}字
风格要求：${styleType}
补充说明：${remark || '无'}

请严格按照提供的风格分析报告进行内容创作，确保生成的内容符合指定的字数要求和风格特点。`;

    // 构建请求体
    const requestBody = {
        chatId: Date.now().toString(),
        stream: false,
        detail: true,
        workflowId: API_CONFIG.FASTGPT_CONTENT.workflowId,
        messages: [{ role: 'user', content: prompt }],
        variables: {
            style_output: styleOutput,
            content_length: contentLength,
            topic: topic,
            style_type: styleType,
            remark: remark || ''
        }
    };

    // 打印完整请求体用于调试
    console.log('📤 发送到FastGPT的完整请求:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`/api/fastgpt/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.FASTGPT_CONTENT.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('FastGPT工作流错误响应:', response.status, errorText);
        throw new Error(`内容生成工作流调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastGPT内容生成工作流响应:', JSON.stringify(result, null, 2));
    
    // 优先从newVariables.AIcontent_output获取内容
    if (result?.newVariables?.AIcontent_output) {
        console.log('✅ 从newVariables.AIcontent_output获取内容:', result.newVariables.AIcontent_output);
        return result.newVariables.AIcontent_output;
    }
    
    // 备用：从choices中获取内容
    if (result?.choices?.[0]?.message?.content) {
        console.log('✅ 从choices[0].message.content获取内容:', result.choices[0].message.content);
        return result.choices[0].message.content;
    }
    
    // 尝试从responseData中查找
    if (result?.responseData) {
        for (const item of result.responseData) {
            // 检查outputs字段
            if (item.outputs?.content) {
                console.log('从responseData.outputs.content获取内容:', item.outputs.content);
                return item.outputs.content;
            }
            // 检查text字段
            if (item.text) {
                console.log('从responseData.text获取内容:', item.text);
                return item.text;
            }
            // 检查content字段
            if (item.content) {
                console.log('从responseData.content获取内容:', item.content);
                return item.content;
            }
        }
    }
    
    // 检查newVariables中的其他可能字段
    if (result?.newVariables) {
        const possibleKeys = ['content', 'text', 'output', 'result', 'response'];
        for (const key of possibleKeys) {
            if (result.newVariables[key]) {
                console.log(`从newVariables.${key}获取内容:`, result.newVariables[key]);
                return result.newVariables[key];
            }
        }
    }
    
    console.warn('工作流响应格式异常:', result);
    throw new Error('无法从工作流获取内容生成结果');
}

// 新增：FastGPT 对话接口调用（支持自定义API密钥和workflowId）
async function callChatCompletions(messages, customUid = null, variables = null, apiKey = null, workflowId = null) {
    console.log('🔄 调用FastGPT对话接口...');
    console.log('消息:', messages);
    console.log('变量:', variables);
    
    // 生成或使用已存在的chatId
    if (!appState.chatId) {
        appState.chatId = Date.now().toString();
    }
    
    const requestBody = {
        chatId: appState.chatId,
        stream: false,
        detail: true,
        messages: messages
    };
    
    // 如果提供了自定义用户ID，添加到请求中
    if (customUid) {
        requestBody.customUid = customUid;
    }
    
    // 如果提供了variables，添加到请求中
    if (variables) {
        requestBody.variables = variables;
    }
    // 如果提供了workflowId，添加到请求中（FastGPT官方支持）
    if (workflowId) {
        requestBody.workflowId = workflowId;
    }
    
    const response = await fetch(`/api/fastgpt/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.FASTGPT_CONTENT.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('FastGPT对话接口错误响应:', response.status, errorText);
        
        // 特殊处理常见错误
        if (errorText.includes('Key is error')) {
            throw new Error('API密钥错误：请使用应用专用密钥而不是账户密钥');
        }
        
        throw new Error(`对话接口调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastGPT对话接口响应:', result);
    
    // 优先从newVariables.AIcontent_output获取内容
    if (result.newVariables?.AIcontent_output) {
        console.log('✅ 从newVariables.AIcontent_output获取内容:', result.newVariables.AIcontent_output);
        return result.newVariables.AIcontent_output;
    }
    
    // 备用：从标准对话响应中提取内容
    if (result && result.choices && result.choices[0] && result.choices[0].message) {
        return result.choices[0].message.content;
    }
    
    console.warn('对话接口响应格式异常:', result);
    throw new Error('无法从对话接口获取响应内容');
}

// 新增：调用对话接口并返回完整响应
async function callChatCompletionsRaw(messages, customUid = null, variables = null, apiKey = null, workflowId = null) {
    console.log('🔄 调用FastGPT对话接口...');
    console.log('消息:', messages);
    console.log('变量:', variables);
    
    // 生成或使用已存在的chatId
    if (!appState.chatId) {
        appState.chatId = Date.now().toString();
    }
    
    const requestBody = {
        chatId: appState.chatId,
        stream: false,
        detail: true,
        messages: messages
    };
    
    // 如果提供了自定义用户ID，添加到请求中
    if (customUid) {
        requestBody.customUid = customUid;
    }
    
    // 如果提供了variables，添加到请求中
    if (variables) {
        requestBody.variables = variables;
    }
    // 如果提供了workflowId，添加到请求中（FastGPT官方支持）
    if (workflowId) {
        requestBody.workflowId = workflowId;
    }
    
    const response = await fetch(`/api/fastgpt/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.FASTGPT_CONTENT.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('FastGPT对话接口错误响应:', response.status, errorText);
        
        // 特殊处理常见错误
        if (errorText.includes('Key is error')) {
            throw new Error('API密钥错误：请使用应用专用密钥而不是账户密钥');
        }
        
        throw new Error(`对话接口调用失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastGPT对话接口响应:', result);
    
    // 返回完整的响应
    return result;
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

// 新增：获取完整的对话接口响应（包含newVariables）
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
    
    const rawResponse = await callChatCompletionsRaw(messages, null, variables, API_CONFIG.FASTGPT_STYLE.apiKey, API_CONFIG.FASTGPT_STYLE.workflowId);
    
    // 提取style_output
    let styleOutput = '';
    if (rawResponse.newVariables?.style_output) {
        styleOutput = rawResponse.newVariables.style_output;
    } else if (rawResponse.choices && rawResponse.choices[0] && rawResponse.choices[0].message) {
        styleOutput = rawResponse.choices[0].message.content;
    }
    
    return {
        style_output: styleOutput,
        content: styleOutput,
        raw: rawResponse
    };
}

// 新增：使用对话接口进行内容生成
async function generateContentWithChat(styleOutput, contentLength, topic, styleType, remark) {
    // 构建详细的prompt
    const prompt = `请根据以下要求生成内容：

主题：${topic}
字数要求：${contentLength}字
风格要求：${styleType}
补充说明：${remark || '无'}

请严格按照提供的风格分析报告进行内容创作，确保生成的内容符合指定的字数要求和风格特点。`;

    const messages = [
        {
            role: "user",
            content: prompt
        }
    ];
    
    // 构建变量对象
    const variables = {
        style_output: styleOutput,
        content_length: contentLength,
        topic: topic,
        style_type: styleType,
        remark: remark || ''
    };
    
    console.log('🔄 内容生成 - 传递的变量:', variables);
    
    return await callChatCompletions(
        messages, 
        null, // customUid
        variables, // variables
        API_CONFIG.FASTGPT_CONTENT.apiKey, // apiKey
        API_CONFIG.FASTGPT_CONTENT.workflowId // workflowId
    );
}

// 辅助函数：获取内容类型显示名称
function getContentTypeDisplayName(type) {
    const typeMap = {
        'formal_speech': '正式发言稿',
        'casual_speech': '随性讲话稿',
        'work_email': '工作邮件',
        'default': '按文章风格输出'
    };
    return typeMap[type] || '文档';
}

// 本地备用内容生成
function generateFallbackContent(topic, contentType, contentLength, notes) {
    const templates = {
        formal_speech: `各位同事：

大家好！今天我要就"${topic}"这个重要议题与大家交流。

通过深入分析和思考，我认为我们需要从以下几个方面来推进这项工作：

一、充分认识重要性
${topic}关系到我们整体发展大局，必须高度重视，统一思想，形成共识。

二、明确目标任务
我们的目标是要通过扎实有效的工作，确保各项任务落实到位，取得实实在在的成果。

三、强化责任担当
各部门要切实履行职责，主动作为，确保工作有序推进，不出任何纰漏。

${notes ? `\n补充说明：\n${notes}` : ''}

希望大家以高度的责任感和使命感，全力以赴做好相关工作。我相信，在大家的共同努力下，我们一定能够圆满完成各项任务。

谢谢大家！`,

        casual_speech: `大家好！

今天想和大家聊聊"${topic}"这个话题。

说实话，这个事情挺重要的，我觉得咱们得好好琢磨琢磨。我的想法是这样的：

首先，咱们得把这事儿看重了。${topic}虽然看起来可能不起眼，但实际上挺关键的，关系到咱们后面的发展。

然后呢，咱们得想想怎么做。我觉得可以这样：大家先各自梳理一下手头的事情，看看哪些和这个相关，然后咱们再一起讨论讨论。

${notes ? `\n顺便说一下：\n${notes}` : ''}

总的来说，这事儿不复杂，关键是大家一起努力，我相信肯定能搞定的。

谢谢大家！`,

        work_email: `各位同事：

关于"${topic}"事宜，现将相关安排通知如下：

根据工作需要和实际情况，经研究决定，就此项工作做出如下安排：

1. 各部门要高度重视，认真组织实施
2. 严格按照时间节点，确保各项工作按时完成
3. 加强沟通协调，及时解决工作中遇到的问题

${notes ? `\n特别说明：\n${notes}` : ''}

请各位同事务必按照要求抓好落实。如有疑问，请及时与我联系。

此致
敬礼！`,

        default: `关于${topic}

${topic}是当前需要重点关注和推进的重要工作。通过深入分析研究，现就相关事项说明如下：

一、基本情况
${topic}涉及多个方面，需要统筹考虑，协调推进。

二、主要措施
1. 明确工作目标和时间节点
2. 强化责任分工和协调配合
3. 确保各项工作落实到位

${notes ? `\n备注：\n${notes}` : ''}

以上内容请各相关方面认真执行，确保工作顺利推进。`,


    };
    
    let content = templates[contentType] || templates.default;
    
    // 根据字数要求调整内容长度
    if (contentLength && contentLength < 300) {
        // 简化版本
        const lines = content.split('\n');
        content = lines.slice(0, Math.ceil(lines.length * 0.6)).join('\n');
    } else if (contentLength && contentLength > 800) {
        // 详细版本
        content += '\n\n我们要以高度的责任感和使命感，确保各项工作落实到位，不辜负组织的信任和期望。同时，要注重工作方法和效率，在保证质量的前提下，提高工作效率，确保按时完成各项任务。';
    }
    
    return content;
}

// 文件上传功能
function selectFiles() {
    console.log('🔥 selectFiles函数被调用');
    // 检查OSS是否已配置
    if (!API_CONFIG.OSS.accessKeyId || !API_CONFIG.OSS.accessKeySecret) {
        console.log('⚠️ OSS未配置');
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

// 文件上传处理已移至selectFiles()函数，避免重复处理

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

function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch(ext) {
        case 'pdf': return 'pdf';
        case 'doc':
        case 'docx': return 'word';
        case 'txt': return 'alt';
        default: return 'alt';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// URL 输入功能
function addUrlInput() {
    console.log('🔥 addUrlInput函数被调用');
    const urlInputs = document.getElementById('url-inputs');
    console.log('🔥 找到的url-inputs元素:', urlInputs);
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

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// 检查AI学习按钮状态
function checkLearningButtonStatus() {
    const learningBtn = document.getElementById('start-learning-btn');
    if (!learningBtn) return;
    
    const hasFiles = appState.uploadedFiles.length > 0;
    const hasUrls = appState.urls.length > 0;
    const hasContent = hasFiles || hasUrls;
    
    if (hasContent && !appState.isAnalyzing) {
        learningBtn.disabled = false;
        learningBtn.innerHTML = '<i class="fas fa-brain"></i> 开始AI学习';
    } else if (appState.isAnalyzing) {
        learningBtn.disabled = true;
        learningBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在学习中...';
    } else {
        learningBtn.disabled = true;
        learningBtn.innerHTML = '<i class="fas fa-brain"></i> 开始AI学习';
    }
}

// 移除了手动输入相关函数，现在风格内容在第2部分的textarea中

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
    collectAllUrls();
    if (!Array.isArray(appState.fileUrls)) appState.fileUrls = [];
    if (!Array.isArray(appState.urls)) appState.urls = [];
    const article_input = Array.isArray(appState.fileUrls) ? [...appState.fileUrls] : [];
    const url_input = Array.isArray(appState.urls) ? [...appState.urls] : [];
    
    if (article_input.length === 0 && url_input.length === 0) {
        showToast('请先上传文件或添加链接', 'info');
        return;
    }
    
    // 显示进度条和加载状态
    showProgressBar('ai-learning', '开始AI学习', '正在分析风格内容...');
    updateProgress(10);
    appState.isAnalyzing = true;
    updateAnalysisStatus('正在分析风格...');
    checkLearningButtonStatus();
    try {
        updateProgress(30);
        updateProgressStatus('正在处理输入内容...');
        
        let styleOutput;
        let debugRaw = {};
        
        // 构建输入内容
        let allInputs = [];
        if (article_input.length > 0) allInputs.push(...article_input);
        if (url_input.length > 0) allInputs.push(...url_input);
        
        console.log('风格分析输入内容:', allInputs);
        updateProgress(50);
        updateProgressStatus('正在调用AI分析接口...');
        
        if (API_CONFIG.MODE === 'chat') {
            if (!API_CONFIG.FASTGPT_STYLE.apiKey) {
                throw new Error('对话模式需要配置风格分析API密钥');
            }
            // chat模式返回的就是style_output
            const chatResponse = await analyzeStyleWithChatRaw(allInputs, []);
            styleOutput = chatResponse.style_output || chatResponse.content;
            debugRaw = chatResponse.raw || { style_output: styleOutput };
        } else if (API_CONFIG.MODE === 'workflow') {
            if (!API_CONFIG.FASTGPT_STYLE.workflowId || !API_CONFIG.FASTGPT_STYLE.apiKey) {
                throw new Error('工作流模式需要配置API密钥和工作流ID');
            }
            // workflow模式返回完整响应
            const result = await callStyleAnalysisWorkflowRaw(allInputs, []);
            styleOutput = result.style_output;
            debugRaw = result;
        } else {
            throw new Error('请设置正确的接口模式（chat 或 workflow）');
        }
        updateProgress(80);
        updateProgressStatus('正在处理分析结果...');
        
        console.log('🔍 performStyleAnalysis - 提取到的styleOutput:', styleOutput);
        console.log('🔍 performStyleAnalysis - styleOutput类型:', typeof styleOutput);
        console.log('🔍 performStyleAnalysis - 完整debugRaw对象:', debugRaw);
        
        appState.styleOutput = styleOutput;
        updateAnalysisStatus();
        
        updateProgress(100);
        updateProgressStatus('风格分析完成！');
        
        setTimeout(() => {
            hideProgressBar();
            showToast('风格分析完成', 'success');
        }, 500);
        // 展示调试区内容
        showFastGPTDebug(debugRaw);
        // 新增：展示风格分析结果
        console.log('🚀 即将调用showStyleAnalysis，传入参数:', styleOutput);
        showStyleAnalysis(styleOutput);
    } catch (error) {
        console.error('风格分析失败:', error);
        appState.styleOutput = '正式严谨，条理清晰，用词准确，逻辑性强';
        updateAnalysisStatus();
        
        updateProgress(100);
        updateProgressStatus('分析失败，使用默认风格');
        
        setTimeout(() => {
            hideProgressBar();
            showToast('风格分析失败，已使用默认风格', 'warning');
        }, 500);
        
        showFastGPTDebug({});
    } finally {
        appState.isAnalyzing = false;
        checkLearningButtonStatus();
    }
}

// 新增：获取完整workflow响应
async function callStyleAnalysisWorkflowRaw(fileUrls, userUrls) {
    const safeFileUrls = Array.isArray(fileUrls) ? fileUrls : [];
    const safeUserUrls = Array.isArray(userUrls) ? userUrls : [];
    const response = await fetch(`/api/fastgpt/workflow/run`, {
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

// 新增：展示调试区内容
function showFastGPTDebug(raw) {
    console.log('FastGPT Debug - 原始响应:', raw);

    // 显示完整的响应结构
    console.log('=== FastGPT 响应结构分析 ===');
    console.log('1. 顶层字段:', Object.keys(raw || {}));
    
    // 尝试所有可能的路径获取变量
    let urlOutput = '';
    let styleOutput = '';

    // 优先从newVariables中获取style_output（按用户要求的逻辑路径）
    if (raw?.newVariables?.style_output) {
        styleOutput = raw.newVariables.style_output;
        console.log('✅ 从newVariables.style_output获取到风格分析结果:', styleOutput);
    }

    // 如果newVariables中没有，再从responseData中查找（备用逻辑）
    if (!styleOutput && raw?.responseData) {
        for (const item of raw.responseData) {
            console.log(`检查节点 ${item.nodeId}:`, item);
            
            // 检查updateVarResult字段
            if (item.updateVarResult) {
                console.log('找到updateVarResult:', item.updateVarResult);
                
                // 检查updateVarResult数组中的变量
                if (Array.isArray(item.updateVarResult)) {
                    for (const varItem of item.updateVarResult) {
                        console.log('检查变量项:', varItem);
                        
                        // 查找url_pi-liang_output
                        if (varItem['url_pi-liang_output']) {
                            urlOutput = varItem['url_pi-liang_output'];
                            console.log('从updateVarResult找到url_pi-liang_output:', urlOutput);
                        }
                        
                        // 查找style_output
                        if (varItem.style_output) {
                            styleOutput = varItem.style_output;
                            console.log('从updateVarResult找到style_output:', styleOutput);
                        }
                    }
                }
            }
            
            // 备用：检查outputs字段
            if (!urlOutput && !styleOutput && item.outputs) {
                console.log('备用检查outputs:', item.outputs);
                if (item.outputs?.['url_pi-liang_output']) {
                    const urlData = item.outputs['url_pi-liang_output'];
                    console.log('从outputs找到url_pi-liang_output:', urlData);
                    // 如果是数组，取索引1的text.content
                    if (Array.isArray(urlData) && urlData[1]?.text?.content) {
                        urlOutput = urlData[1].text.content;
                    } else if (typeof urlData === 'string') {
                        urlOutput = urlData;
                    }
                }
                if (item.outputs?.style_output) {
                    const styleData = item.outputs.style_output;
                    console.log('从outputs找到style_output:', styleData);
                    // 如果是数组，取索引1的text.content
                    if (Array.isArray(styleData) && styleData[1]?.text?.content) {
                        styleOutput = styleData[1].text.content;
                    } else if (typeof styleData === 'string') {
                        styleOutput = styleData;
                    }
                }
            }
        }
    }

    // 显示在调试区域
    const urlElement = document.getElementById('url-pi-liang-output');
    const styleElement = document.getElementById('style-output-debug');
    
    if (urlElement) {
        urlElement.textContent = urlOutput || '未找到url批量输出结果';
    }
    if (styleElement) {
        styleElement.textContent = styleOutput || '未找到风格分析结果';
    }
    
    // 添加完整报文显示区域
    addFullResponseDisplay(raw);
    
    // 强制刷新显示
    if (styleOutput) {
        console.log('✅ 成功提取到style_output内容:', styleOutput);
        console.log('✅ 正在更新前端显示...');
    }
    
    // 在控制台输出调试信息
    console.log('FastGPT Debug - 最终提取的变量:');
    console.log('- url_pi-liang_output:', urlOutput);
    console.log('- style_output:', styleOutput);
}

// 新增：显示完整报文的函数
function addFullResponseDisplay(raw) {
    // 查找或创建完整报文显示区域
    let fullResponseSection = document.getElementById('full-response-section');
    if (!fullResponseSection) {
        fullResponseSection = document.createElement('div');
        fullResponseSection.id = 'full-response-section';
        fullResponseSection.className = 'result-section';
        fullResponseSection.style.cssText = 'margin-top: 20px; background: #f0f8ff; border: 2px solid #4a90e2;';
        
        fullResponseSection.innerHTML = `
            <div class="result-header">
                <h3 class="result-title">
                    <i class="fas fa-code"></i>
                    完整响应报文
                </h3>
            </div>
            <div>
                <pre id="full-response-content" style="background: #f8f9fa; border-radius: 6px; padding: 10px; border: 1px solid #eee; min-height: 100px; max-height: 500px; overflow-y: auto; font-size: 12px;"></pre>
            </div>
        `;
        
        // 插入到调试区域后面
        const debugSection = document.getElementById('fastgpt-debug-section');
        if (debugSection) {
            debugSection.parentNode.insertBefore(fullResponseSection, debugSection.nextSibling);
        }
    }
    
    // 显示完整报文
    const fullResponseContent = document.getElementById('full-response-content');
    if (fullResponseContent) {
        fullResponseContent.textContent = JSON.stringify(raw, null, 2);
    }
}

// 只展示风格分析结果
function updateAnalysisStatus(message = '') {
    const statusItems = document.querySelectorAll('.status-item span');
    if (statusItems.length >= 2) {
        if (message) {
            statusItems[0].textContent = message;
            statusItems[1].textContent = '';
        } else {
            if (appState.styleOutput) {
                statusItems[0].textContent = `风格分析已完成`;
                statusItems[1].textContent = '';
            } else {
                statusItems[0].textContent = '等待风格分析...';
                statusItems[1].textContent = '';
            }
        }
    }
}

function updateUploadStatus(message) {
    // 在页面上显示上传状态
    const statusItems = document.querySelectorAll('.status-item span');
    if (statusItems.length >= 2) {
        if (message) {
            statusItems[1].textContent = message;
        } else {
            statusItems[1].textContent = '';
        }
    }
    
    // 同时在控制台输出状态
    if (message) {
        console.log('📤 上传状态:', message);
    }
}

// 表单验证
function validateForm() {
    const topic = document.getElementById('topic').value.trim();
    
    if (!topic) {
        showToast('请填写主题内容！', 'error');
        document.getElementById('topic').focus();
        return false;
    }
    
    // 如果没有风格分析结果，使用默认风格
    if (!appState.styleOutput) {
        appState.styleOutput = '正式严谨，条理清晰，用词准确';
        console.log('使用默认风格:', appState.styleOutput);
    }
    
    return true;
}

// 生成内容
async function generateContent() {
    if (!validateForm()) {
        return;
    }
    
    const topicInput = document.getElementById('topic');
    const wordCountInput = document.getElementById('word-count');
    // const contentTypeInput = document.getElementById('content-type'); // 已无此input
    const notesInput = document.getElementById('notes');

    if (!topicInput || !wordCountInput || !notesInput) {
        showToast('页面表单元素缺失，请检查页面结构！', 'error');
        return;
    }

    const topic = topicInput.value.trim();
    const contentLength = parseInt(wordCountInput.value) || 500;
    
    // 从textarea获取风格内容
    const styleTextarea = document.getElementById('style-output');
    const userStyleInput = styleTextarea ? styleTextarea.value.trim() : '';
    
    // style_output: 完整的风格分析报告（用于AI理解风格）
    const styleOutput = appState.styleOutput || '正式严谨，条理清晰，用词准确，逻辑性强';
    
    // style_type: 用户输入的风格要求（简短描述）
    const styleType = userStyleInput || '正式严谨，条理清晰，用词准确，逻辑性强';
    
    // 提示用户是否使用了默认风格
    if (!appState.styleOutput) {
        console.log('💡 未进行风格学习，使用默认风格进行生成');
        showToast('使用默认风格生成内容（建议先进行风格学习获得更个性化效果）', 'info');
    }
    
    const notes = notesInput.value.trim();
    
    console.log('📋 内容生成参数准备:');
    console.log('- 主题:', topic);
    console.log('- 字数:', contentLength);
    console.log('- 风格分析报告长度:', styleOutput.length);
    console.log('- 用户风格要求:', styleType);
    console.log('- 补充说明:', notes);
    
    // 显示进度条和加载状态
    showProgressBar('content-generation', '生成专属内容', '正在准备生成内容...');
    updateProgress(10);
    
    // 显示加载状态
    const generateBtn = document.querySelector('.generate-btn');
    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="loading"></div> 正在生成中...';
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    
    appState.isGenerating = true;
    
    try {
        updateProgress(30);
        updateProgressStatus('正在验证输入参数...');
        
        let generatedContent;
        
        // 根据配置的模式选择接口
        if (API_CONFIG.MODE === 'chat') {
            // 使用对话接口
            if (!API_CONFIG.FASTGPT_CONTENT.apiKey) {
                throw new Error('对话模式需要配置API密钥');
            }
            console.log('🔄 使用对话接口进行内容生成');
            
            updateProgress(50);
            updateProgressStatus('正在调用AI生成接口...');
            
            generatedContent = await generateContentWithChat(
                styleOutput,    // 完整的风格分析报告
                contentLength,  // 字数要求
                topic,          // 主题
                styleType,      // 用户输入的风格要求
                notes           // 补充说明
            );
        } else if (API_CONFIG.MODE === 'workflow') {
            // 使用工作流接口
            if (!API_CONFIG.FASTGPT_CONTENT.workflowId || !API_CONFIG.FASTGPT_CONTENT.apiKey) {
                throw new Error('工作流模式需要配置API密钥和工作流ID');
            }
            console.log('🔄 使用工作流接口进行内容生成');
            
            updateProgress(50);
            updateProgressStatus('正在调用AI生成接口...');
            
            generatedContent = await callContentGenerationWorkflow(
                styleOutput,    // 完整的风格分析报告
                contentLength,  // 字数要求
                topic,          // 主题
                styleType,      // 用户输入的风格要求
                notes           // 补充说明
            );
        } else {
            throw new Error('请设置正确的接口模式（chat 或 workflow）');
        }
        
        updateProgress(80);
        updateProgressStatus('正在处理生成结果...');
        
        // 显示结果
        displayResult(generatedContent);
        
        // 保存到全局状态
        appState.generatedContent = generatedContent;
        
        updateProgress(100);
        updateProgressStatus('内容生成完成！');
        
        setTimeout(() => {
            hideProgressBar();
            showToast('内容生成完成！', 'success');
        }, 500);
        
        // 滚动到结果区域
        document.getElementById('result-section').scrollIntoView({ 
            behavior: 'smooth' 
        });
        
    } catch (error) {
        console.error('FastGPT调用失败，使用本地模板生成:', error);
        
        updateProgress(80);
        updateProgressStatus('AI接口调用失败，使用本地模板...');
        
        // 使用本地模板作为备用方案
        const fallbackContent = generateFallbackContent(topic, contentType, contentLength, notes);
        
        updateProgress(100);
        updateProgressStatus('本地模板生成完成！');
        
        setTimeout(() => {
            hideProgressBar();
        }, 500);
        
        // 显示结果
        displayResult(fallbackContent);
        
        // 保存到全局状态
        appState.generatedContent = fallbackContent;
        
        // 滚动到结果区域
        document.getElementById('result-section').scrollIntoView({ 
            behavior: 'smooth' 
        });
        
        showToast('内容生成完成（使用本地模板）', 'info');
    } finally {
        // 恢复按钮状态
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
        generateBtn.classList.remove('loading');
        appState.isGenerating = false;
    }
}

function displayResult(content) {
    const resultSection = document.getElementById('result-section');
    const resultContent = document.getElementById('result-content');
    const wordCountDisplay = document.getElementById('word-count-display');
    const generationTime = document.getElementById('generation-time');

    // 更新头部卡片的信息
    wordCountDisplay.textContent = `约 ${content.length} 字`;
    generationTime.textContent = new Date().toLocaleTimeString('zh-CN');

    // 显示结果区域
    resultSection.style.display = 'block';

    // 直接渲染Markdown内容
    let renderedContent = marked.parse(content);
    resultContent.innerHTML = renderedContent;

    // 代码高亮
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightBlock(block);
    });
}

// 复制结果
function copyResult() {
    const resultContent = document.getElementById('result-content').textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(resultContent).then(() => {
            showToast('内容已复制到剪贴板！', 'success');
        });
    } else {
        // 兼容旧浏览器
        const textArea = document.createElement('textarea');
        textArea.value = resultContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('内容已复制到剪贴板！', 'success');
    }
}

// 编辑结果
function editResult() {
    const resultContent = document.getElementById('result-content');
    const currentContent = resultContent.textContent;
    
    // 创建编辑模式
    resultContent.innerHTML = `<textarea class="edit-textarea" style="width: 100%; height: 300px; border: none; outline: none; background: transparent; font-size: 1rem; line-height: 1.8; font-family: inherit; resize: vertical;">${currentContent}</textarea>`;
    
    const textarea = resultContent.querySelector('.edit-textarea');
    
    // 添加保存和取消按钮
    const editActions = document.createElement('div');
    editActions.style.marginTop = '15px';
    editActions.innerHTML = `
        <button class="action-btn" style="background: #28a745; color: white; margin-right: 10px;" onclick="saveEdit()">
            <i class="fas fa-save"></i> 保存修改
        </button>
        <button class="action-btn" style="background: #6c757d; color: white;" onclick="cancelEdit('${currentContent.replace(/'/g, "\\'")}')">
            <i class="fas fa-times"></i> 取消编辑
        </button>
    `;
    
    resultContent.appendChild(editActions);
    textarea.focus();
}

// 保存编辑
function saveEdit() {
    const resultContent = document.getElementById('result-content');
    const textarea = resultContent.querySelector('.edit-textarea');
    const newContent = textarea.value;
    
    // 更新显示和状态
    resultContent.innerHTML = newContent;
    appState.generatedContent = newContent;
    
    // 更新字数显示
    const wordCountDisplay = document.getElementById('word-count-display');
    wordCountDisplay.textContent = `约 ${newContent.length} 字`;
    
    showToast('内容已保存！', 'success');
}

// 取消编辑
function cancelEdit(originalContent) {
    const resultContent = document.getElementById('result-content');
    resultContent.textContent = originalContent;
}

// 重新生成
function regenerateContent() {
    if (confirm('确定要重新生成内容吗？当前内容将被覆盖。')) {
        generateContent();
    }
}

// 保存文档
function saveResult() {
    if (!appState.generatedContent) {
        showToast('没有可保存的内容！', 'error');
        return;
    }
    
    const topic = document.getElementById('topic').value.trim() || '生成内容';
    const contentType = document.getElementById('content-type').value;
    const filename = `${topic}_${contentType}_${new Date().toLocaleDateString('zh-CN')}.txt`;
    
    const blob = new Blob([appState.generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('文档已保存！', 'success');
}

// 显示提示消息
function showToast(message, type = 'info') {
    // 移除已存在的提示
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建新提示
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }
    }, 3000);
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

// API配置管理
function setAPIConfig(config) {
    Object.assign(API_CONFIG.OSS, config.OSS || {});
    Object.assign(API_CONFIG.FASTGPT_STYLE, config.FASTGPT_STYLE || {});
    Object.assign(API_CONFIG.FASTGPT_CONTENT, config.FASTGPT_CONTENT || {});
    
    // 重新初始化OSS客户端
    if (config.OSS) {
        initializeOSS();
    }
    
    console.log('API配置已更新');
}

// 检查配置并显示配置界面
function checkAPIConfig() {
    const hasStyleKey = API_CONFIG.FASTGPT_STYLE.apiKey;
    const hasContentKey = API_CONFIG.FASTGPT_CONTENT.apiKey;
    const hasStyleWorkflow = API_CONFIG.FASTGPT_STYLE.workflowId;
    const hasContentWorkflow = API_CONFIG.FASTGPT_CONTENT.workflowId;
    
    if (hasStyleKey && hasContentKey && hasStyleWorkflow && hasContentWorkflow) {
        console.log('✅ FastGPT配置完整');
        console.log('🎨 风格分析:', API_CONFIG.FASTGPT_STYLE.apiKey.substring(0, 20) + '... | 工作流:', hasStyleWorkflow);
        console.log('📝 内容生成:', API_CONFIG.FASTGPT_CONTENT.apiKey.substring(0, 20) + '... | 工作流:', hasContentWorkflow);
        return true;
    } else {
        console.log('💡 FastGPT配置不完整');
        if (!hasStyleKey) console.log('❌ 缺少风格分析密钥');
        if (!hasContentKey) console.log('❌ 缺少内容生成密钥');
        if (!hasStyleWorkflow) console.log('❌ 缺少风格分析工作流ID');
        if (!hasContentWorkflow) console.log('❌ 缺少内容生成工作流ID');
        console.log('💡 请获取您的工作流ID并配置');
        return false;
    }
}

// 从本地存储加载配置
function loadConfigFromStorage() {
    // 保存代码中的关键配置
    const codeDefaults = {
        MODE: API_CONFIG.MODE,
        FASTGPT_STYLE: { ...API_CONFIG.FASTGPT_STYLE },
        FASTGPT_CONTENT: { ...API_CONFIG.FASTGPT_CONTENT }
    };
    
    const saved = localStorage.getItem('boss_kb_config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            API_CONFIG = { ...API_CONFIG, ...config };
            
            // 强制保持代码中的关键配置
            API_CONFIG.MODE = codeDefaults.MODE;
            API_CONFIG.FASTGPT_STYLE.workflowId = codeDefaults.FASTGPT_STYLE.workflowId;
            API_CONFIG.FASTGPT_CONTENT.workflowId = codeDefaults.FASTGPT_CONTENT.workflowId;
            
            console.log('✅ 配置已加载，但关键配置保持代码中的设置');
            console.log(`🔧 接口模式: ${API_CONFIG.MODE} (代码锁定)`);
            console.log(`🔧 风格分析工作流: ${API_CONFIG.FASTGPT_STYLE.workflowId} (代码锁定)`);
            console.log(`🔧 内容生成工作流: ${API_CONFIG.FASTGPT_CONTENT.workflowId} (代码锁定)`);
        } catch (e) {
            console.error('配置加载失败:', e);
        }
    } else {
        console.log('✅ 使用代码中的默认配置');
    }
}

// 简化初始化检查
async function checkAPIConnection() {
    if (API_CONFIG.FASTGPT_CONTENT.apiKey) {
        console.log('✅ 检测到API密钥，可以开始使用');
        showToast('系统已就绪，可以开始使用FastGPT功能', 'success');
        return true;
    } else {
        console.log('💡 请配置API密钥开始使用');
        showToast('请在控制台配置API密钥：setApiKey("你的密钥")', 'info');
        return false;
    }
}



// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 从本地存储加载配置
    loadConfigFromStorage();
    
    // 设置默认风格，确保系统始终可用
    appState.styleOutput = '正式严谨，条理清晰，用词准确，逻辑性强，表达规范';
    
    // 检查API连接状态
    await checkAPIConnection();
    
    // 检查配置并初始化
    checkAPIConfig();
    
    // 初始化OSS客户端（如果配置了）
    if (API_CONFIG.OSS.accessKeyId && API_CONFIG.OSS.accessKeySecret) {
        try {
            await initializeOSS();
        } catch (error) {
            console.error('OSS初始化失败:', error);
        }
    }
    
    // 设置拖拽上传
    setupDragDrop();
    
    // 初始化分析状态
    updateAnalysisStatus('系统已就绪！可直接生成内容，或配置API使用高级功能');
    
    // 初始化AI学习按钮状态
    checkLearningButtonStatus();
    
    // 添加快捷键支持
    document.addEventListener('keydown', function(e) {
        // Ctrl+Enter 快速生成
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            generateContent();
        }
        
        // Ctrl+S 保存文档
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (appState.generatedContent) {
                saveResult();
            }
        }
    });
    
    // 实时保存表单数据到本地存储
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('change', function() {
            localStorage.setItem(`boss-kb-${input.id}`, input.value);
        });
        
        // 加载保存的数据
        const saved = localStorage.getItem(`boss-kb-${input.id}`);
        if (saved && input.id !== 'file-input') {
            input.value = saved;
        }
    });
    
    // 显示欢迎信息和配置提示
    setTimeout(() => {
        const hasStyleKey = API_CONFIG.FASTGPT_STYLE.apiKey;
        const hasContentKey = API_CONFIG.FASTGPT_CONTENT.apiKey;
        const hasStyleWorkflow = API_CONFIG.FASTGPT_STYLE.workflowId;
        const hasContentWorkflow = API_CONFIG.FASTGPT_CONTENT.workflowId;
        
        if (hasStyleKey && hasContentKey && hasStyleWorkflow && hasContentWorkflow) {
            showToast('老板专属知识库已就绪！FastGPT工作流已配置，功能完整', 'success');
        } else {
            showToast('老板专属知识库已就绪！可直接使用模板，或配置FastGPT工作流获得AI功能', 'info');
            
            // 详细配置提示
            console.log('💡 当前配置状态:');
            console.log(`  风格分析密钥: ${hasStyleKey ? '✅' : '❌'}`);
            console.log(`  内容生成密钥: ${hasContentKey ? '✅' : '❌'}`);
            console.log(`  风格分析工作流: ${hasStyleWorkflow ? '✅' : '❌'}`);
            console.log(`  内容生成工作流: ${hasContentWorkflow ? '✅' : '❌'}`);
            console.log('💡 查看完整配置: showConfig()');
        }
    }, 2000);
    
    // 复制测试地址功能
    var copyTestBtn = document.querySelector('.copy-test-url-btn');
    if(copyTestBtn){
        copyTestBtn.addEventListener('click', async function() {
            const testUrl = 'https://www.takungpao.com/house/dichan/2025/0604/1092529.html';
            try {
                await navigator.clipboard.writeText(testUrl);
                copyTestBtn.style.background = '#d1fae5';
                copyTestBtn.style.color = '#059669';
                copyTestBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyTestBtn.innerHTML = '<i class="fas fa-link"></i>';
                    copyTestBtn.style.background = '';
                    copyTestBtn.style.color = '#667eea';
                }, 1500);
                showToast('测试地址已复制', 'success');
            } catch (err) {
                copyTestBtn.innerHTML = '<i class="fas fa-times"></i>';
                copyTestBtn.style.background = '#fee2e2';
                copyTestBtn.style.color = '#dc2626';
                setTimeout(() => {
                    copyTestBtn.innerHTML = '<i class="fas fa-link"></i>';
                    copyTestBtn.style.background = '';
                    copyTestBtn.style.color = '#667eea';
                }, 1500);
                showToast('复制失败', 'error');
            }
        });
    }
});

// 导出配置函数供外部调用
window.setAPIConfig = setAPIConfig;

// 新增：显示配置锁定说明
window.showLocks = function() {
    console.log('🔒 ======== 配置锁定说明 ========');
    console.log('');
    console.log('✅ 以下配置已在代码中锁定，重启项目后自动生效：');
    console.log(`🔧 接口模式: ${API_CONFIG.MODE}`);
    console.log(`🔧 风格分析工作流ID: ${API_CONFIG.FASTGPT_STYLE.workflowId}`);
    console.log(`🔧 内容生成工作流ID: ${API_CONFIG.FASTGPT_CONTENT.workflowId}`);
    console.log('');
    console.log('📝 可通过localStorage保存的配置：');
    console.log('- API密钥（需要您自己配置）');
    console.log('- OSS配置（需要您自己配置）');
    console.log('');
    console.log('💡 优势：');
    console.log('✅ 重启项目后无需重新配置');
    console.log('✅ 换浏览器后无需重新配置');
    console.log('✅ 团队使用统一配置');
    console.log('==========================');
};

// 新增：显示模式对比帮助
window.showModes = function() {
    console.log('🔧 ======== 接口模式说明 ========');
    console.log('');
    console.log('💬 对话模式 (chat) - 推荐');
    console.log('  ✅ 优势：配置简单，只需API密钥');
    console.log('  ✅ 适用：内容生成、对话互动');
    console.log('  ❌ 限制：无法直接分析文件内容');
    console.log('  🔧 配置：setMode("chat") + setApiKey("你的密钥")');
    console.log('');
    console.log('⚙️  工作流模式 (workflow)');
    console.log('  ✅ 优势：可处理复杂任务，分析文件内容');
    console.log('  ✅ 适用：文档分析、复杂处理流程');
    console.log('  ❌ 限制：需要配置工作流ID，设置复杂');
    console.log('  🔧 配置：setMode("workflow") + 工作流ID');
    console.log('');
    console.log('💡 当前模式：' + (API_CONFIG.MODE === 'chat' ? '对话模式' : '工作流模式'));
    console.log('');
    console.log('🎯 快速切换：');
    console.log('  setMode("chat")     // 切换到对话模式');
    console.log('  setMode("workflow") // 切换到工作流模式');
    console.log('==========================');
};

// 快速配置FastGPT API密钥
window.setStyleKey = function(apiKey) {
    API_CONFIG.FASTGPT_STYLE.apiKey = apiKey;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    console.log('✅ FastGPT风格分析密钥已更新');
    console.log('API Key:', apiKey ? apiKey.substring(0, 20) + '...' : '未配置');
    showToast('风格分析API配置成功', 'success');
};

window.setContentKey = function(apiKey) {
    API_CONFIG.FASTGPT_CONTENT.apiKey = apiKey;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    console.log('✅ FastGPT内容生成密钥已更新');
    console.log('API Key:', apiKey ? apiKey.substring(0, 20) + '...' : '未配置');
    showToast('内容生成API配置成功', 'success');
};

// 配置工作流ID
window.setStyleWorkflowId = function(workflowId) {
    API_CONFIG.FASTGPT_STYLE.workflowId = workflowId;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    console.log('✅ 风格分析工作流ID已更新');
    console.log('Workflow ID:', workflowId);
    showToast('风格分析工作流配置成功', 'success');
};

window.setContentWorkflowId = function(workflowId) {
    API_CONFIG.FASTGPT_CONTENT.workflowId = workflowId;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    console.log('✅ 内容生成工作流ID已更新');
    console.log('Workflow ID:', workflowId);
    showToast('内容生成工作流配置成功', 'success');
};



// 新增：设置接口模式
window.setMode = function(mode) {
    if (mode !== 'chat' && mode !== 'workflow') {
        console.error('❌ 模式必须是 "chat" 或 "workflow"');
        return;
    }
    
    API_CONFIG.MODE = mode;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    
    console.log(`✅ 接口模式已切换为: ${mode === 'chat' ? '对话接口模式' : '工作流接口模式'}`);
    
    if (mode === 'chat') {
        console.log('💡 对话模式说明:');
        console.log('  - 使用 /v1/chat/completions 接口');
        console.log('  - 需要应用专用API密钥');
        console.log('  - 适合简单的对话和内容生成');
        console.log('  - 设置密钥: setApiKey("fastgpt-你的应用密钥")');
    } else {
        console.log('💡 工作流模式说明:');
        console.log('  - 使用 /workflow/run 接口');
        console.log('  - 需要配置工作流ID');
        console.log('  - 适合复杂的文档分析和内容生成');
        console.log('  - 配置工作流: setStyleWorkflowId() 和 setContentWorkflowId()');
    }
    
    showToast(`已切换到${mode === 'chat' ? '对话' : '工作流'}接口模式`, 'success');
};

// 新增：统一设置API密钥（同时设置风格分析和内容生成）
window.setApiKey = function(apiKey) {
    if (!apiKey || !apiKey.startsWith('fastgpt-')) {
        console.error('❌ API密钥格式错误，应以 "fastgpt-" 开头');
        return;
    }
    
    API_CONFIG.FASTGPT_STYLE.apiKey = apiKey;
    API_CONFIG.FASTGPT_CONTENT.apiKey = apiKey;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    
    console.log('✅ FastGPT API密钥已设置');
    console.log('API Key:', apiKey.substring(0, 20) + '...');
    showToast('FastGPT API密钥配置成功', 'success');
    
    // 如果是对话模式，提示可以直接使用
    if (API_CONFIG.MODE === 'chat') {
        console.log('💡 当前为对话模式，可以直接使用！');
        showToast('对话模式已就绪，可以开始生成内容', 'info');
    }
};

// 新增：测试API连接 - 直接按照官方示例调用
window.testApi = async function() {
    console.log('🔄 测试FastGPT API连接...');
    
    if (!API_CONFIG.FASTGPT_CONTENT.apiKey) {
        console.error('❌ 请先配置API密钥: setApiKey("fastgpt-你的密钥")');
        return;
    }
    
    try {
        console.log('📡 API配置:');
        console.log('  URL:', `${API_CONFIG.FASTGPT_CONTENT.baseUrl}/v1/chat/completions`);
        console.log('  API Key:', API_CONFIG.FASTGPT_CONTENT.apiKey.substring(0, 20) + '...');
        
        // 完全按照官方示例的格式调用
        const requestBody = {
            "chatId": "111",
            "stream": false,
            "detail": false,
            "messages": [
                {
                    "content": "测试连接，请回复：连接成功",
                    "role": "user"
                }
            ]
        };
        
        console.log('📤 请求数据:', requestBody);
        
        const response = await fetch(`/api/fastgpt/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_CONFIG.FASTGPT_CONTENT.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📥 响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API错误响应:', errorText);
            throw new Error(`API调用失败: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ API响应成功:', result);
        
        if (result && result.choices && result.choices[0] && result.choices[0].message) {
            console.log('💬 AI回复:', result.choices[0].message.content);
            showToast('FastGPT API连接成功！', 'success');
        } else {
            console.warn('⚠️ 响应格式异常:', result);
            showToast('API连接成功但响应格式异常', 'warning');
        }
        
    } catch (error) {
        console.error('❌ API测试失败:', error);
        
        if (error.message.includes('Key is error')) {
            console.log('💡 错误原因: 使用了错误的密钥类型');
            console.log('📌 解决方案: 请使用应用专用密钥，不是账户密钥');
            showToast('API密钥类型错误，请使用应用专用密钥', 'error');
        } else if (error.message.includes('CORS')) {
            console.log('💡 错误原因: CORS跨域限制');
            console.log('📌 解决方案: 这确实需要代理服务器');
            showToast('遇到CORS跨域限制，需要代理服务器', 'error');
        } else {
            showToast('API测试失败: ' + error.message, 'error');
        }
    }
};

// 新增：清除所有配置
window.clearConfig = function() {
    if (confirm('确定要清除所有API配置吗？此操作将清除所有密钥和配置信息。')) {
        // 清除localStorage中的配置
        localStorage.removeItem('boss_kb_config');
        
        // 重置API_CONFIG为默认值
        API_CONFIG.FASTGPT_STYLE.apiKey = '';
        API_CONFIG.FASTGPT_CONTENT.apiKey = '';
        API_CONFIG.FASTGPT_STYLE.workflowId = '';
        API_CONFIG.FASTGPT_CONTENT.workflowId = '';
        API_CONFIG.OSS.accessKeyId = '';
        API_CONFIG.OSS.accessKeySecret = '';
        
        console.log('✅ 所有API配置已清除');
        showToast('API配置已清除，请重新配置', 'info');
        
        // 显示配置指南
        setTimeout(() => {
            console.log('💡 重新配置提示:');
            console.log('  设置API密钥: setApiKey("fastgpt-你的新密钥")');
            console.log('  查看配置指南: quickSetup()');
        }, 1000);
    }
};

// 新增：清除指定密钥
window.clearApiKey = function() {
    API_CONFIG.FASTGPT_STYLE.apiKey = '';
    API_CONFIG.FASTGPT_CONTENT.apiKey = '';
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    
    console.log('✅ API密钥已清除');
    showToast('API密钥已清除', 'info');
    
    console.log('💡 重新设置密钥: setApiKey("fastgpt-你的新密钥")');
};



// 新增：配置OSS
window.setOSSConfig = function(accessKeyId, accessKeySecret) {
    if (!accessKeyId || !accessKeySecret) {
        console.error('❌ 请提供完整的OSS配置信息');
        console.log('💡 使用方法: setOSSConfig("您的AccessKeyId", "您的AccessKeySecret")');
        return;
    }
    
    API_CONFIG.OSS.accessKeyId = accessKeyId;
    API_CONFIG.OSS.accessKeySecret = accessKeySecret;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    
    console.log('✅ OSS配置已更新');
    console.log('AccessKey ID:', accessKeyId.substring(0, 10) + '...');
    showToast('OSS配置成功', 'success');
    
    // 立即初始化OSS
    initializeOSS().then(() => {
        console.log('✅ OSS已初始化，可以上传文件了');
    }).catch(error => {
        console.error('❌ OSS初始化失败:', error);
    });
};

// 新增：显示配置窗口
window.showConfig = function() {
    console.log('=== 当前配置状态 ===');
    console.log('🔧 接口模式:', API_CONFIG.MODE === 'chat' ? '对话接口模式' : '工作流接口模式');
    
    console.log('📁 OSS配置:');
    console.log('  AccessKey ID:', API_CONFIG.OSS.accessKeyId ? API_CONFIG.OSS.accessKeyId.substring(0, 10) + '...' : '❌ 未配置');
    console.log('  AccessKey Secret:', API_CONFIG.OSS.accessKeySecret ? '已配置' : '❌ 未配置');
    console.log('  Bucket:', API_CONFIG.OSS.bucket);
    
    console.log('🎨 风格分析配置:');
    console.log('  API Key:', API_CONFIG.FASTGPT_STYLE.apiKey ? API_CONFIG.FASTGPT_STYLE.apiKey.substring(0, 20) + '...' : '❌ 未配置');
    console.log('  Workflow ID:', API_CONFIG.FASTGPT_STYLE.workflowId || '❌ 未配置');
    
    console.log('📝 内容生成配置:');
    console.log('  API Key:', API_CONFIG.FASTGPT_CONTENT.apiKey ? API_CONFIG.FASTGPT_CONTENT.apiKey.substring(0, 20) + '...' : '❌ 未配置');
    console.log('  Workflow ID:', API_CONFIG.FASTGPT_CONTENT.workflowId || '❌ 未配置');
    
    console.log('🌐 API地址:', API_CONFIG.FASTGPT_CONTENT.baseUrl);
    console.log('========================');
    
    // 配置提示
    console.log('💡 快速配置命令:');
    console.log('  配置OSS: setOSSConfig("AccessKeyId", "AccessKeySecret")');
    console.log('  配置API密钥: setApiKey("fastgpt-你的密钥")');
    console.log('  显示配置窗口: showConfigModal()');
    console.log('  切换模式: setMode("chat") 或 setMode("workflow")');
    console.log('  测试API: testApi()');
};

// 新增：快速配置指南
window.quickSetup = function() {
    console.log('=== FastGPT 快速配置指南 ===');
    console.log('');
    console.log('🎯 简单配置（对话接口）');
    console.log('1. 获取应用专用API密钥');
    console.log('2. setApiKey("fastgpt-你的应用密钥")');
    console.log('3. testApi() // 测试连接');
    console.log('');
    console.log('🎯 高级配置（工作流接口）');
    console.log('1. setMode("workflow")');
    console.log('2. setApiKey("fastgpt-你的密钥")');
    console.log('3. setStyleWorkflowId("风格分析工作流ID")');
    console.log('4. setContentWorkflowId("内容生成工作流ID")');
    console.log('');
    console.log('🔧 常用命令:');
    console.log('- showConfig() // 查看当前配置');
    console.log('- showModes() // 查看模式说明');
    console.log('- showLocks() // 查看配置锁定说明');
    console.log('- clearConfig() // 清除所有配置');
    console.log('- clearApiKey() // 仅清除API密钥');
    console.log('- testApi() // 测试API连接');
    console.log('');
    console.log('📋 API密钥获取位置:');
    console.log('👉 登录FastGPT → 我的应用 → 选择应用 → API密钥');
    console.log('⚠️ 注意：使用应用专用密钥，不是账户密钥');
    console.log('===========================');
};

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
    // 添加到页面
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    // 绑定事件监听器
    const closeBtn = modal.querySelector('#close-dynamic-modal');
    const clearBtn = modal.querySelector('#clear-config-dynamic');
    const saveBtn = modal.querySelector('#save-config-dynamic');
    const testBtn = modal.querySelector('#test-connection-dynamic');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDynamicConfigModal);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllConfigDynamic);
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfigDynamic);
    }
    if (testBtn) {
        testBtn.addEventListener('click', testApiConnectionDynamic);
    }
    // 加载当前配置
    loadConfigToDynamicForm();
    // 点击背景关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDynamicConfigModal();
        }
    });
    console.log('✅ 动态模态框已显示，事件已绑定');
}

// 关闭动态模态框
function closeDynamicConfigModal() {
    const modal = document.getElementById('config-modal-dynamic');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// 加载配置到动态表单
function loadConfigToDynamicForm() {
    const styleApiKeyInput = document.getElementById('style-api-key-dynamic');
    const styleWorkflowInput = document.getElementById('style-workflow-id-dynamic');
    const contentApiKeyInput = document.getElementById('content-api-key-dynamic');
    const contentWorkflowInput = document.getElementById('content-workflow-id-dynamic');
    const ossAccessKeyIdInput = document.getElementById('oss-access-key-id-dynamic');
    const ossAccessKeySecretInput = document.getElementById('oss-access-key-secret-dynamic');
    const ossBucketInput = document.getElementById('oss-bucket-dynamic');
    const ossRegionInput = document.getElementById('oss-region-dynamic');
    if (styleApiKeyInput) styleApiKeyInput.value = API_CONFIG.FASTGPT_STYLE.apiKey || '';
    if (styleWorkflowInput) styleWorkflowInput.value = API_CONFIG.FASTGPT_STYLE.workflowId || '';
    if (contentApiKeyInput) contentApiKeyInput.value = API_CONFIG.FASTGPT_CONTENT.apiKey || '';
    if (contentWorkflowInput) contentWorkflowInput.value = API_CONFIG.FASTGPT_CONTENT.workflowId || '';
    if (ossAccessKeyIdInput) ossAccessKeyIdInput.value = API_CONFIG.OSS.accessKeyId || '';
    if (ossAccessKeySecretInput) ossAccessKeySecretInput.value = API_CONFIG.OSS.accessKeySecret || '';
    if (ossBucketInput) ossBucketInput.value = API_CONFIG.OSS.bucket || '';
    if (ossRegionInput) ossRegionInput.value = API_CONFIG.OSS.region || '';
}

// 保存动态配置
function saveConfigDynamic() {
    const styleApiKey = document.getElementById('style-api-key-dynamic')?.value || '';
    const styleWorkflowId = document.getElementById('style-workflow-id-dynamic')?.value || '';
    const contentApiKey = document.getElementById('content-api-key-dynamic')?.value || '';
    const contentWorkflowId = document.getElementById('content-workflow-id-dynamic')?.value || '';
    const ossAccessKeyId = document.getElementById('oss-access-key-id-dynamic')?.value || '';
    const ossAccessKeySecret = document.getElementById('oss-access-key-secret-dynamic')?.value || '';
    const ossBucket = document.getElementById('oss-bucket-dynamic')?.value || '';
    const ossRegion = document.getElementById('oss-region-dynamic')?.value || '';
    if (styleApiKey) API_CONFIG.FASTGPT_STYLE.apiKey = styleApiKey;
    if (styleWorkflowId) API_CONFIG.FASTGPT_STYLE.workflowId = styleWorkflowId;
    if (contentApiKey) API_CONFIG.FASTGPT_CONTENT.apiKey = contentApiKey;
    if (contentWorkflowId) API_CONFIG.FASTGPT_CONTENT.workflowId = contentWorkflowId;
    if (ossAccessKeyId) API_CONFIG.OSS.accessKeyId = ossAccessKeyId;
    if (ossAccessKeySecret) API_CONFIG.OSS.accessKeySecret = ossAccessKeySecret;
    if (ossBucket) API_CONFIG.OSS.bucket = ossBucket;
    if (ossRegion) API_CONFIG.OSS.region = ossRegion;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    showToast('配置保存成功', 'success');
    closeDynamicConfigModal();
    if (API_CONFIG.OSS.accessKeyId && API_CONFIG.OSS.accessKeySecret) {
        initializeOSS();
    }
}

// 清除动态配置
function clearAllConfigDynamic() {
    if (confirm('确定要清除所有配置吗？')) {
        localStorage.removeItem('boss_kb_config');
        API_CONFIG.FASTGPT_STYLE.apiKey = '';
        API_CONFIG.FASTGPT_CONTENT.apiKey = '';
        API_CONFIG.FASTGPT_STYLE.workflowId = '';
        API_CONFIG.FASTGPT_CONTENT.workflowId = '';
        API_CONFIG.OSS.accessKeyId = '';
        API_CONFIG.OSS.accessKeySecret = '';
        API_CONFIG.OSS.bucket = '';
        API_CONFIG.OSS.region = '';
        
        loadConfigToDynamicForm();
        showToast('所有配置已清除', 'info');
    }
}

// 测试动态连接
function testApiConnectionDynamic() {
    saveConfigDynamic();
    setTimeout(() => {
        if (window.testApi) {
            window.testApi();
        } else {
            showToast('测试函数不存在', 'error');
        }
    }, 500);
}

// 全局函数
window.closeDynamicConfigModal = closeDynamicConfigModal;
window.saveConfigDynamic = saveConfigDynamic;
window.clearAllConfigDynamic = clearAllConfigDynamic;
window.testApiConnectionDynamic = testApiConnectionDynamic;

function closeConfigModal() {
    console.log('📋 关闭配置界面');
    
    const modal = document.getElementById('config-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // 恢复背景滚动
    }
}

function loadConfigToForm() {
    const styleApiKeyInput = document.getElementById('style-api-key');
    const styleWorkflowInput = document.getElementById('style-workflow-id');
    const contentApiKeyInput = document.getElementById('content-api-key');
    const contentWorkflowInput = document.getElementById('content-workflow-id');
    const apiModeSelect = document.getElementById('api-mode');
    const ossAccessKeyIdInput = document.getElementById('oss-access-key-id');
    const ossAccessKeySecretInput = document.getElementById('oss-access-key-secret');
    const ossBucketInput = document.getElementById('oss-bucket');
    const ossRegionInput = document.getElementById('oss-region');
    if (styleApiKeyInput) styleApiKeyInput.value = API_CONFIG.FASTGPT_STYLE.apiKey || '';
    if (styleWorkflowInput) styleWorkflowInput.value = API_CONFIG.FASTGPT_STYLE.workflowId || '';
    if (contentApiKeyInput) contentApiKeyInput.value = API_CONFIG.FASTGPT_CONTENT.apiKey || '';
    if (contentWorkflowInput) contentWorkflowInput.value = API_CONFIG.FASTGPT_CONTENT.workflowId || '';
    if (apiModeSelect) apiModeSelect.value = API_CONFIG.MODE || 'chat';
    if (ossAccessKeyIdInput) ossAccessKeyIdInput.value = API_CONFIG.OSS.accessKeyId || '';
    if (ossAccessKeySecretInput) ossAccessKeySecretInput.value = API_CONFIG.OSS.accessKeySecret || '';
    if (ossBucketInput) ossBucketInput.value = API_CONFIG.OSS.bucket || '';
    if (ossRegionInput) ossRegionInput.value = API_CONFIG.OSS.region || '';
}

function saveConfig() {
    const styleApiKey = document.getElementById('style-api-key')?.value || '';
    const styleWorkflowId = document.getElementById('style-workflow-id')?.value || '';
    const contentApiKey = document.getElementById('content-api-key')?.value || '';
    const contentWorkflowId = document.getElementById('content-workflow-id')?.value || '';
    const apiMode = document.getElementById('api-mode')?.value || 'chat';
    const ossAccessKeyId = document.getElementById('oss-access-key-id')?.value || '';
    const ossAccessKeySecret = document.getElementById('oss-access-key-secret')?.value || '';
    const ossBucket = document.getElementById('oss-bucket')?.value || '';
    const ossRegion = document.getElementById('oss-region')?.value || '';
    if (styleApiKey) API_CONFIG.FASTGPT_STYLE.apiKey = styleApiKey;
    if (styleWorkflowId) API_CONFIG.FASTGPT_STYLE.workflowId = styleWorkflowId;
    if (contentApiKey) API_CONFIG.FASTGPT_CONTENT.apiKey = contentApiKey;
    if (contentWorkflowId) API_CONFIG.FASTGPT_CONTENT.workflowId = contentWorkflowId;
    API_CONFIG.MODE = apiMode;
    if (ossAccessKeyId) API_CONFIG.OSS.accessKeyId = ossAccessKeyId;
    if (ossAccessKeySecret) API_CONFIG.OSS.accessKeySecret = ossAccessKeySecret;
    if (ossBucket) API_CONFIG.OSS.bucket = ossBucket;
    if (ossRegion) API_CONFIG.OSS.region = ossRegion;
    localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
    showToast('配置保存成功', 'success');
    loadConfigToForm();
}

function clearAllConfig() {
    if (confirm('确定要清除所有配置吗？此操作将清除所有API密钥和配置信息。')) {
        // 清除localStorage
        localStorage.removeItem('boss_kb_config');
        
        // 重置配置
        API_CONFIG.FASTGPT_STYLE.apiKey = '';
        API_CONFIG.FASTGPT_CONTENT.apiKey = '';
        API_CONFIG.FASTGPT_STYLE.workflowId = '';
        API_CONFIG.FASTGPT_CONTENT.workflowId = '';
        API_CONFIG.OSS.accessKeyId = '';
        API_CONFIG.OSS.accessKeySecret = '';
        API_CONFIG.MODE = 'chat';
        
        // 清空表单
        loadConfigToForm();
        
        console.log('✅ 所有配置已清除');
        showToast('所有配置已清除', 'info');
    }
}

function testApiConnection() {
    console.log('🔄 测试API连接');
    
    // 先保存当前配置
    saveConfig();
    
    // 延迟一下再测试，确保配置已保存
    setTimeout(() => {
        if (window.testApi) {
            window.testApi();
        } else {
            console.error('❌ testApi函数不存在');
            showToast('测试函数不存在', 'error');
        }
    }, 500);
}

// 点击模态框背景关闭
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('config-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeConfigModal();
            }
        });
    }
    
    // ESC键关闭模态框
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeConfigModal();
            closeDynamicConfigModal();
        }
    });
});

// 处理风格分析响应
async function handleStyleAnalysisResponse(response) {
    try {
        // 保存风格分析结果到全局状态
        appState.styleOutput = response;
        
        // 显示风格分析结果
        showStyleAnalysis(response);
        
        // 显示原始输出（用于调试）
        const rawOutput = document.getElementById('fastgpt-raw-output');
        rawOutput.textContent = JSON.stringify(response, null, 2);
        
        // 更新分析状态
        updateAnalysisStatus('✅ 风格分析完成');
        showToast('风格分析完成', 'success');
        
    } catch (error) {
        console.error('处理风格分析响应失败:', error);
        showToast('处理风格分析响应失败: ' + error.message, 'error');
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

// 内容风格现在使用textarea，用户可以直接编辑
console.log('✅ script.js加载完成 - 使用textarea进行编辑');

// ==================== 编辑、下载和飞书同步功能 ====================

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

// 同步到飞书多维表格
async function syncToFeishuTable(accessToken) {
    console.log('🚀 开始同步到飞书多维表格');
    console.log('🔑 访问令牌长度:', accessToken ? accessToken.length : 0);
    console.log('📋 表格配置:', {
        appToken: API_CONFIG.FEISHU.appToken,
        tableId: API_CONFIG.FEISHU.tableId
    });
    
    const topicEl = document.getElementById('topic');
    const wordCountEl = document.getElementById('word-count');
    const notesEl = document.getElementById('notes');
    
    // 获取数据
    const title = topicEl ? topicEl.value.trim() || '生成内容' : '生成内容';
    const content = appState.generatedContent;
    const wordCount = wordCountEl ? parseInt(wordCountEl.value) || content.length : content.length;
    const notes = notesEl ? notesEl.value.trim() || '' : '';
    const currentTime = new Date().toLocaleString('zh-CN');
    
    console.log('📊 待同步数据:', {
        title,
        contentLength: content.length,
        wordCount,
        notes
    });
    
    // 构建表格记录 - 按照飞书API文档格式
    const recordData = {
        "fields": {
            "标题": title,
            "内容": content,
            "字数": wordCount
            // 注意：创建时间字段如果是"创建时间"类型会自动填充，不需要手动设置
            // 注意：只包含在表格中实际存在的字段
        }
    };
    
    // 如果表格中有其他字段，可以添加（但要确保字段名称完全匹配）
    // 只添加在您的表格中确实存在的字段
    if (notes) {
        recordData.fields["补充说明"] = notes;
    }
    
    console.log('📊 准备同步到多维表格:', {
        appToken: API_CONFIG.FEISHU.appToken,
        tableId: API_CONFIG.FEISHU.tableId,
        recordData
    });
    
    // 调用飞书多维表格API
    const apiUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${API_CONFIG.FEISHU.appToken}/tables/${API_CONFIG.FEISHU.tableId}/records`;
    const requestOptions = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordData)
    };
    
    console.log('🔗 多维表格API调用:', { apiUrl, requestOptions });
    
    const response = await fetch(apiUrl, requestOptions);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ 多维表格API错误响应:', { 
            status: response.status, 
            statusText: response.statusText, 
            errorText,
            apiUrl,
            requestBody: recordData
        });
        
        // 解析错误信息
        let errorMessage = `多维表格同步失败 (${response.status})`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.msg) {
                errorMessage += `: ${errorJson.msg}`;
            }
            if (errorJson.code) {
                errorMessage += ` (错误代码: ${errorJson.code})`;
            }
        } catch (e) {
            errorMessage += `: ${errorText}`;
        }
        
        throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('✅ 多维表格同步成功:', result);
    
    return result;
}

// 同步到飞书（文档或多维表格）
async function syncToFeishu() {
    console.log('🚀 syncToFeishu 函数开始执行');
    console.log('📋 当前应用状态:', {
        hasGeneratedContent: !!appState.generatedContent,
        contentLength: appState.generatedContent ? appState.generatedContent.length : 0
    });
    
    if (!appState.generatedContent) {
        console.log('❌ 没有可同步的内容');
        showToast('没有可同步的内容', 'warning');
        return;
    }
    
    // 检查飞书配置
    console.log('🔍 检查飞书配置...');
    if (!checkFeishuConfig()) {
        console.log('❌ 飞书配置检查失败');
        showToast('请先完成飞书配置：点击右下角设置按钮 → 飞书文档配置 → 填写App ID和App Secret → 保存', 'warning');
        return;
    }
    console.log('✅ 飞书配置检查通过');
    
    try {
        const syncBtn = document.querySelector('.sync-btn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        console.log('🔄 准备获取访问令牌...');
        // 获取访问令牌
        const accessToken = await getFeishuAccessToken();
        console.log('✅ 访问令牌获取成功，准备同步...');
        let resultUrl;
        
        // 检查是否配置了多维表格参数
        if (API_CONFIG.FEISHU.appToken && API_CONFIG.FEISHU.tableId) {
            // 同步到多维表格
            showToast('正在同步到飞书多维表格...', 'info');
            const result = await syncToFeishuTable(accessToken);
            resultUrl = `https://feishu.cn/base/${API_CONFIG.FEISHU.appToken}?table=${API_CONFIG.FEISHU.tableId}`;
            showToast('已成功同步到飞书多维表格', 'success');
            
            // 询问是否打开表格
            if (confirm('同步成功！是否打开飞书多维表格？')) {
                window.open(resultUrl, '_blank');
            }
        } else {
            // 同步到文档（保持原有功能）
            showToast('正在同步到飞书文档...', 'info');
            
            // 获取主题作为文档标题
            const topicEl = document.getElementById('topic');
            const title = topicEl ? topicEl.value.trim() || '生成内容' : '生成内容';
            
            if (API_CONFIG.FEISHU.docToken) {
                // 更新现有文档
                resultUrl = await updateFeishuDoc(accessToken, API_CONFIG.FEISHU.docToken, appState.generatedContent);
            } else {
                // 创建新文档
                const result = await createFeishuDoc(accessToken, title, appState.generatedContent);
                resultUrl = result.url;
                
                // 保存文档Token供下次使用
                API_CONFIG.FEISHU.docToken = result.docToken;
                localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
            }
            
            showToast('已成功同步到飞书文档', 'success');
            
            // 询问是否打开文档
            if (confirm('同步成功！是否打开飞书文档？')) {
                window.open(resultUrl, '_blank');
            }
        }
        
    } catch (error) {
        console.error('飞书同步失败:', error);
        
        // 检查是否是CORS错误
        const isLocalEnv = window.location.hostname === 'localhost' ||
                          window.location.hostname === '127.0.0.1';
        
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            showToast('网络连接失败，请检查网络连接或API配置', 'error');
            console.log('💡 提示: 请检查网络连接、App ID和App Secret配置是否正确');
        } else {
            showToast(`飞书同步失败: ${error.message}`, 'error');
        }
    } finally {
        const syncBtn = document.querySelector('.sync-btn');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
        }
    }
}

// 更新字数统计
function updateWordCount(content) {
    const wordCount = content.length;
    const wordCountDisplay = document.getElementById('word-count-display');
    if (wordCountDisplay) {
        wordCountDisplay.textContent = `约 ${wordCount} 字`;
    }
}

// 飞书API相关函数
async function getFeishuAccessToken() {
    console.log('🚀 开始获取飞书访问令牌');
    console.log('📝 当前飞书配置:', {
        appId: API_CONFIG.FEISHU.appId ? `${API_CONFIG.FEISHU.appId.substring(0, 8)}...` : '未配置',
        appSecret: API_CONFIG.FEISHU.appSecret ? `${API_CONFIG.FEISHU.appSecret.substring(0, 8)}...` : '未配置',
        appToken: API_CONFIG.FEISHU.appToken ? `${API_CONFIG.FEISHU.appToken.substring(0, 8)}...` : '未配置',
        tableId: API_CONFIG.FEISHU.tableId ? `${API_CONFIG.FEISHU.tableId.substring(0, 8)}...` : '未配置'
    });
    
    // 验证配置
    if (!API_CONFIG.FEISHU.appId || !API_CONFIG.FEISHU.appSecret) {
        console.error('❌ 飞书配置不完整');
        throw new Error('请先配置飞书App ID和App Secret');
    }
    
    // 飞书API直接调用，无需环境区分
    const apiUrl = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
    const requestBody = {
        app_id: API_CONFIG.FEISHU.appId,
        app_secret: API_CONFIG.FEISHU.appSecret
    };
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    };
    
    console.log('🔗 API请求信息:', { 
        apiUrl, 
        method: 'POST',
        headers: requestOptions.headers,
        bodyKeys: Object.keys(requestBody)
    });
    
    try {
        const response = await fetch(apiUrl, requestOptions);
        
        console.log('📡 API响应状态:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ HTTP请求失败:', { status: response.status, statusText: response.statusText, errorText });
            throw new Error(`HTTP请求失败: ${response.status} - ${response.statusText}\n${errorText}`);
        }
        
        const result = await response.json();
        console.log('📋 API响应结果:', {
            code: result.code,
            msg: result.msg,
            hasToken: !!result.tenant_access_token,
            tokenLength: result.tenant_access_token ? result.tenant_access_token.length : 0
        });
        
        if (result.code !== 0) {
            console.error('❌ 飞书API返回错误:', result);
            throw new Error(`飞书API错误: ${result.msg} (代码: ${result.code})`);
        }
        
        console.log('✅ 访问令牌获取成功');
        return result.tenant_access_token;
        
    } catch (error) {
        console.error('❌ 获取访问令牌过程中发生错误:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('网络连接失败，请检查网络连接');
        }
        throw error;
    }
}

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
            folder_token: ''
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

async function updateFeishuDoc(accessToken, docToken, content) {
    await updateFeishuDocContent(accessToken, docToken, content);
    return `https://docs.feishu.cn/docx/${docToken}`;
}

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

function convertMarkdownToFeishuBlocks(content) {
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

        // 获取所有飞书配置字段
        const feishuAppTokenEl = document.getElementById('feishu-app-token');
        const feishuTableIdEl = document.getElementById('feishu-table-id');
        
        // 更新API_CONFIG
        API_CONFIG.FEISHU.appId = feishuAppIdEl.value.trim();
        API_CONFIG.FEISHU.appSecret = feishuAppSecretEl.value.trim();
        API_CONFIG.FEISHU.docToken = feishuDocTokenEl ? feishuDocTokenEl.value.trim() : '';
        API_CONFIG.FEISHU.appToken = feishuAppTokenEl ? feishuAppTokenEl.value.trim() : '';
        API_CONFIG.FEISHU.tableId = feishuTableIdEl ? feishuTableIdEl.value.trim() : '';

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
        localStorage.setItem('boss_kb_config', JSON.stringify(API_CONFIG));
        
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

// 加载飞书配置
function loadFeishuConfig() {
    try {
        console.log('🔄 开始加载飞书配置...');
        
        // 从本地存储加载配置
        const savedConfig = localStorage.getItem('boss_kb_config');
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            if (config.FEISHU) {
                API_CONFIG.FEISHU = { ...API_CONFIG.FEISHU, ...config.FEISHU };
                console.log('📋 从本地存储加载的飞书配置:', {
                    appId: config.FEISHU.appId ? `${config.FEISHU.appId.substring(0, 8)}...` : '未设置',
                    appSecret: config.FEISHU.appSecret ? '***已设置***' : '未设置',
                    docToken: config.FEISHU.docToken ? `${config.FEISHU.docToken.substring(0, 8)}...` : '未设置',
                    appToken: config.FEISHU.appToken ? `${config.FEISHU.appToken.substring(0, 8)}...` : '未设置',
                    tableId: config.FEISHU.tableId ? `${config.FEISHU.tableId.substring(0, 8)}...` : '未设置'
                });
            } else {
                console.log('📋 本地存储中没有飞书配置');
            }
        } else {
            console.log('📋 本地存储中没有配置数据');
        }

        // 检查并填充到界面
        const elements = {
            feishuAppIdEl: document.getElementById('feishu-app-id'),
            feishuAppSecretEl: document.getElementById('feishu-app-secret'),
            feishuDocTokenEl: document.getElementById('feishu-doc-token'),
            feishuAppTokenEl: document.getElementById('feishu-app-token'),
            feishuTableIdEl: document.getElementById('feishu-table-id')
        };
        
        console.log('🔍 检查界面元素是否存在:', {
            'feishu-app-id': !!elements.feishuAppIdEl,
            'feishu-app-secret': !!elements.feishuAppSecretEl,
            'feishu-doc-token': !!elements.feishuDocTokenEl,
            'feishu-app-token': !!elements.feishuAppTokenEl,
            'feishu-table-id': !!elements.feishuTableIdEl
        });
        
        if (elements.feishuAppIdEl) {
            elements.feishuAppIdEl.value = API_CONFIG.FEISHU.appId || '';
            console.log('✅ App ID已填充到界面');
        }
        if (elements.feishuAppSecretEl) {
            elements.feishuAppSecretEl.value = API_CONFIG.FEISHU.appSecret || '';
            console.log('✅ App Secret已填充到界面');
        }
        if (elements.feishuDocTokenEl) {
            elements.feishuDocTokenEl.value = API_CONFIG.FEISHU.docToken || '';
            console.log('✅ Doc Token已填充到界面');
        }
        if (elements.feishuAppTokenEl) {
            elements.feishuAppTokenEl.value = API_CONFIG.FEISHU.appToken || '';
            console.log('✅ App Token已填充到界面');
        }
        if (elements.feishuTableIdEl) {
            elements.feishuTableIdEl.value = API_CONFIG.FEISHU.tableId || '';
            console.log('✅ Table ID已填充到界面');
        }
        
        console.log('✅ 飞书配置加载完成:', {
            appId: API_CONFIG.FEISHU.appId ? `${API_CONFIG.FEISHU.appId.substring(0, 8)}...` : '未设置',
            appSecret: API_CONFIG.FEISHU.appSecret ? '***已设置***' : '未设置',
            docToken: API_CONFIG.FEISHU.docToken ? `${API_CONFIG.FEISHU.docToken.substring(0, 8)}...` : '未设置',
            appToken: API_CONFIG.FEISHU.appToken ? `${API_CONFIG.FEISHU.appToken.substring(0, 8)}...` : '未设置',
            tableId: API_CONFIG.FEISHU.tableId ? `${API_CONFIG.FEISHU.tableId.substring(0, 8)}...` : '未设置'
        });
    } catch (error) {
        console.error('❌ 飞书配置加载失败:', error);
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

// 全局暴露功能函数
window.editGeneratedContent = editGeneratedContent;
window.downloadGeneratedContent = downloadGeneratedContent;
window.syncToFeishu = syncToFeishu;
window.saveEditedContent = saveEditedContent;
window.saveFeishuConfig = saveFeishuConfig;
window.loadFeishuConfig = loadFeishuConfig;
window.checkFeishuConfig = checkFeishuConfig;

// 检查关键函数是否可用
console.log('🔍 检查关键函数可用性:');
console.log('- selectFiles:', typeof selectFiles);
console.log('- addUrlInput:', typeof addUrlInput);

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM加载完成，开始初始化');
    
    // 检查关键元素是否存在
    const selectFilesBtn = document.querySelector('button[onclick="selectFiles()"]');
    const addUrlBtn = document.querySelector('button[onclick="addUrlInput()"]');
    console.log('🔍 检查按钮元素:');
    console.log('- 添加文件按钮:', selectFilesBtn);
    console.log('- 添加链接按钮:', addUrlBtn);
    
    if (!selectFilesBtn) console.error('❌ 未找到添加文件按钮');
    if (!addUrlBtn) console.error('❌ 未找到添加链接按钮');
});

// 显示全屏模态框
function showFullscreen(button) {
    const modal = document.getElementById('fullscreen-modal');
    const content = button.closest('.style-analysis-content').querySelector('.markdown-content').innerHTML;
    document.getElementById('fullscreen-content').innerHTML = content;
    modal.style.display = 'block';
    
    // 重新应用代码高亮
    document.querySelectorAll('#fullscreen-content pre code').forEach((block) => {
        hljs.highlightBlock(block);
    });
}

// 关闭全屏模态框
function closeFullscreenModal() {
    document.getElementById('fullscreen-modal').style.display = 'none';
}

// 在页面加载完成后初始化事件监听
document.addEventListener('DOMContentLoaded', function() {
    // 配置Marked选项
    marked.setOptions({
        breaks: true,  // 支持GitHub风格的换行
        gfm: true,     // 启用GitHub风格的Markdown
        headerIds: true, // 为标题添加id
        mangle: false,  // 不转义标题中的字符
        sanitize: false // 允许HTML标签
    });
    
    // 点击模态框背景关闭
    const modal = document.getElementById('fullscreen-modal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeFullscreenModal();
        }
    });
    
    // ESC键关闭模态框
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeFullscreenModal();
        }
    });
});

// 复制测试地址功能
document.querySelector('.copy-test-url-btn').addEventListener('click', async function() {
    const testUrl = 'https://www.takungpao.com/house/dichan/2025/0604/1092529.html';
    try {
        await navigator.clipboard.writeText(testUrl);
        const originalText = this.textContent;
        this.textContent = '复制成功！';
        this.style.background = '#198754';
        
        setTimeout(() => {
            this.textContent = originalText;
            this.style.background = '#28a745';
        }, 2000);
    } catch (err) {
        console.error('复制失败:', err);
        this.textContent = '复制失败';
        this.style.background = '#dc3545';
        
        setTimeout(() => {
            this.textContent = '复制测试地址';
            this.style.background = '#28a745';
        }, 2000);
    }
});

// 隐私弹窗功能
function showPrivacyModal() {
    const privacyModal = document.querySelector('.privacy-modal');
    if (privacyModal) {
        privacyModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }
}

// 关闭弹窗
function closePrivacyModal() {
    const privacyModal = document.querySelector('.privacy-modal');
    if (privacyModal) {
        privacyModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// 确保DOM加载完成后绑定所有事件
document.addEventListener('DOMContentLoaded', function() {
    const privacyModal = document.querySelector('.privacy-modal');
    const privacyBtn = document.querySelector('.privacy-btn');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const copyButtons = document.querySelectorAll('.copy-btn');

    console.log('隐私弹窗初始化:', { privacyModal, privacyBtn, closeModalBtn, copyButtons });

    // 点击隐私按钮显示弹窗
    if (privacyBtn) {
        privacyBtn.addEventListener('click', showPrivacyModal);
        console.log('隐私按钮事件已绑定');
    } else {
        console.error('未找到隐私按钮元素 .privacy-btn');
    }

    // 点击关闭按钮关闭弹窗
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closePrivacyModal);
    }

    // 点击弹窗外部关闭弹窗
    if (privacyModal) {
        privacyModal.addEventListener('click', (e) => {
            if (e.target === privacyModal) {
                closePrivacyModal();
            }
        });
    }

    // 复制功能
    copyButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const textToCopy = button.getAttribute('data-text');
            try {
                await navigator.clipboard.writeText(textToCopy);
                
                // 视觉反馈
                button.classList.add('success');
                const originalIcon = button.innerHTML;
                button.innerHTML = '<i class="fas fa-check"></i>';
                
                setTimeout(() => {
                    button.classList.remove('success');
                    button.innerHTML = originalIcon;
                }, 2000);
            } catch (err) {
                console.error('复制失败:', err);
            }
        });
    });
    
    // 添加ESC键关闭功能
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && privacyModal && privacyModal.style.display === 'flex') {
            closePrivacyModal();
        }
    });
    
    // 延迟加载飞书配置，确保元素已存在
    setTimeout(() => {
        loadFeishuConfig();
    }, 100); // 减少延迟时间
});

// 全局函数，供HTML onclick使用
window.showPrivacyModal = showPrivacyModal;
window.closePrivacyModal = closePrivacyModal;

// 编辑功能
let isEditing = false;
const resultContent = document.getElementById('result-content');

function toggleEdit() {
    const editBtn = document.querySelector('.edit-btn');
    isEditing = !isEditing;
    
    if (isEditing) {
        // 进入编辑模式
        resultContent.contentEditable = true;
        resultContent.classList.add('editable');
        editBtn.innerHTML = '<i class="fas fa-save"></i>';
        editBtn.title = '保存修改';
    } else {
        // 退出编辑模式
        resultContent.contentEditable = false;
        resultContent.classList.remove('editable');
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.title = '编辑修改';
        // 这里可以添加保存到后端的逻辑
    }
}

// 保存到本地
function saveToLocal() {
    const content = resultContent.innerHTML;
    const blob = new Blob([content], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `生成内容_${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// 全屏查看
function showFullscreenModal() {
    const modal = document.getElementById('fullscreen-modal');
    const modalContent = document.getElementById('fullscreen-content');
    modalContent.innerHTML = resultContent.innerHTML;
    modal.style.display = 'flex';
}

// 关闭全屏
function closeFullscreenModal() {
    const modal = document.getElementById('fullscreen-modal');
    modal.style.display = 'none';
}

// 旧的syncToFeishu函数已移除，使用下方完整实现的版本

// 为按钮添加事件监听
document.addEventListener('DOMContentLoaded', function() {
    // 编辑按钮
    const editBtn = document.querySelector('.edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', toggleEdit);
    }

    // 保存按钮
    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveToLocal);
    }

    // 同步按钮
    const syncBtn = document.querySelector('.sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncToFeishu);
    }
    
    // 风格区域的复制和编辑按钮
    const copyStyleBtn = document.querySelector('.copy-style-btn');
    if (copyStyleBtn) {
        copyStyleBtn.addEventListener('click', copyStyleContent);
    }
    
    const editStyleBtn = document.querySelector('.edit-style-btn');
    if (editStyleBtn) {
        editStyleBtn.addEventListener('click', toggleStyleEdit);
    }
    
    // 初始化手动输入监听器
    setupManualInputListener();
});

// 进度条相关函数
function showProgressBar(type, title, status) {
    // 创建或获取进度条容器
    let progressContainer = document.getElementById('progress-container');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container';
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-header">
                <div class="progress-title">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span id="progress-title">${title}</span>
                </div>
                <div class="progress-percentage" id="progress-percentage">0%</div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progress-bar"></div>
            </div>
            <div class="progress-status" id="progress-status">${status}</div>
        `;
        
        // 插入到页面中
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.insertBefore(progressContainer, mainContent.firstChild);
        }
    }
    
    // 显示进度条
    progressContainer.classList.add('active');
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-status').textContent = status;
    document.getElementById('progress-percentage').textContent = '0%';
    document.getElementById('progress-bar').style.width = '0%';
}

function updateProgress(percentage) {
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    
    if (progressBar && progressPercentage) {
        progressBar.style.width = percentage + '%';
        progressPercentage.textContent = percentage + '%';
    }
}

function updateProgressStatus(status) {
    const progressStatus = document.getElementById('progress-status');
    if (progressStatus) {
        progressStatus.textContent = status;
    }
}

function hideProgressBar() {
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.classList.remove('active');
        setTimeout(() => {
            if (progressContainer.parentNode) {
                progressContainer.parentNode.removeChild(progressContainer);
            }
        }, 300);
    }
}

// 现在内容风格使用textarea，不需要复杂的编辑函数了
// 用户可以直接在textarea中编辑

 