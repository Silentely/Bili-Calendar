# Bili-Calendar (B站追番日历)

将B站追番列表转换为日历订阅，支持 iCal/ICS 格式，可导入 Apple 日历、Google 日历、Outlook 等主流日历应用。

## 功能特点

- 📅 **自动同步**：根据 B站追番列表自动生成日历订阅
- 🕒 **准确时间**：精确解析番剧更新时间，支持时区自动转换
- 🔁 **智能重复**：连载中番剧自动设置每周重复，完结番剧仅保留首播时间
- 📱 **多平台支持**：兼容 Apple 日历、Google 日历、Outlook 等所有支持 ICS 格式的日历应用
- 🚀 **简单易用**：只需提供 B站 UID 即可生成订阅链接
- 🌐 **隐私保护**：服务端不存储任何用户数据，支持自部署

## 使用方法

### 公共服务（推荐）

1. 访问 [https://bili-calendar.example.com](https://bili-calendar.example.com)（请替换为实际部署地址）
2. 输入您的 B站 UID（在 B站个人空间网址中找到，例如：space.bilibili.com/614500 中的 614500）
3. 点击"生成订阅"按钮
4. 将生成的订阅链接添加到您的日历应用中

### 私有部署

#### 使用 Docker（推荐）

```bash
# 创建 docker-compose.yml 文件
version: '3.8'
services:
  bili-calendar:
    image: ghcr.io/Silentely/bili-calendar:latest
    ports:
      - "3000:3000"
    environment:
      - BILIBILI_COOKIE=  # 可选，用于提高API访问成功率
      - NODE_ENV=production
      - TZ=Asia/Shanghai
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs  # 可选，用于持久化日志

# 启动服务
docker-compose up -d
```

#### 手动部署

```bash
# 克隆仓库
git clone https://github.com/Silentely/bili-calendar.git
cd bili-calendar

# 安装依赖
npm install

# 启动服务
npm start

# 或者在开发模式下运行
npm run dev
```

## API 接口

### 获取用户追番日历

```
GET /:uid
```

参数：
- `uid`: B站用户 UID

返回：ICS 格式的日历文件

### 获取用户追番数据（JSON）

```
GET /api/bangumi/:uid
```

参数：
- `uid`: B站用户 UID

返回：B站追番列表的 JSON 数据

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务监听端口 |
| `BILIBILI_COOKIE` | 空 | B站 Cookie，用于提高API访问成功率 |
| `NODE_ENV` | development | 运行环境（development/production） |
| `TZ` | Asia/Shanghai | 时区设置 |

### 注意事项

1. **隐私设置**：您的 B站追番列表必须设置为公开才能被获取
2. **Cookie 设置**：如果遇到访问频率限制，可以设置 `BILIBILI_COOKIE` 环境变量
3. **时区处理**：服务默认使用东八区时间（北京时间），请确保部署环境时区正确

## 技术架构

- **后端**：Node.js + Express
- **前端**：原生 HTML/CSS/JavaScript
- **容器化**：Docker + Docker Compose
- **Serverless**：支持 Netlify Functions 部署
- **日历格式**：遵循 RFC 5545 标准的 ICS 格式

## 开发指南

### 项目结构

```
bili-calendar/
├── server.js              # 主服务文件
├── main.js                # 主应用逻辑
├── netlify.toml           # Netlify配置
├── netlify-functions.js   # Netlify函数构建助手
├── netlify/               # Netlify函数目录
│   └── functions/         # 函数代码
│       └── server.js      # Serverless版本的服务器
├── public/                # 静态文件目录
│   └── index.html         # 前端页面
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── package.json           # Node.js 项目配置
└── README.md              # 项目说明文档
```

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（支持热重载）
npm run dev

# 构建并启动生产服务器
npm run start:prod
```

## 部署指南

### 部署到云服务器

1. 克隆项目到服务器
2. 安装 Node.js 环境（建议使用 v18 或更高版本）
3. 安装 PM2 进程管理器：`npm install -g pm2`
4. 安装项目依赖：`npm install`
5. 启动服务：`pm2 start npm --name "bili-calendar" -- start`
6. 设置开机自启：`pm2 startup && pm2 save`

### 部署到 Netlify

1. 在 Netlify 导入 GitHub 仓库
2. 配置以下构建设置:
   - 构建命令: `npm run build`
   - 发布目录: `public`
   - 环境变量: 根据需要设置 `BILIBILI_COOKIE` 等
3. Netlify.toml 文件已包含必要配置:
   ```toml
   [build]
     command = "npm run build"
     publish = "public"
     functions = "netlify/functions-build"

   [[redirects]]
     from = "/*"
     to = "/.netlify/functions/server"
     status = 200
   ```
4. 本项目已包含所有必要的Netlify Functions配置，无需额外设置

> **注意**: 项目已通过 `serverless-http` 将Express应用包装为Netlify函数，并使用ES模块格式，所有必要的依赖已添加到package.json中。

### 部署到 Vercel

1. Fork 本项目到您的 GitHub 账户
2. 在 Vercel 官网导入项目
3. 设置环境变量（如需要）
4. 部署完成

## 常见问题

### 为什么显示"[时间未知]"？

可能原因：
1. 番剧尚未公布具体更新时间
2. B站API返回的数据格式有变化
3. 网络问题导致API访问失败

### 如何获取 B站 UID？

1. 打开 B站个人空间页面（例如：https://space.bilibili.com/614500）
2. URL中的数字部分就是您的 UID（示例中为 614500）

### 如何更新日历？

日历订阅链接是动态生成的，会自动获取最新的追番列表。大多数日历应用会定期自动同步更新。

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进本项目！

### 开发流程

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/your-feature-name`
3. 提交更改：`git commit -am 'Add some feature'`
4. 推送到分支：`git push origin feature/your-feature-name`
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证，详情请见 [LICENSE](LICENSE) 文件。

## 免责声明

本项目仅供学习交流使用，不提供任何 B站 相关的账号服务。请遵守 B站 的相关服务条款和使用规范。 