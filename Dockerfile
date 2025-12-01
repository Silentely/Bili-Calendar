# 使用官方Node.js轻量级镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置时区
RUN apk add --no-cache tzdata tini && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 为 HEALTHCHECK 安装 wget（alpine 默认提供 busybox wget，但明确安装可避免裁剪导致的缺失）
RUN apk add --no-cache wget

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 先安装所有依赖（包括devDependencies，用于构建）
RUN npm ci

# 复制应用程序代码
COPY . .

# 执行前端构建（生成 dist/ 目录）
RUN npm run build

# 清理devDependencies，只保留生产依赖
RUN npm prune --omit=dev

# 暴露端口
EXPOSE 3000

# 设置健康检查：命中 /status，放宽 timeout 与 start-period 以适配冷启动
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/status || exit 1

# 设置环境变量
ENV NODE_ENV=production

# 以非 root 运行
USER node

# 启动命令（使用 tini 作为 init 进程）
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]