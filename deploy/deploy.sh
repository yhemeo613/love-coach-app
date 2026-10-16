#!/usr/bin/env bash
# 本地一键部署（推荐通道）
#
# 从本机通过 SSH 在服务器执行 scripts/deploy-remote.sh —— 与 GitHub Actions 的 CD
# 走完全相同的服务器端脚本（环境自检 / 数据库备份 / 构建打标签 / 迁移 / 健康门禁
# 失败自动回滚 / 冒烟测试 / 部署摘要），只是发起端换成本机：
# 国内服务器对 GitHub 云 runner 的 SSH 偶发抖动，本机链路更稳定。
#
# 配置优先级：环境变量 > .env.deploy > 默认值
#   DEPLOY_HOST      服务器公网 IP（必填）
#   DEPLOY_USER      登录用户（默认 root）
#   DEPLOY_PORT      SSH 端口（默认 22）
#   DEPLOY_SSH_KEY   私钥路径（默认 ~/.ssh/id_ed25519）
#   APP_DIR          服务器项目目录（默认 /opt/apps/love-coach）
#
# 用法：bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

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

if [ -z "$HOST" ]; then
  cat <<'TIP'
缺少服务器地址。请在本项目根目录创建 .env.deploy（已被 .gitignore 忽略）：

  DEPLOY_HOST=你的公网IP
  DEPLOY_USER=root
  DEPLOY_SSH_KEY=/path/to/private/key     # 可省略，默认 ~/.ssh/id_ed25519

TIP
  exit 1
fi

if [ ! -f "$KEY" ]; then
  echo "找不到私钥: $KEY（用 DEPLOY_SSH_KEY 指定）"
  exit 1
fi

echo "== 部署目标 =="
echo "  主机: $USER_NAME@$HOST:$PORT"
echo "  目录: $APP_DIR"
echo "  私钥: $KEY"
echo

SSH_OPTS=(-i "$KEY" -p "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15)

# 连通性预检（本机链路通常一次成功，仍给两次机会）
if ! ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'true' 2>/dev/null; then
  echo "第一次连接失败，5 秒后重试…"
  sleep 5
  ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'true' || { echo "SSH 连接失败"; exit 1; }
fi

ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" "APP_DIR='$APP_DIR' bash -s" < scripts/deploy-remote.sh

# 取回部署摘要（与 Actions 的摘要面板同源）
if scp -i "$KEY" -P "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes \
     "$USER_NAME@$HOST:/tmp/deploy-summary.md" /tmp/deploy-summary.md >/dev/null 2>&1; then
  echo
  echo "================ 部署摘要 ================"
  cat /tmp/deploy-summary.md
fi
