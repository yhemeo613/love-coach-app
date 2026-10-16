#!/usr/bin/env bash
# 京东云云主机一键部署（Ubuntu / Debian / CentOS / AlmaLinux / Rocky）
#
# 用法：
#   1) 上传项目目录到服务器，例如 /opt/love-coach
#   2) cd /opt/love-coach && cp .env.example .env && vi .env   # 填写密钥
#   3) sudo bash deploy.sh            # 默认监听 3000 端口
#      sudo bash deploy.sh 8080       # 指定对外端口
#
# 脚本做的事：装 Docker -> 构建镜像 -> 应用数据库迁移 -> 启动 Postgres/Redis/应用 -> 健康检查
set -euo pipefail

PORT="${1:-3000}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[错误] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 或 sudo 运行本脚本"

cd "$APP_DIR"

# ---------- 1. 环境自检 ----------
log "检查配置文件"
[ -f .env ] || die "缺少 .env。请先 cp .env.example .env 并填写 LLM_API_KEY、BETTER_AUTH_SECRET、POSTGRES_PASSWORD"
grep -qE '^LLM_API_KEY=sk-.+' .env || die ".env 里的 LLM_API_KEY 未填写"
grep -qE '^BETTER_AUTH_SECRET=.{16,}' .env || die ".env 里的 BETTER_AUTH_SECRET 太短，请用 openssl rand -hex 32 生成"
grep -qE '^POSTGRES_PASSWORD=.{8,}' .env || die ".env 里的 POSTGRES_PASSWORD 请设置至少 8 位密码"

# 端口写入 .env（compose 读取 APP_PORT）
if grep -q '^APP_PORT=' .env; then
  sed -i "s/^APP_PORT=.*/APP_PORT=${PORT}/" .env
else
  echo "APP_PORT=${PORT}" >> .env
fi

# ---------- 2. 安装 Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 Docker，开始安装"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg -o /tmp/docker.gpg || \
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /tmp/docker.gpg
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg < /tmp/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/${ID} ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y yum-utils
    yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    die "无法自动安装 Docker，请手动安装后重跑"
  fi
fi

systemctl enable --now docker

# 国内服务器配置镜像加速与日志轮转
if [ ! -f /etc/docker/daemon.json ]; then
  log "配置 Docker 镜像加速"
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.com",
    "https://mirror.ccs.tencentyun.com"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
  systemctl restart docker
  sleep 3
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "未找到 docker compose，请安装 docker-compose-plugin"
fi

# ---------- 3. 构建与启动 ----------
log "构建镜像（首次约 3-6 分钟）"
$COMPOSE build

log "启动数据库与缓存"
$COMPOSE up -d postgres redis

log "等待 Postgres 就绪"
for i in $(seq 1 60); do
  if $COMPOSE exec -T postgres pg_isready -U "$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)" >/dev/null 2>&1; then
    echo "Postgres 已就绪"
    break
  fi
  [ "$i" -eq 60 ] && die "Postgres 启动超时，请查看 docker compose logs postgres"
  sleep 2
done

log "应用数据库迁移"
$COMPOSE run --rm migrate

log "启动应用"
$COMPOSE up -d app

# ---------- 4. 健康检查 ----------
log "等待服务就绪"
for i in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    IP="$(curl -fsS --max-time 5 https://ipinfo.io/ip 2>/dev/null || echo '<服务器公网IP>')"
    log "部署完成"
    echo "访问地址: http://${IP}:${PORT}"
    echo "健康检查: curl http://127.0.0.1:${PORT}/api/health"
    echo "查看日志: $COMPOSE logs -f app"
    echo "查看状态: $COMPOSE ps"
    echo
    echo "提醒：请到京东云控制台安全组放行 ${PORT} 端口（以及后续域名用的 80/443）。"
    exit 0
  fi
  sleep 2
done

die "服务未就绪，请执行 $COMPOSE logs app 查看原因"
