#!/usr/bin/env bash
# 同步「隐藏 Google 登录」修复并重启应用
set -euo pipefail
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR"
echo "== 重建（含 Google 按钮条件渲染修复）=="
docker compose build 2>&1 | tail -4
echo "== 重启应用 =="
docker compose up -d app
sleep 8
curl -fsS --max-time 8 http://127.0.0.1:8080/api/health && echo
docker compose logs --tail=3 app
echo "完成"
