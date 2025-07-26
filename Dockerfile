# 使用官方Node.js轻量级镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置时区
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖，使用生产模式
RUN npm install --omit=dev

# 复制应用程序代码
COPY . .

# 确保目录权限正确
RUN mkdir -p netlify/functions-build && \
    cp -r netlify/functions/* netlify/functions-build/ && \
    cp main.js netlify/functions-build/

# 暴露端口
EXPOSE 3000

# 设置健康检查
HEALTHCHECK --interval=60s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

# 设置环境变量
ENV NODE_ENV=production

# 启动命令
CMD ["node", "server.js"]