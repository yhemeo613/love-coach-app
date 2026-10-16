#!/usr/bin/env bash
# 本地一键部署（唯一部署通道，不依赖 GitHub Actions）
#
# 快路径：本机构建应用镜像（2 核云服务器构建 Next.js 要 8-10 分钟，本机约 2-3 分钟）
#   → 服务器记录回滚点 → 传输镜像（约 1-2 分钟）→ 服务器拉码 / 数据库备份 / 迁移 /
#   重启 / 健康门禁（失败自动回滚）/ 冒烟测试 → 部署摘要
#
# 配置优先级：环境变量 > .env.deploy > 默认值
#   DEPLOY_HOST        服务器公网 IP（必填）
#   DEPLOY_USER        登录用户（默认 root）
#   DEPLOY_PORT        SSH 端口（默认 22）
#   DEPLOY_SSH_KEY     私钥路径（默认 ~/.ssh/id_ed25519）
#   APP_DIR            服务器项目目录（默认 /opt/apps/love-coach）
#   BUILD_ON_SERVER=1  改为在服务器构建（本机无 Docker 时用；每次多花约 8 分钟）
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

TOTAL_START=$(date +%s)
STEP_START=$TOTAL_START
step() {
  NOW=$(date +%s)
  echo
  echo "[$(date '+%F %T')] ──────── $1 ────────（本步 $((NOW - STEP_START))s / 累计 $((NOW - TOTAL_START))s）"
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
BUILD_ON_SERVER="${BUILD_ON_SERVER:-0}"

step "0/8 检查配置"
echo "日志文件: $LOG_FILE"
echo "本地提交: $(git rev-parse --short HEAD 2>/dev/null || echo '（非 git 仓库）') $(git log -1 --pretty=%s 2>/dev/null | cut -c1-60)"
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

step "1/8 SSH 连通性预检"
if ! ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'echo "  已连接: $(hostname) | $(date -Is)"'; then
  echo "第一次连接失败，8 秒后重试…"
  sleep 8
  ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'echo "  已连接: $(hostname)"' || { echo "✗ SSH 连接失败，请检查网络/安全组/密钥"; exit 1; }
fi

PREBUILT_FLAG=0
if [ "$BUILD_ON_SERVER" = "1" ]; then
  step "2/8 跳过本机构建（BUILD_ON_SERVER=1，改由服务器构建，约 8-10 分钟）"
else
  step "2/8 本机构建应用镜像（Next.js 生产构建）"
  if ! docker compose build app; then
    echo "✗ 本机构建失败。可改用服务器构建：BUILD_ON_SERVER=1 bash deploy/deploy.sh"
    exit 1
  fi
  echo "本机镜像: $(docker images love-coach:latest --format '{{.ID}} {{.Size}} {{.CreatedSince}}')"

  step "3/8 服务器记录回滚点"
  ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" \
    "cd $APP_DIR && if docker image inspect love-coach:latest >/dev/null 2>&1; then docker tag love-coach:latest love-coach:previous && echo '  已保存 love-coach:previous（健康检查失败时会自动回滚到这里）'; else echo '  （服务器上还没有旧镜像，跳过）'; fi"

  step "4/8 传输应用镜像"
  if ! docker save love-coach:latest | gzip -1 | \
       ssh "${SSH_OPTS[@]}" -o Compression=no "$USER_NAME@$HOST" 'gunzip | docker load'; then
    echo "✗ 镜像传输失败（可用 BUILD_ON_SERVER=1 改为服务器构建）"
    exit 1
  fi
  PREBUILT_FLAG=1
fi

step "5/8 服务器端部署（数据库备份 / 迁移 / 重启 / 健康门禁 / 冒烟）"
# 注意：脚本必须先落到服务器文件再执行。直接 `bash -s < script` 时脚本从 stdin 读取，
# 脚本内部的命令（docker compose 等）会吞掉剩余脚本内容，导致中途静默截断。
if ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" \
     "cat > /tmp/deploy-remote.sh && chmod +x /tmp/deploy-remote.sh && \
      APP_DIR='$APP_DIR' APP_IMAGE_PREBUILT='$PREBUILT_FLAG' bash /tmp/deploy-remote.sh" \
     < scripts/deploy-remote.sh; then
  DEPLOY_EXIT=0
else
  DEPLOY_EXIT=$?
fi

step "6/8 取回部署摘要"
scp -i "$KEY" -P "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes \
  "$USER_NAME@$HOST:/tmp/deploy-summary.md" "$LOG_FILE.summary.md" >/dev/null 2>&1 \
  && cat "$LOG_FILE.summary.md" || echo "（未取到摘要文件）"

step "7/8 服务器当前状态"
ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" \
  "cd $APP_DIR && docker compose ps --format '  {{.Name}}  {{.Status}}' && echo \"  镜像: \$(docker images love-coach:latest --format '{{.ID}} {{.CreatedSince}}')\"" || true

step "8/8 结果"
if [ "$DEPLOY_EXIT" -eq 0 ]; then
  echo "✅ 部署成功（$(date '+%F %T')）"
else
  echo "❌ 部署失败，退出码 $DEPLOY_EXIT"
  echo "   服务器端排错：docker compose logs --tail=100 app"
fi
echo "完整日志: $LOG_FILE"
exit "$DEPLOY_EXIT"
