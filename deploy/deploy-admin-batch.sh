#!/usr/bin/env bash
# 后台增强批次部署：模型管理 / 运维分析 / 用户画像 / ECharts 图表
set -euo pipefail
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR"

echo "== 1/5 检查依赖清单（echarts 是否已随包上传）=="
grep -q '"echarts"' package.json && echo "package.json 含 echarts" || { echo "缺少 echarts 依赖声明"; exit 1; }
test -f package-lock.json && echo "lockfile 存在"

echo "== 2/5 重建镜像（npm ci 会安装 echarts）=="
docker compose build 2>&1 | tail -6

echo "== 3/5 应用数据库迁移（新增 model_setting 表）=="
docker compose run --rm migrate 2>&1 | tail -8

echo "== 4/5 重启应用 =="
docker compose up -d app
sleep 10

echo "== 5/5 健康检查 + 表清单 =="
curl -fsS --max-time 8 http://127.0.0.1:8080/api/health && echo
docker compose exec -T postgres psql -U lovecoach -d lovecoach -c '\dt' | head -20
docker compose logs --tail=5 app
echo "完成"
