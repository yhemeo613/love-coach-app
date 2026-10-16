#!/usr/bin/env bash
# 迁移收尾 + 服务器状态速查（无内嵌引号，便于从 PowerShell 调用）
set -uo pipefail
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR" || exit 1

echo "== 1/3 重建迁移镜像并应用 =="
docker compose build migrate 2>&1 | tail -3
docker compose run --rm migrate 2>&1 | tail -10

echo
echo "== 2/3 数据库清单 =="
echo "--- 迁移历史 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name"
echo "--- 表清单 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
echo "--- model_setting 是否存在 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SELECT to_regclass('public.model_setting')"

echo
echo "== 3/3 资源与向量能力 =="
echo "--- 磁盘 ---"
df -h / | tail -1
echo "--- 内存 ---"
free -m | head -2
echo "--- 是否可安装 pgvector 扩展 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SELECT name FROM pg_available_extensions WHERE name = 'vector'"
echo "--- postgres 版本 ---"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SHOW server_version"
echo "--- 应用健康 ---"
curl -fsS --max-time 8 http://127.0.0.1:8080/api/health && echo
