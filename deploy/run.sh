#!/usr/bin/env bash
# 单次干净部署：清理并发构建 -> 全程写入 deploy.log -> 执行部署
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR" || exit 1

echo "== 清理残留的并发构建进程 =="
pkill -f "docker compose build" 2>/dev/null || true
pkill -f "remote-deploy.sh" 2>/dev/null || true
pkill -f "docker-buildx bake" 2>/dev/null || true
sleep 3
ps -eo pid,args | grep -E "compose build|buildx bake" | grep -v grep | cut -c1-100 || echo "已无残留构建"

echo "== 开始部署，日志写入 $APP_DIR/deploy.log =="
# 之后所有输出同时进入 deploy.log（供 tail -f 观察）
exec > >(tee -a "$APP_DIR/deploy.log") 2>&1

echo ""
echo "################ 部署开始 $(date -Is) ################"
bash "$APP_DIR/remote-deploy.sh"
echo "################ 部署结束 $(date -Is) ################"
