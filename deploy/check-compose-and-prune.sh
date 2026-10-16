#!/usr/bin/env bash
# 核对 compose 差异并回收构建缓存
set -uo pipefail
cd /opt/apps/love-coach || exit 1

echo "== compose 里 postgres 段的 image 行 =="
grep -n -A2 -E '^  postgres:' docker-compose.yml | head -8
echo
echo "== 是否存在 override 文件 =="
ls -la docker-compose*.yml 2>/dev/null

echo
echo "== 回收构建缓存与悬空镜像 =="
docker builder prune -af >/dev/null 2>&1 && echo "build cache 已清理"
docker image prune -f >/dev/null 2>&1 && echo "悬空镜像已清理"
df -h / | tail -1
