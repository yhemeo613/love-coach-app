#!/usr/bin/env bash
# 配置 GitHub OAuth 凭据，重建并重启应用
# 凭据不在脚本里硬编码，运行前通过环境变量传入：
#   GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=xxx bash deploy/enable-github.sh
set -euo pipefail
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR"

: "${GITHUB_CLIENT_ID:?请通过环境变量提供 GITHUB_CLIENT_ID}"
: "${GITHUB_CLIENT_SECRET:?请通过环境变量提供 GITHUB_CLIENT_SECRET}"

echo "== 1/4 写入 GitHub OAuth 凭据 =="
sed -i "s|^GITHUB_CLIENT_ID=.*|GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}|" .env
sed -i "s|^GITHUB_CLIENT_SECRET=.*|GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}|" .env
grep -cq "^GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}$" .env && echo "Client ID 已写入"
grep -cq "^GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}$" .env && echo "Client Secret 已写入"

echo "== 2/4 重建镜像 =="
docker compose build 2>&1 | tail -5

echo "== 3/4 重启应用（数据库不动）=="
docker compose up -d app

echo "== 4/4 健康检查 =="
sleep 8
curl -fsS --max-time 8 http://127.0.0.1:8080/api/health && echo
docker compose logs --tail=5 app
echo "完成"
