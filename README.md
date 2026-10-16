# 恋爱教练 · Love Coach

以「场景」为单位的 AI 恋爱教练对话应用。基于本地 `love-skills` 语料的蒸馏产物（S0–S10 场景导航 + 底线筛选原则）构建，每个回答都要求可落地、可撤回、可拒绝。

- 技术栈：Next.js 15 · React 19 · TypeScript · Tailwind CSS v4 · AI SDK 7 · DeepSeek · Better Auth · Prisma 7 · PostgreSQL · Redis · lucide-react · motion
- 界面语言：简体中文；**全站不使用 emoji 表情符号**，图标一律使用 lucide 图标或内联 SVG
- 视觉：暖中性灰（stone）+ 低饱和玫瑰主色，深浅色双主题；token 体系遵循 shadcn/ui 的 CSS 变量约定

---

## 一、功能

### 1. 场景化对话（11 个场景）
| 代号 | 场景 | 解决的问题 |
|------|------|-----------|
| S0 | 从零开始 | 接近焦虑、自我评价、第一步练习 |
| S1 | 自我建设 | 外形、状态、生活状态 |
| S2 | 认识与开场 | 直接/间接开场判据、场合脚本、撤出规则 |
| S3 | 聊天与话题 | 上堆/下切、潜沟通、投资度读数 |
| S4 | 邀约 | 概括拒绝 vs 具体拒绝、降低决策成本 |
| S5 | 约会当天 | 环节安排、转场、主动收尾 |
| S6 | 判断与推进 | 好感信号、诚实意图声明、反突然表白 |
| S7 | 关系维持 | 价值匹配、共同轨迹、连接指标（明确标注文献薄弱） |
| S8 | 框架与边界 | 三要素模型、把裁定权收回来 |
| S9 | 冲突与冷淡 | 情绪事件 vs 结构问题、需求越界回查 |
| S10 | 系统学习路径 | 六步路径、单一系统原则 |
| 守护 | 被操控 / 被拉扯 | 支持模式、自我保护动作、求助资源 |

每个场景的提示词都内建三条底线（**知情 / 可撤回 / 可拒绝**）与透明性自检；对操控类请求明确拒绝并给合规替代方案。

### 2. 大模型能力（DeepSeek 全量接入）
- **思考模式**：`thinking.type` + `reasoning_effort`（low / high / max），推理过程以可折叠「思考过程」区块展示
- **模型切换**：从上游 `/models` 动态读取（`deepseek-flash` / `deepseek-v4-pro`），失败时回落内置清单
- **工具调用**：5 个真实工具（多步执行，最多 4 步）
  - `search_knowledge` 检索场景方法要点（本地知识库检索）
  - `save_action_plan` 生成行动清单（写入 `action_plan` 表，个人中心可查）
  - `set_followup_reminder` 设置跟进提醒（写入 `reminder` 表）
  - `get_user_context` 读取历史对话、未完成清单、待办提醒
  - `escalate_to_support` 切换守护模式并给出求助资源
- **结构化输出**：`response_format=json_object`，「聊天记录分析」输出可校验的诊断报告（zod 校验）
- **FIM 补全（Beta）**：话术接龙，走 `LLM_FIM_BASE`（/beta 前缀）
- **生成参数**：temperature、top_p、max_tokens（上限 384K，上下文 1M）、stop 序列、logprobs
- **用量统计**：tokens、上下文缓存命中（`prompt_cache_hit_tokens`）、推理 tokens、工具调用次数，全部落库
- **缓存隔离**：按用户传 `user_id`，用于 KVCache 隔离与内容安全
- 已显式移除上游废弃参数（`frequency_penalty` / `presence_penalty`）

### 3. 账号体系（Better Auth）
- GitHub / Google OAuth 一键登录
- 邮箱密码登录（默认关闭，`ALLOW_PASSWORD_LOGIN=1` 开启，仅用于内部账号与联调）
- 角色与封禁：`role`（admin / user）、`banned`、`banReason`、`banExpires`
- 会话走 Redis 二级存储 + cookie 缓存，减少数据库压力

### 4. 后台管理（/admin，仅 admin 可见）
- **总览**：用户数、近 7 天新增、今日活跃、会话/消息总数、今日请求、手写 SVG 趋势图、场景分布、最近 10 条审计
- **用户**：搜索、分页、设为/取消管理员、封禁（含原因与期限）、解封、重置当日配额
- **会话**：按标题搜索、分页、查看某会话完整消息（只读）
- **系统**：Postgres / Redis / 大模型连通性与耗时、模型列表、账户余额、密钥脱敏展示、限流与配额配置
- 所有管理写操作都会写 `audit_log`（操作者、动作、对象、中文详情、来源 IP）并使看板缓存失效
- 护栏：不能封禁自己、不能取消自己的管理员权限、封禁期限上限 10 年

### 5. 其他页面
- `/chat` 对话主界面（历史会话服务端持久化，左侧可切换）
- `/tools` 分析工具（聊天记录结构化诊断、话术接龙）
- `/account` 我的账号与用量（近 7 天 token 明细、缓存命中率、行动清单、待办提醒）

### 6. 原文检索（RAG）
教练回答具体方法、术语、话术时，通过 `search_books` 工具检索 **56 本原著全文**（约 590 万字，9200 个片段），
返回带出处的原文片段，回答里标注「《书名》· 章节」，不再凭记忆复述。

检索链路（目标是轻量模型下的最高正确率）：

| 环节 | 做法 | 为什么 |
|------|------|--------|
| 向量召回 | bge-small-zh-v1.5（ONNX int8，24MB，本地 CPU 推理）→ pgvector 精确 KNN top 24 | 语义召回；精确 KNN 无近似索引的召回损失，9 千级片段下毫秒级 |
| 词法召回 | 字级 2/3-gram + BM25 饱和，全量扫描 top 24 | 兜住术语与专名（「上堆」「三三法则」「已读不回」），补向量的短板 |
| 融合 | RRF（名次融合，k=60） | 两路分值不可比，名次融合最稳 |
| 去重 | 3-gram Jaccard 近似去重 | 语料含重复译本，避免同一内容挤占上下文 |
| 重排 | 默认模型（deepseek-flash）对候选二次挑选 | 用 LLM 的判断力换精度，不额外部署模型 |
| 降级 | embed 服务不可用 → 纯词法；重排失败 → 融合排序 | 任一环节失效都有兜底，检索不会中断 |

分块质量上做了两件事：段落感知重组（语料来自不同提取器，有长行也有硬换行）+ 目录整体剔除
（目录行关键词密度极高，会污染排序；按「短行 + 后文再现 + 点线导引」三重特征识别）。

验证工具：`npm run rag:search -- "已读不回 要不要继续发"`（打印双路名次与融合结果，便于人工核对召回质量）。

### 7. 对话记忆（窗口 + 滚动摘要 + 跨会话事实）
三层记忆，解决「聊到第 30 轮就忘了开头」和「换个会话就失忆」：

| 层 | 机制 | 说明 |
|----|------|------|
| 短期 | 最近 `CHAT_HISTORY_LIMIT`（默认 16）条逐字保留 | 最准，覆盖绝大多数对话 |
| 会话内压缩 | 超出窗口的消息滚动压缩成**会话摘要**（`conversation.summary`） | 增量更新：只在新积压 ≥ `MEMORY_SUMMARY_CHUNK`（默认 8）条时重压缩一次；摘要注入系统提示词 |
| 跨会话 | 稳定事实抽取为**键值记忆**（`user_memory`） | 每轮回复完成后异步抽取（年龄职业/关系阶段/目标对象/已给建议/禁忌…），同 key 覆盖、过时删除（ADD/UPDATE/DELETE 决策，参考 Mem0 的做法） |

- 维护都发生在回复**完成之后**（`onFinish` 异步执行），不增加用户等待；任何一步失败只记日志，不影响对话。
- 模型也可主动调用 `remember_about_user` 记住用户明确要求记住的内容；`get_user_context` 会返回全部长期记忆。
- 开关：`MEMORY_SUMMARY=0` / `MEMORY_EXTRACT=0` 可分别关闭；摘要压缩对上下文长度的效果类似「服务端 compaction」。

---

## 二、技术栈与关键决策

| 领域 | 选型 | 说明 |
|------|------|------|
| 框架 | Next.js 15.5（App Router） | `output: "standalone"`，便于容器化 |
| 模型接入 | AI SDK 7 + `@ai-sdk/openai-compatible` | DeepSeek 的 `thinking` / `user_id` 等非标准字段通过官方 `transformRequestBody` 钩子注入；`reasoning_content` 由 provider 原生映射为 `reasoning` 流事件 |
| 流式协议 | AI SDK UI Message Stream | `streamText` + `toUIMessageStream({ sendReasoning: true })` + `createUIMessageStreamResponse` |
| 鉴权 | Better Auth 1.7 | 官方 Prisma 适配器 + admin 插件 + Redis 二级存储 |
| ORM | Prisma 7.10 | 新的 `prisma-client` 生成器（必须指定 output）、driver adapter（`@prisma/adapter-pg`）、连接串写在 `prisma.config.ts` |
| 数据库 | PostgreSQL 17 | 用户、会话、消息、用量、行动清单、提醒、审计 |
| 检索 | pgvector + bge-small-zh-v1.5 | 原文 RAG：向量召回（本地 ONNX int8 推理）+ 词法召回 + LLM 重排，详见「一、功能 6」 |
| 缓存 | Redis 7 | Better Auth 二级存储、限流计数、日配额、看板缓存、在线标记 |
| 样式 | Tailwind CSS v4 | CSS-first 配置（`@theme` / `@utility`），无 `tailwind.config.ts` |
| 图标 | lucide-react 1.58 | 品牌图标（GitHub/Google）内联 SVG，因 lucide 1.x 已移除品牌图标 |
| 动画 | motion 14 | 消息入场动画 |

---

## 三、本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动 Postgres（pgvector 镜像）与 Redis（避开常见端口冲突）
docker run -d --name lc-pg -e POSTGRES_USER=lovecoach -e POSTGRES_PASSWORD=lovecoach \
  -e POSTGRES_DB=lovecoach -p 55432:5432 pgvector/pgvector:pg17
docker run -d --name lc-redis -p 56379:6379 redis:7-alpine
# 注意：RAG 依赖 vector 扩展，必须用 pgvector/pgvector:pg17；
# 已有的 postgres:17-alpine 容器需要重建（扩展无法后装到 alpine 镜像里）。

# 3. 配置环境变量
cp .env.example .env    # 至少填 LLM_API_KEY、BETTER_AUTH_SECRET、DATABASE_URL、REDIS_URL
# 本地联调建议：ALLOW_PASSWORD_LOGIN=1、ADMIN_EMAILS=你的邮箱

# 4. 建表并生成客户端
npm run db:deploy       # 应用迁移（首次即建全部表，含 rag_chunk）
npm run db:generate     # 生成 Prisma Client

# 5. 启动嵌入服务（本地 ONNX 推理，compose 映射到 127.0.0.1:8484）
docker compose up -d embed

# 6. 索引原文语料（首次约 3-8 分钟，之后语料不变则秒级跳过）
npm run rag:index

# 7. 启动
npm run dev             # http://127.0.0.1:3000
```

### 关于 Prisma 速度（重要）
`prisma` 命令慢**不是数据库慢**，而是两处网络等待：
1. `npx prisma ...` 会先查 npm registry 解析包名；
2. Prisma CLI 启动时会向 `checkpoint.prisma.io` 上报版本信息，国内直连通常超时。

本项目已处理：
- `prisma.config.ts` 开头设置 `process.env.CHECKPOINT_DISABLE ||= "1"`；
- 所有脚本走**本地二进制**（`npm run db:*`），不要用 `npx prisma`；
- Prisma 7 的引擎是 WASM 且随包内置，无需下载二进制。

实测：`npm run db:generate` ≈ 3 秒，`npm run db:deploy` ≈ 3 秒。

### 数据库结构变更
```bash
# 修改 prisma/schema.prisma 后，从当前库 diff 出增量迁移（避免 migrate dev 的影子库与交互等待）
npm run db:deploy
```
> 注意：生成迁移 SQL 时不要用 PowerShell 的 `Out-File` 写文件（会写 BOM，Postgres 会报 `syntax error at or near "\ufeff"`）。本项目迁移文件均为无 BOM UTF-8。

---

## 四、OAuth 配置

| 提供方 | 申请地址 | 回调地址 | 备注 |
|--------|---------|---------|------|
| GitHub | https://github.com/settings/developers | `{BETTER_AUTH_URL}/api/auth/callback/github` | 允许 http（含 IP 直连） |
| Google | https://console.cloud.google.com/apis/credentials | `{BETTER_AUTH_URL}/api/auth/callback/google` | **必须 HTTPS**，仅 localhost 例外 |

因此：若只想用 IP + 端口访问，**GitHub 登录可用，Google 登录不可用**；要启用 Google，需要域名 + HTTPS（可用 Let's Encrypt 免费证书）。

`BETTER_AUTH_URL` 必须与浏览器实际访问地址完全一致，否则登录会回调失败。

---

## 五、部署到京东云

### 方式 A：一键脚本（推荐）
```bash
# 1. 上传项目（本机执行）
scp -r love-coach-app root@<公网IP>:/opt/love-coach

# 2. 服务器上执行
cd /opt/love-coach
cp .env.example .env && vi .env      # 填 LLM_API_KEY / BETTER_AUTH_SECRET / POSTGRES_PASSWORD / ADMIN_EMAILS / OAuth
sudo bash deploy.sh 3000             # 端口可自定义，如 8080
```
脚本会：安装 Docker → 构建镜像 → 启动 Postgres 与 Redis → 应用迁移 → 启动应用 → 健康检查。

### 方式 B：手动
```bash
docker compose build
docker compose up -d postgres redis
docker compose run --rm migrate      # 一次性迁移
docker compose up -d app
docker compose ps
curl http://127.0.0.1:3000/api/health
```

### 访问前的两件事
1. **京东云控制台安全组**放行对应端口（IP 直连方式放行 `3000`；用域名则放行 `80/443`）。
2. 首次登录后确认 `ADMIN_EMAILS` 命中你的邮箱，即可访问 `/admin`。

### 域名 + HTTPS（可选，启用 Google 登录需要）
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE 流式必须关闭缓冲，否则回复会「攒着一次性吐出来」
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

---

## 六、CI/CD（GitHub Actions）

三条流水线，职责单一、互相解耦（服务器端逻辑在 `scripts/*-remote.sh`，可评审、可本地复用）：

| 工作流 | 触发 | 内容 |
|--------|------|------|
| `ci.yml` | push / PR | ① 类型检查 + 生产构建；② **Prisma 迁移一致性**（在 pgvector 影子库上跑 `migrate diff`，schema 与迁移漂移即失败）；③ 两个 Dockerfile 构建验证；④ **密钥扫描**（gitleaks 全历史）+ **语料分块自检**（`scripts/rag-selftest.mjs`，防目录混入/碎片化等静默劣化） |
| `deploy.yml` | push 到 `main` / 手动 | 服务器端 `scripts/deploy-remote.sh`：环境自检 → 拉码（失败自动重试）→ **pg_dump 备份**（保留最近 10 份）→ 构建并打 `love-coach:sha-<commit>` 版本标签 → 应用迁移 → 切换 → **健康门禁：不健康自动回滚到上一版本** → 冒烟测试（健康/嵌入服务/索引覆盖/登录页）→ 输出部署摘要（Actions 摘要面板可见） |
| `rag-index.yml` | 手动 / `data/corpus`、`lib/rag` 变更 | 语料索引专职流水线（与部署解耦，避免首轮索引阻塞上线）：**断点续跑**（片段以内容哈希为主键）、每 30 秒采集进度、完成输出覆盖率报告。2 核服务器首轮约 20–60 分钟，中断后重跑即续 |

### 部署通道（两条，执行的是同一套服务器端脚本）

| 通道 | 用法 | 适用 |
|------|------|------|
| **本机 SSH（推荐）** | 本机执行 `bash deploy/deploy.sh` | 国内服务器对 GitHub 云 runner 的 SSH 偶发抖动，本机链路更稳；输出与 CD 完全一致（备份/回滚/冒烟/摘要） |
| GitHub Actions CD | push 到 `main` 自动执行，或手动 `gh workflow run CD` | 团队协作、无人值守场景 |

本机通道的配置放在 `.env.deploy`（已被 `.gitignore` 忽略）：

```bash
DEPLOY_HOST=<服务器公网IP>
DEPLOY_USER=root
DEPLOY_SSH_KEY=<私钥路径>          # 默认 ~/.ssh/id_ed25519
APP_DIR=/opt/apps/love-coach
```

常用命令：

```bash
bash deploy/deploy.sh              # 本机一键部署（推荐）
gh workflow run CD                 # 从 Actions 触发部署
gh workflow run "RAG 索引"          # 从 Actions 触发语料索引
bash deploy/watch.sh               # 服务器上实时看板（镜像/索引/健康）
```

### 一次性配置

**0. embed 镜像**（内含推理运行时，约 380MB npm 依赖，服务器首次构建较慢）：

```bash
# 推荐：本机构建后传输（本机到服务器通常比服务器直连快）
docker compose build embed
docker save love-coach-embed:latest | gzip | ssh <server> 'gunzip | docker load'
# 或在服务器直接构建（首次约 30-60 分钟，之后 Docker 层缓存生效）
```

CD 会在 embed 镜像缺失时直接报错并给出上述提示，不会静默跳过。

**1. 服务器目录转为 git 仓库**（原为 scp 上传目录，CD 依赖 `git pull`）：

```bash
cd /opt/apps/love-coach
git init
git remote add origin https://github.com/<你的账号>/love-coach-app.git
git fetch origin
git checkout -f -B main origin/main   # .env、deploy.log 不受影响（已在 .gitignore 中）
```

**2. 服务器配置免密拉取**（私有仓库需要凭据，二选一）：

- **Deploy Key（推荐）**：服务器上 `ssh-keygen -t ed25519 -f ~/.ssh/gh-deploy -N ""`，把 `.pub` 内容加到仓库 Settings → Deploy keys（只读即可），再改远端为 SSH 形式：
  ```bash
  git remote set-url origin git@github.com:<你的账号>/love-coach-app.git
  ```
- **PAT**：`git remote set-url origin https://<PAT>@github.com/<你的账号>/love-coach-app.git`

**3. 仓库 Secrets / Variables**（Settings → Secrets and variables → Actions）：

| 名称 | 类型 | 说明 |
|------|------|------|
| `SSH_HOST` | Secret | 服务器公网 IP |
| `SSH_USER` | Secret | 登录用户，如 `root` |
| `SSH_KEY` | Secret | 部署私钥全文（含 `BEGIN/END` 行） |
| `SSH_PORT` | Secret | 可选，默认 22 |
| `DEPLOY_ENABLED` | Variable | 设为 `true` 才启用自动部署；默认关闭，避免一推到 main 就上线 |
| `APP_DIR` | Variable | 可选，默认 `/opt/apps/love-coach` |

配置齐全后，push 到 `main` 即自动上线；服务器本地手动部署仍可用 `bash deploy/run.sh`。

---

## 七、环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_API_BASE` | 是 | OpenAI 兼容接入点，默认 `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | 是 | 模型密钥 |
| `LLM_MODEL` | 是 | 可用值：`deepseek-flash` / `deepseek-v4-pro` |
| `LLM_FIM_BASE` | 否 | FIM 补全基址，默认 `https://api.deepseek.com/beta` |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` / `CHAT_HISTORY_LIMIT` | 否 | 生成与上下文默认值 |
| `BETTER_AUTH_SECRET` | 是 | 会话签名密钥（`openssl rand -hex 32`） |
| `BETTER_AUTH_URL` | 是 | 对外访问地址，必须与浏览器一致 |
| `DATABASE_URL` | 是 | compose 会自动指向 `postgres` 服务名 |
| `REDIS_URL` | 是 | compose 会自动指向 `redis:6379` |
| `POSTGRES_USER/PASSWORD/DB` | 是 | compose 数据库初始化参数 |
| `ADMIN_EMAILS` | 否 | 管理员邮箱白名单，逗号分隔；命中即 admin |
| `ALLOW_PASSWORD_LOGIN` | 否 | 邮箱密码登录开关，生产务必为 `0` |
| `GITHUB_CLIENT_ID/SECRET` | 否 | GitHub 登录 |
| `GOOGLE_CLIENT_ID/SECRET` | 否 | Google 登录 |
| `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` | 否 | 单用户限流与日配额 |
| `EMBED_URL` | 是 | 嵌入服务地址；compose 内固定 `http://embed:8080`，本地开发用 `http://127.0.0.1:8484` |
| `RAG_RERANK` | 否 | 是否启用 LLM 重排，默认 `1`（关掉可省一次模型调用） |
| `APP_PORT` | 否 | compose 对外端口 |

---

## 八、运维

```bash
docker compose ps                      # 状态
docker compose logs -f app             # 应用日志
docker compose logs -f postgres        # 数据库日志
curl http://127.0.0.1:3000/api/health  # 健康检查（含模型配置状态）
docker compose restart app             # 重启应用
docker compose run --rm migrate        # 有新迁移时执行
```

- **数据备份**：`docker compose exec -T postgres pg_dump -U lovecoach lovecoach | gzip > backup-$(date +%F).sql.gz`
- **限流机制**：Redis 分钟窗口 + 自然日配额；配额按 UTC 自然日切分，后台可对单个用户重置
- **缓存**：后台看板与模型列表走 Redis 缓存（30s / 600s），`invalidate("admin:")` 在写操作后自动失效
- **降级**：Redis 不可用时后台看板回源直查、限流失效但不阻断；大模型不可用时接口返回明确错误而非静默失败

---

## 九、安全、隐私与产品边界

- **三条底线**写入每一个场景的系统提示词：知情（不依赖信息不对称）、可撤回（对方可无代价退出）、可拒绝（不把「没有明确拒绝」当同意）。
- **明确拒绝**生成的建议类型：情感操控（制造嫉妒、忽冷忽热、打压贬低）、绕过意愿（酒精、催眠话术、把拒绝重译为兴趣）、身份欺骗、按性开放度或创伤分型提速、针对未成年人的约会建议。
- **守护模式**：用户描述被操控、被持续贬低时切换到支持模式，给自我保护动作，并提示心理援助热线 **12356**。
- **隐私**：对话内容按账号隔离并持久化；管理员可在后台查看用于运营与安全审计（登录页已向用户明示）；用户可删除单条会话。
- **审计**：所有管理写操作记录操作者、动作、对象、详情与来源 IP。
- 本服务不提供医疗、法律或心理诊断结论。

---

## 十、已知限制

1. **Google 登录需要 HTTPS**：IP + 端口方式下仅 GitHub 可用。
2. **FIM 补全为 Beta**：上游未开放时接口返回明确提示（404），不影响其他功能。
3. **思考模式与 token 预算**：推理与正文共享 `max_tokens`，预算过小会「只有思考没有正文」。应用已自动给思考模式设 8K 下限，并在前端提示。
4. **审计日志仅展示最近 10 条**：完整记录在 `audit_log` 表。
5. **`deepseek-chat` 等旧模型名已下线**：必须使用 `deepseek-flash` / `deepseek-v4-pro`。
6. 语料中对「长期关系维持」的支撑较弱，S7 场景会在回答中主动说明这一点。
