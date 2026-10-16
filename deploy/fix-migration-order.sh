#!/usr/bin/env bash
# 修复迁移顺序问题：把 model_setting 迁移排到 init 之后并真正应用
set -euo pipefail
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR"

echo "== 1/4 重命名迁移目录（170000 -> 190000，使其排在 init 之后）=="
if [ -d prisma/migrations/20261016170000_model_setting ]; then
  mv prisma/migrations/20261016170000_model_setting prisma/migrations/20261016190000_model_setting
fi
ls prisma/migrations/

echo "== 2/4 重建迁移镜像（内含最新迁移文件）=="
docker compose build migrate 2>&1 | tail -3

echo "== 3/4 应用迁移 =="
docker compose run --rm migrate 2>&1 | tail -12

echo "== 4/4 校验：表清单与 model_setting 结构 =="
docker compose exec -T postgres psql -U lovecoach -d lovecoach -c '\dt'
docker compose exec -T postgres psql -U lovecoach -d lovecoach -c '\d model_setting'
echo "== 应用健康检查 =="
curl -fsS --max-time 8 http://127.0.0.1:8080/api/health && echo
echo "完成"
