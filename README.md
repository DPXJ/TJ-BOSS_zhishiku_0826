# 老板专属知识库 - AI智能写作助手

一个基于FastGPT的智能写作助手，帮助用户学习写作风格并生成专属内容。

## ✨ 功能特色

### 🎯 风格输入学习
- **文件上传支持**：支持PDF、Word、TXT等多种格式文件上传
- **链接分析**：自动抓取网页内容进行风格学习
- **OSS云存储**：安全可靠的文件存储服务

### 🧠 AI风格分析
- **深度学习**：基于FastGPT工作流的智能风格分析
- **风格提炼**：自动提取写作风格的DNA特征
- **可视化报告**：详细的风格分析报告展示

### 📝 内容生成要求
- **灵活配置**：支持多种内容类型和字数要求
- **风格继承**：基于学习的风格生成专属内容
- **实时编辑**：支持风格内容的实时编辑和调整

### 🚀 内容生成
- **智能生成**：基于学习风格的高质量内容生成
- **多格式支持**：支持不同类型的内容输出
- **编辑功能**：生成后支持在线编辑和优化

## 🛠️ 技术架构

### 前端技术
- **HTML5 + CSS3**：响应式设计，美观现代的用户界面
- **JavaScript (ES6+)**：原生JavaScript，无框架依赖
- **Marked.js**：Markdown渲染支持
- **Highlight.js**：代码语法高亮

### 后端服务
- **Node.js + Express**：高性能代理服务器
- **CORS处理**：跨域请求支持
- **请求转发**：安全的API请求代理

### AI服务集成
- **FastGPT**：强大的AI工作流引擎
- **风格分析工作流**：专业的写作风格分析
- **内容生成工作流**：智能的内容创作服务

### 云服务
- **阿里云OSS**：文件存储和管理
- **CDN加速**：快速的静态资源访问

## 📦 快速开始

### 环境要求
- Node.js 16.0+
- npm 8.0+

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/DPXJ/TJ-BOSS_zhishiku_0826.git
cd TJ-BOSS_zhishiku_0826
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境**
   - 复制并配置OSS和FastGPT API密钥
   - 在页面设置中配置相关参数

4. **启动服务**
```bash
npm start
```

5. **访问应用**
   - 打开浏览器访问 `http://localhost:3001`

## ⚙️ 配置说明

### OSS配置
- **AccessKey ID**：阿里云OSS访问密钥ID
- **AccessKey Secret**：阿里云OSS访问密钥Secret
- **Bucket**：OSS存储桶名称
- **Region**：OSS服务区域

### FastGPT配置
- **API密钥**：FastGPT服务API密钥
- **风格分析工作流ID**：用于风格学习的工作流ID
- **内容生成工作流ID**：用于内容生成的工作流ID

## 🎨 界面预览

### 主要页面
1. **风格输入学习**：上传文件或添加链接进行风格学习
2. **输入生成要求**：配置内容生成的具体要求
3. **内容生成**：生成和编辑专属内容

### 特色功能
- 🎯 直观的三步骤操作流程
- 📊 详细的风格分析报告
- ✏️ 实时的内容编辑功能
- 💾 便捷的内容导出功能

## 📱 部署说明

### GitHub Pages部署
项目支持直接部署到GitHub Pages：

1. Fork本项目到您的GitHub账户
2. 在仓库设置中启用GitHub Pages
3. 选择主分支作为发布源
4. 访问 `https://yourusername.github.io/TJ-BOSS_zhishiku_0826`

### 自定义部署
- 支持部署到任何静态网站托管服务
- 支持Docker容器化部署
- 支持云服务器部署

## 🔧 开发指南

### 项目结构
```
├── index.html          # 主页面
├── script.js           # 主要业务逻辑
├── styles.css          # 样式文件
├── proxy-server.js     # Node.js代理服务器
├── package.json        # 项目配置
└── README.md          # 项目说明
```

### 核心模块
- **文件上传模块**：处理多种格式文件的上传和存储
- **风格分析模块**：与FastGPT集成的AI分析服务
- **内容生成模块**：基于风格的智能内容创作
- **用户界面模块**：响应式的现代化UI设计

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进项目！

### 开发流程
1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [FastGPT](https://github.com/labring/FastGPT) - 强大的AI工作流平台
- [Marked.js](https://marked.js.org/) - Markdown解析器
- [Highlight.js](https://highlightjs.org/) - 语法高亮库
- [阿里云OSS](https://www.aliyun.com/product/oss) - 对象存储服务

## 📞 联系我们

如有任何问题或建议，请通过以下方式联系：

- 🐛 [提交Issue](https://github.com/DPXJ/TJ-BOSS_zhishiku_0826/issues)
- 💬 [讨论区](https://github.com/DPXJ/TJ-BOSS_zhishiku_0826/discussions)

---

⭐ 如果这个项目对您有帮助，请给我们一个Star！