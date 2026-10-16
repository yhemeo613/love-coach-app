#!/usr/bin/env bash
# 本地一键部署（唯一部署通道，不依赖 GitHub Actions）
#
# 从本机通过 SSH 在服务器执行 scripts/deploy-remote.sh：
#   环境自检 → 拉取代码 → pg_dump 备份 → 构建镜像（打 sha 标签）→ 应用迁移 →
#   切换版本 → 健康门禁（失败自动回滚）→ 冒烟测试 → 部署摘要
#
# 配置优先级：环境变量 > .env.deploy > 默认值
#   DEPLOY_HOST      服务器公网 IP（必填）
#   DEPLOY_USER      登录用户（默认 root）
#   DEPLOY_PORT      SSH 端口（默认 22）
#   DEPLOY_SSH_KEY   私钥路径（默认 ~/.ssh/id_ed25519）
#   APP_DIR          服务器项目目录（默认 /opt/apps/love-coach）
#
# 日志：全程写入 deploy-logs/deploy-<时间戳>.log（同时打印到终端）
# 用法：bash deploy/deploy.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
# 同时输出到终端与日志文件
exec > >(tee -a "$LOG_FILE") 2>&1

STEP_START=$(date +%s)
step() {
  NOW=$(date +%s)
  echo
  echo "[$(date '+%F %T')] ──────── $1 ────────（本步 $((NOW - STEP_START))s）"
  STEP_START=$NOW
}

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

step "0/5 检查配置"
echo "日志文件: $LOG_FILE"
echo "本地提交: $(git rev-parse --short HEAD 2>/dev/null || echo '（非 git 仓库）') $(git log -1 --pretty=%s 2>/dev/null || true)"
echo "时间: $(date '+%F %T')"
if [ -z "$HOST" ]; then
  cat <<'TIP'
缺少服务器地址。请在本项目根目录创建 .env.deploy（已被 .gitignore 忽略）：

  DEPLOY_HOST=你的公网IP
  DEPLOY_USER=root
  DEPLOY_SSH_KEY=/path/to/private/key     # 可省略，默认 ~/.ssh/id_ed25519

TIP
  exit 1
fi
[ -f "$KEY" ] || { echo "找不到私钥: $KEY（用 DEPLOY_SSH_KEY 指定）"; exit 1; }
[ -f scripts/deploy-remote.sh ] || { echo "缺少 scripts/deploy-remote.sh"; exit 1; }
echo "目标: $USER_NAME@$HOST:$PORT  目录: $APP_DIR  私钥: $KEY"

SSH_OPTS=(-i "$KEY" -p "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15)

step "1/5 SSH 连通性预检"
if ! ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'echo "  已连接: $(hostname) | $(date -Is)"'; then
  echo "第一次连接失败，8 秒后重试…"
  sleep 8
  ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'echo "  已连接: $(hostname)"' || { echo "✗ SSH 连接失败，请检查网络/安全组/密钥"; exit 1; }
fi

step "2/5 服务器端部署（明细见下方分段日志）"
if ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" "APP_DIR='$APP_DIR' bash -s" < scripts/deploy-remote.sh; then
  DEPLOY_EXIT=0
else
  DEPLOY_EXIT=$?
fi

step "3/5 取回部署摘要"
scp -i "$KEY" -P "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes \
  "$USER_NAME@$HOST:/tmp/deploy-summary.md" "$LOG_FILE.summary.md" >/dev/null 2>&1 \
  && cat "$LOG_FILE.summary.md" || echo "（未取到摘要文件）"

step "4/5 服务器当前状态"
ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" "cd $APP_DIR && docker compose ps --format '  {{.Name}}  {{.Status}}' && echo \"  镜像: \$(docker images love-coach:latest --format '{{.ID}} {{.CreatedSince}}')\"" || true

step "5/5 结果"
if [ "$DEPLOY_EXIT" -eq 0 ]; then
  echo "✅ 部署成功（$(date '+%F %T')）"
else
  echo "❌ 部署失败，退出码 $DEPLOY_EXIT"
  echo "   服务器端日志：上面的分段输出；也可登录服务器查看：docker compose logs --tail=100 app"
fi
echo "完整日志已保存: $LOG_FILE"
exit "$DEPLOY_EXIT"
