#!/usr/bin/env bash
# 服务器端语料索引脚本（由「RAG 索引」工作流通过 ssh 调用）
#
# 特性：
#  - 断点续跑：片段以内容哈希为主键，已索引的跳过；中断后重跑不重复计算
#  - 进度可观测：每 30 秒采样一次库内片段数并输出
#  - 完成即报告：输出总覆盖率与每本书的片段分布
#
# 环境变量：APP_DIR（默认 /opt/apps/love-coach）、TOTAL_CHUNKS（默认 9198）、
#           RAG_INDEX_BATCH（默认 48）、MAX_MINUTES（默认 90）
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/apps/love-coach}"
cd "$APP_DIR" || { echo "找不到 $APP_DIR"; exit 1; }

# 固定 compose 项目名，避免从其他目录误执行时创建游离容器
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-love-coach}"

TOTAL="${TOTAL_CHUNKS:-9198}"
BATCH="${RAG_INDEX_BATCH:-48}"
MAX_MINUTES="${MAX_MINUTES:-90}"
LOG=/tmp/rag-index.log
SUMMARY=/tmp/rag-index-summary.md
PSQL="docker compose exec -T postgres psql -U ${POSTGRES_USER:-lovecoach} -d ${POSTGRES_DB:-lovecoach} -Atc"

hr() { echo; echo "======== $1 ========"; }
count_chunks() { $PSQL "SELECT count(*) FROM rag_chunk" 2>/dev/null | tr -d '[:space:]'; }

hr "1/3 环境自检"
$PSQL "SELECT 1" >/dev/null 2>&1 || { echo "Postgres 未就绪"; exit 1; }
docker compose exec -T embed node -e \
  "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(d=>process.exit(d.ready?0:1)).catch(()=>process.exit(1))" \
  >/dev/null 2>&1 || { echo "嵌入服务未就绪（先启动 embed）"; exit 1; }
echo "Postgres 与嵌入服务均就绪"
BEFORE="$(count_chunks)"; BEFORE="${BEFORE:-0}"
echo "当前已索引: ${BEFORE}/${TOTAL}（$(( BEFORE * 100 / TOTAL ))%）"

hr "2/3 启动索引任务（后台，批次 ${BATCH}，日志 $LOG）"
docker ps --filter "name=rag-index" -q 2>/dev/null | xargs -r docker stop >/dev/null 2>&1
nohup env RAG_INDEX_BATCH="$BATCH" docker compose run --rm rag-index > "$LOG" 2>&1 &
echo "任务已启动，开始跟踪进度"

hr "3/3 进度跟踪（每 30 秒采样，上限 ${MAX_MINUTES} 分钟）"
DEADLINE=$(( $(date +%s) + MAX_MINUTES * 60 ))
PREV_COUNT="$BEFORE"
DONE=0
while true; do
  COUNT="$(count_chunks)"; COUNT="${COUNT:-0}"
  PCT=$(( COUNT * 100 / TOTAL ))
  DELTA=$(( COUNT - PREV_COUNT ))
  echo "[$(date +%T)] 已索引 ${COUNT}/${TOTAL}（${PCT}%），本轮新增 ${DELTA}"
  PREV_COUNT="$COUNT"
  if [ "$COUNT" -ge "$TOTAL" ]; then DONE=1; break; fi
  if ! pgrep -f "rag-index" >/dev/null 2>&1; then
    echo "索引进程已退出（日志尾部如下）"
    tail -5 "$LOG" || true
    break
  fi
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "达到时间上限 ${MAX_MINUTES} 分钟，任务仍在后台继续（重跑本工作流可续跑）"
    break
  fi
  sleep 30
done

COUNT="$(count_chunks)"; COUNT="${COUNT:-0}"
hr "覆盖率报告"
$PSQL "SELECT book || ' | ' || count(*) FROM rag_chunk GROUP BY book ORDER BY count(*) DESC LIMIT 10" || true
echo "(以上为片段数最多的 10 本书)"

{
  echo "## 原文索引报告"
  echo
  echo "| 项目 | 值 |"
  echo "|------|-----|"
  echo "| 本次新增 | $(( COUNT - BEFORE )) 个片段 |"
  echo "| 累计已索引 | ${COUNT}/${TOTAL}（$(( COUNT * 100 / TOTAL ))%）|"
  echo "| 状态 | $([ "$DONE" = "1" ] && echo '✅ 完成' || echo '⏳ 未完成（可重跑续索引）') |"
} > "$SUMMARY"
cat "$SUMMARY"

[ "$DONE" = "1" ] || exit 1
