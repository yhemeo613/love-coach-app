#!/usr/bin/env bash
# 环境核查：数据库镜像/扩展、磁盘占用、可回收空间
set -uo pipefail
cd /opt/apps/love-coach || exit 1

echo "== 数据库容器实际使用的镜像 =="
docker compose ps --format '{{.Service}} -> {{.Image}}'

echo
echo "== 已加载的 pgvector 版本 =="
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'"

echo
echo "== 磁盘与可回收 =="
df -h / | tail -1
docker system df

echo
echo "== 尝试创建扩展（仅测试，随后回滚）=="
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = 'vector'"
docker compose exec -T postgres psql -U lovecoach -d lovecoach -Atc "DROP EXTENSION IF EXISTS vector"

echo
echo "== 文本语料规模参考（若已上传私有语料目录）=="
du -sh /opt/apps/love-coach/private-corpus 2>/dev/null || echo "私有语料目录尚未创建"
