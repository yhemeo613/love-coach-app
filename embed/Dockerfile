# 嵌入服务镜像：node:22-slim（onnxruntime-node 的官方预编译只覆盖 glibc，不能用 alpine）
FROM node:22-slim AS deps
WORKDIR /app
# 构建机器在国内：npm 换国内镜像源（可用 --build-arg NPM_REGISTRY= 覆盖）
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json* ./
# 有 lockfile 用 npm ci（可复现），否则退回 npm install
RUN npm config set registry "${NPM_REGISTRY}" \
  && if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV EMBED_PORT=8080
# 构建机器在国内：apt 换国内镜像源（可用 --build-arg DEBIAN_MIRROR= 覆盖）
# 注意用 http：node:22-slim 精简镜像未预装 ca-certificates，https 源会因证书缺失失败
ARG DEBIAN_MIRROR=http://mirrors.aliyun.com
# onnxruntime 动态链接需要 libgomp
RUN sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g; s|http://security.debian.org|${DEBIAN_MIRROR}|g" \
      /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server.mjs ./
COPY --chown=node:node models ./models

USER node
EXPOSE 8080

# 模型加载需要几十秒，start-period 给足；ready 字段由服务在模型就绪后置真
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(d=>process.exit(d.ready?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
