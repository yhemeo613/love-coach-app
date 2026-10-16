#!/usr/bin/env bash
# 部署实时看板：镜像接收/构建、语料索引进度、容器健康
# 用法（服务器上，XShell 里直接跑）：
#   bash /opt/apps/love-coach/deploy/watch.sh
# Ctrl-C 退出。只读操作，随便跑。
APP_DIR=/opt/apps/love-coach
cd "$APP_DIR" 2>/dev/null || exit 1

TOTAL_CHUNKS=${TOTAL_CHUNKS:-9198}   # 语料片段总数（scripts/rag-index.mjs 输出的分块数）
SLEEP=4
prev_docker=0
prev_rows=0
prev_ts=0

human_mb() { echo $(( $1 / 1 )); }

while true; do
  ts=$(date +%s)
  docker_mb=$(du -sm /var/lib/docker 2>/dev/null | cut -f1)
  rows=$(docker exec love-coach-pg psql -U lovecoach -d lovecoach -Atc 'SELECT count(*) FROM rag_chunk' 2>/dev/null)
  [ -z "$rows" ] && rows=0

  clear 2>/dev/null || printf '\033[2J\033[H'
  echo "======== 恋爱教练 · 部署看板   $(date '+%F %T') ========"

  # 容器
  echo
  echo "【容器状态】"
  docker compose ps --format "  {{.Name}}   {{.Status}}" 2>/dev/null | head -6

  # 镜像
  echo
  echo "【镜像】"
  docker images --format "  {{.Repository}}:{{.Tag}}   {{.Size}}   {{.CreatedSince}}" 2>/dev/null | grep love-coach | head -6

  # 构建 / 接收
  echo
  if pgrep -f "docker compose build" >/dev/null 2>&1; then
    log=$(ls -t /tmp/build*.log 2>/dev/null | head -1)
    echo "【构建】进行中  ←  $(tail -1 "$log" 2>/dev/null | cut -c1-100)"
  else
    echo "【构建】空闲"
  fi
  if [ "$prev_ts" -gt 0 ] && [ "$prev_docker" -gt 0 ]; then
    rate=$(( (docker_mb - prev_docker) * 60 / (ts - prev_ts) ))
    echo "【镜像数据】 docker 目录 ${docker_mb} MB（约 ${rate} MB/分钟；传输/构建时增长）"
  else
    echo "【镜像数据】 docker 目录 ${docker_mb} MB"
  fi

  # 语料索引
  echo
  echo "【语料索引】"
  if [ "$rows" -gt 0 ]; then
    pct=$(( rows * 100 / TOTAL_CHUNKS ))
    if [ "$prev_ts" -gt 0 ] && [ "$prev_rows" -gt 0 ] && [ "$rows" -gt "$prev_rows" ]; then
      rate=$(( (rows - prev_rows) * 60 / (ts - prev_ts) ))
      left=$(( (TOTAL_CHUNKS - rows) / (rate > 0 ? rate : 1) ))
      printf "  已索引 %s / %s 条（%s%%），约 %s 条/分钟，预计剩余 %s 分钟\n" "$rows" "$TOTAL_CHUNKS" "$pct" "$rate" "$left"
    else
      printf "  已索引 %s / %s 条（%s%%）\n" "$rows" "$TOTAL_CHUNKS" "$pct"
    fi
  else
    echo "  尚未开始（等待 embed 服务就绪后执行 docker compose run --rm rag-index）"
  fi
  [ -f /tmp/rag-index.log ] && tail -2 /tmp/rag-index.log 2>/dev/null | sed 's/^/  /'

  # 服务健康
  echo
  echo "【服务健康】"
  health=$(curl -fsS --max-time 5 "http://127.0.0.1:$(sed -n 's/^APP_PORT=//p' .env 2>/dev/null | tail -1 | tr -d '\r' | sed 's/^$/8080/')/api/health" 2>/dev/null | head -c 160)
  [ -n "$health" ] && echo "  应用: $health" || echo "  应用: 未就绪"
  embed_ready=$(docker inspect love-coach-embed --format '{{.State.Health.Status}}' 2>/dev/null)
  echo "  嵌入服务: ${embed_ready:-未运行}"

  prev_docker=$docker_mb
  prev_rows=$rows
  prev_ts=$ts
  sleep "$SLEEP"
done
