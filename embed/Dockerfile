# 嵌入服务镜像：node:22-slim（onnxruntime-node 的官方预编译只覆盖 glibc，不能用 alpine）
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# 有 lockfile 用 npm ci（可复现），否则退回 npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV EMBED_PORT=8080
# onnxruntime 动态链接需要 libgomp
RUN apt-get update \
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
