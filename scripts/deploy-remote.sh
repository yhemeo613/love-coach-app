#!/usr/bin/env bash
# 服务器端部署脚本（由 CD 工作流通过 ssh 调用；本机也可手动执行）
#
# 流程：环境自检 → 拉取代码 → 备份数据库 → 构建镜像（打 SHA 标签）→
#       应用迁移 → 切换新版本 → 健康门禁（失败自动回滚）→ 冒烟测试 → 输出部署摘要
#
# 依赖：docker compose 项目置于 $APP_DIR；.env 已配置；embed 镜像已就位。
# 产物：/tmp/deploy-summary.md（供 CI 生成 GitHub Actions 摘要）
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/apps/love-coach}"
cd "$APP_DIR" || { echo "找不到 $APP_DIR"; exit 1; }

# 固定 compose 项目名：避免从其他目录误执行时创建出一套游离容器（用过 8b2944f0531e_ 前缀的那批）
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-love-coach}"

HEALTH_FILE=/tmp/deploy-health.json
SUMMARY=/tmp/deploy-summary.md
BACKUP_DIR="$APP_DIR/backups"
KEEP_BACKUPS=10
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DEPLOY_START=$(date +%s)
STEP_START=$DEPLOY_START

hr() {
  NOW=$(date +%s)
  echo
  echo "[$(date '+%F %T')] ════════ $1 ════════（本步 $((NOW - STEP_START))s / 累计 $((NOW - DEPLOY_START))s）"
  STEP_START=$NOW
}
fail() { echo; echo "[$(date '+%F %T')] ✗ $1"; exit 1; }

: > "$SUMMARY"

hr "1/8 环境自检"
echo "主机: $(hostname) | 项目目录: $APP_DIR | 时间: $(date -Is)"
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version | head -1)"
free -m | head -2
df -h / | tail -1
[ -f .env ] || fail "缺少 .env"
docker image inspect love-coach-embed:latest >/dev/null 2>&1 || {
  echo "缺少 love-coach-embed:latest 镜像。获取方式："
  echo "  本机执行：docker compose build embed && docker save love-coach-embed:latest | gzip | ssh <server> 'gunzip | docker load'"
  echo "  或在服务器执行：docker compose build embed（首次约 30-60 分钟）"
  fail "embed 镜像缺失"
}
echo "embed 镜像: $(docker images love-coach-embed:latest --format '{{.ID}} {{.Size}}')"

hr "2/8 拉取代码"
echo "拉取前: $(git log --oneline -1)"
if ! git pull --ff-only 2>&1; then
  echo "首次拉取失败，10 秒后重试（服务器到 GitHub 偶发不稳）"
  sleep 10
  git pull --ff-only 2>&1 || fail "拉取代码失败"
fi
SHA="$(git rev-parse --short HEAD)"
echo "拉取后: $(git log --oneline -1)"
git status --short | grep -v '^??' | head -5 || true

# 摘要表头在拉取之后写，保证记录的是本次实际部署的提交
{
  echo "## 部署摘要"
  echo
  echo "| 项目 | 值 |"
  echo "|------|-----|"
  echo "| 提交 | \`$SHA\` |"
  echo "| 时间 | $(date '+%F %T %Z') |"
} > "$SUMMARY"

hr "3/8 备份数据库"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-lovecoach}" >/dev/null 2>&1; then
  if docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-lovecoach}" "${POSTGRES_DB:-lovecoach}" \
       | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"; then
    echo "备份完成: backups/db-$STAMP.sql.gz（$(du -h "$BACKUP_DIR/db-$STAMP.sql.gz" | cut -f1)）"
  else
    echo "::warning::数据库备份失败（继续部署，但请注意）"
  fi
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
  echo "备份保留最近 $KEEP_BACKUPS 份"
else
  echo "Postgres 未运行（首次部署），跳过备份"
fi

hr "4/8 构建镜像"
# 回滚点：保存当前版本
if docker image inspect love-coach:latest >/dev/null 2>&1; then
  docker tag love-coach:latest love-coach:previous
  echo "已保存上一版本为 love-coach:previous"
fi

if [ "${APP_IMAGE_PREBUILT:-0}" = "1" ]; then
  echo "应用镜像由本机推送（跳过服务器构建，Next.js 在 2 核机上构建要 8-10 分钟）"
else
  docker compose build app 2>&1 | tail -20
fi
docker tag love-coach:latest "love-coach:sha-$SHA" 2>/dev/null || true

# 迁移/索引镜像（builder 目标）只在迁移目录或索引脚本变化时重建，否则复用现有镜像
TOOLS_HASH="$(git rev-parse "HEAD:prisma/migrations" 2>/dev/null || echo none)-$(git rev-parse "HEAD:scripts/rag-index.mjs" 2>/dev/null || echo none)"
PREV_TOOLS_HASH="$(cat .tools-image-hash 2>/dev/null || echo none)"
if [ "$TOOLS_HASH" != "$PREV_TOOLS_HASH" ] || ! docker image inspect love-coach-migrate:latest >/dev/null 2>&1; then
  echo "迁移/索引镜像需要重建（迁移或索引脚本有变化）"
  docker compose build migrate rag-index 2>&1 | tail -12
  echo "$TOOLS_HASH" > .tools-image-hash
else
  echo "迁移/索引镜像无变化，跳过重建（省约 8 分钟）"
fi

echo "--- 镜像清单 ---"
docker images --format "{{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}" \
  | grep -E "love-coach|pgvector|redis" | head -8

hr "5/8 应用数据库迁移"
docker compose run --rm migrate || fail "数据库迁移失败"
echo "--- 已应用迁移 ---"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-lovecoach}" -d "${POSTGRES_DB:-lovecoach}" \
  -Atc "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name" || true

hr "6/8 切换新版本"
docker compose up -d 2>&1 | tail -6
sleep 5
docker compose ps

hr "7/8 健康门禁（失败自动回滚）"
APP_PORT_VAL="$(sed -n 's/^APP_PORT=//p' .env | tail -1 | tr -d '\r')"
HEALTH_URL="http://127.0.0.1:${APP_PORT_VAL:-8080}/api/health"
echo "检查地址: $HEALTH_URL"
HEALTHY=0
for i in $(seq 1 12); do
  if curl -fsS --max-time 10 "$HEALTH_URL" > "$HEALTH_FILE" 2>/dev/null; then HEALTHY=1; break; fi
  echo "  等待应用就绪（第 $i/12 次）…"
  sleep 10
done
if [ "$HEALTHY" != "1" ]; then
  echo "健康检查失败，最近日志："
  docker compose logs --tail=60 app
  if docker image inspect love-coach:previous >/dev/null 2>&1; then
    echo "== 自动回滚到上一版本 =="
    docker tag love-coach:previous love-coach:latest
    docker compose up -d app 2>&1 | tail -3
    sleep 10
    curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1 && echo "回滚后应用已恢复" || echo "::error::回滚后仍不健康，需人工介入"
    echo "| 结果 | ❌ 部署失败并已回滚 |" >> "$SUMMARY"
  else
    echo "| 结果 | ❌ 部署失败（无上一版本可回滚）|" >> "$SUMMARY"
  fi
  cat "$SUMMARY"
  fail "健康检查未通过"
fi
echo "健康检查通过: $(cat "$HEALTH_FILE")"

hr "8/8 冒烟测试"
SMOKE_FAIL=0
# 1) 应用健康字段
grep -q '"status":"ok"' "$HEALTH_FILE" && echo "✓ 应用健康" || { echo "✗ 应用健康字段异常"; SMOKE_FAIL=1; }
# 2) 嵌入服务
if docker compose exec -T embed node -e "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(d=>process.exit(d.ready?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  echo "✓ 嵌入服务就绪"
else
  echo "::warning::✗ 嵌入服务未就绪（检索会降级为词法）"
fi
# 3) 原文索引覆盖
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-lovecoach}" -d "${POSTGRES_DB:-lovecoach}" \
     -Atc "SELECT count(*) FROM rag_chunk" >/tmp/rag-count.txt 2>/dev/null; then
  RAG_COUNT="$(cat /tmp/rag-count.txt)"
  echo "✓ 原文索引覆盖: $RAG_COUNT 个片段"
else
  RAG_COUNT="0"; echo "::warning::✗ 无法读取原文索引（迁移是否应用？）"
fi
# 4) 登录页（密码登录是否开启是构建期变量，这里给出事实）
LOGIN_HTML="$(curl -fsS --max-time 10 "http://127.0.0.1:${APP_PORT_VAL:-8080}/login" 2>/dev/null || true)"
if echo "$LOGIN_HTML" | grep -q 'type="password"'; then
  echo "✓ 登录页包含密码登录表单"
  PASSWORD_LOGIN="开启"
else
  echo "ℹ 登录页不含密码表单（NEXT_PUBLIC_ALLOW_PASSWORD_LOGIN 未在构建期开启）"
  PASSWORD_LOGIN="关闭"
fi
# 5) 容器状态
docker compose ps --format "{{.Name}}  {{.Status}}"

{
  echo "| 镜像 | \`love-coach:sha-$SHA\` / \`love-coach:latest\` |"
  echo "| 健康检查 | ✅ 通过 |"
  echo "| 密码登录入口 | $PASSWORD_LOGIN |"
  echo "| 原文索引片段 | $RAG_COUNT |"
  echo
  echo "<details><summary>容器状态</summary>"
  echo
  echo '```'
  docker compose ps --format "{{.Name}}  {{.Status}}"
  echo '```'
  echo "</details>"
} >> "$SUMMARY"

hr "部署完成"
echo "提交: $(git log --oneline -1)"
echo "版本标签: love-coach:sha-$SHA"
cat "$SUMMARY"
[ "$SMOKE_FAIL" = "0" ] || exit 1
