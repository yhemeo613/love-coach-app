#!/usr/bin/env bash
# 服务器状态速查（无内嵌引号，便于从 PowerShell 调用）
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR" 2>/dev/null || exit 1

echo "=== 容器 ==="
docker compose ps

echo
echo "=== 全部容器（含已退出）==="
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | head -12

echo
echo "=== 镜像 ==="
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' | head -8

echo
echo "=== 构建进程 ==="
ps -eo pid,etimes,comm,args --sort=-etimes | grep -E 'next|npm|node|buildkit|docker' | grep -v grep | cut -c1-140 | head -8

echo
echo "=== 磁盘 ==="
df -h / | tail -1

echo
echo "=== 内存 ==="
free -m | head -2

echo
echo "=== 部署日志（若存在，末尾 20 行）==="
if [ -f "$APP_DIR/deploy.log" ]; then tail -20 "$APP_DIR/deploy.log"; else echo "尚无 deploy.log"; fi

echo
echo "=== 健康检查 ==="
curl -fsS --max-time 5 http://127.0.0.1:8080/api/health || echo "应用尚未就绪"

echo
echo "=== Postgres 表 ==="
docker compose exec -T postgres psql -U lovecoach -d lovecoach -c '\dt' 2>/dev/null | head -18 || echo "数据库尚未就绪"
