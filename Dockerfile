# syntax=docker/dockerfile:1
# ---------- 依赖安装层 ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# 有 lockfile 用 npm ci（可复现），否则退回 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- 构建层 ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# 构建期占位变量：prisma.config.ts 与 lib/prisma.ts 在导入时就需要这些值存在。
# 这里只是占位，运行时由 compose 的 env_file / environment 覆盖为真实值。
ENV CHECKPOINT_DISABLE=1
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV REDIS_URL="redis://127.0.0.1:6379"
ENV BETTER_AUTH_SECRET="build-time-placeholder-secret-not-used-at-runtime"
# 构建期占位：避免 page data collection 时 Better Auth 报「缺少 clientId/clientSecret」噪音；
# 运行时由 compose 的 env_file 覆盖为真实值
ENV BETTER_AUTH_URL="http://127.0.0.1:3000"
ENV GITHUB_CLIENT_ID="build-placeholder"
ENV GITHUB_CLIENT_SECRET="build-placeholder"
ENV GOOGLE_CLIENT_ID="build-placeholder"
ENV GOOGLE_CLIENT_SECRET="build-placeholder"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 运行层 ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
