#!/usr/bin/env bash
# 服务器端部署脚本（由本机通过 ssh 调用，避免引号/变量转义问题）
set -euo pipefail

APP_DIR="/opt/apps/love-coach"
cd "$APP_DIR"

echo "===== 0/6 环境自检 ====="
docker --version
docker compose version | head -1
test -f .env || { echo "缺少 .env"; exit 1; }
echo ".env 行数: $(grep -c . .env)"

echo "===== 1/6 构建镜像 ====="
docker compose build

echo "===== 2/6 启动 Postgres 与 Redis ====="
docker compose up -d postgres redis

echo "===== 3/6 等待 Postgres 就绪 ====="
READY=0
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U lovecoach >/dev/null 2>&1; then
    echo "Postgres 就绪（第 ${i} 次探测）"
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" -ne 1 ]; then
  echo "Postgres 启动超时"
  docker compose logs --tail=30 postgres
  exit 1
fi

echo "===== 4/6 应用数据库迁移 ====="
docker compose run --rm migrate

echo "===== 5/6 启动应用 ====="
docker compose up -d app
sleep 10

echo "===== 6/6 状态与健康检查 ====="
docker compose ps
echo "--- 应用日志 ---"
docker compose logs --tail=20 app
echo "--- 健康检查 ---"
curl -fsS http://127.0.0.1:8080/api/health || echo "健康检查失败"
echo
echo "--- 数据库表 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -c '\dt' | head -20
