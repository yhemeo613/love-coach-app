#!/usr/bin/env bash
# 本地触发语料索引（与部署分离；断点续跑，可反复执行）
#
# 从本机通过 SSH 在服务器执行 scripts/rag-index-remote.sh：
#   环境自检 → 启动索引任务 → 每 30 秒采集进度 → 覆盖率报告
#
# 配置同 deploy/deploy.sh（.env.deploy）；可用环境变量覆盖：
#   MAX_MINUTES=90        最长跟踪分钟数（超时后任务继续后台跑）
#   RAG_INDEX_BATCH=48    每批向量化条数
#
# 日志：deploy-logs/rag-index-<时间戳>.log
# 用法：bash deploy/index.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/rag-index-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

if [ -f .env.deploy ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.deploy
  set +a
fi

HOST="${DEPLOY_HOST:-}"
USER_NAME="${DEPLOY_USER:-root}"
PORT="${DEPLOY_PORT:-22}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP_DIR="${APP_DIR:-/opt/apps/love-coach}"
MAX_MINUTES="${MAX_MINUTES:-90}"
RAG_INDEX_BATCH="${RAG_INDEX_BATCH:-48}"

[ -n "$HOST" ] || { echo "缺少 DEPLOY_HOST（见 deploy/deploy.sh 顶部说明）"; exit 1; }
[ -f "$KEY" ] || { echo "找不到私钥: $KEY"; exit 1; }

echo "[$(date '+%F %T')] 语料索引开始（最长跟踪 ${MAX_MINUTES} 分钟，批次 ${RAG_INDEX_BATCH}）"
echo "日志文件: $LOG_FILE"
echo "目标: $USER_NAME@$HOST:$PORT  目录: $APP_DIR"

SSH_OPTS=(-i "$KEY" -p "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15)
if ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" \
     "cat > /tmp/rag-index-remote.sh && APP_DIR='$APP_DIR' MAX_MINUTES='$MAX_MINUTES' RAG_INDEX_BATCH='$RAG_INDEX_BATCH' bash /tmp/rag-index-remote.sh" \
     < scripts/rag-index-remote.sh; then
  INDEX_EXIT=0
else
  INDEX_EXIT=$?
fi

echo
echo "[$(date '+%F %T')] 结束（退出码 $INDEX_EXIT）｜完整日志: $LOG_FILE"
if [ "$INDEX_EXIT" -ne 0 ]; then
  echo "提示：未写完属正常（幂等），重新执行本脚本即可续索引：bash deploy/index.sh"
fi
exit "$INDEX_EXIT"
