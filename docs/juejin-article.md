# 2 核 4G 服务器上跑 RAG + 长期记忆：一个人把 AI 恋爱教练推上线，顺便踩了 8 个坑

> 一个私有部署的「恋爱教练」：56 本书原文检索、跨会话记忆、4 分钟上线。
> 本文只讲工程——尤其是**小服务器、弱网络、预算有限**时怎么做对取舍。

## 先看它是什么

输入「她已读不回，我还要继续发消息吗」，它会这样回答（节选）：

> **给机制**：判断她状态的可靠指标不是她说了什么，而是回复的长度和有没有情绪。《魔鬼约会学》讲得很直接：带语气词、把话题往下切，说明在聊天状态；只有上堆、寥寥几个字，就是不在状态，这时「尽早结束聊天是一个好的策略」。
>
> **给做法**：不发第二遍，不追问「为什么不回」。《野兽绅士》里明确提过：重复发同一条消息，女人是看得出来的，只会让人反感。

注意 `《魔鬼约会学》`、`《野兽绅士》` —— 这些**不是模型编的书名**，是从 56 本原著语料里检索出来的片段，出处随回答一起返回。

同时它记得你：「26 岁、杭州程序员、母胎单身、图书馆认识的女生、已加微信两周、她说忙但没给替代时间」——换一个新会话，这些背景依然在。

技术栈一句话：**Next.js 15 + DeepSeek + Postgres(pgvector) + Redis + 本地 ONNX 推理**，全部跑在一台 2 核 4G 的轻量云主机上。

---

## 一、RAG：没有 embedding API，那就自己造一个轻量的

### 1. 先确认约束

DeepSeek 官方**没有 embeddings 接口**（我 curl 实测 `/v1/embeddings` 返回 404）。所以要么接第三方 embedding API（多一个 key、多一份延迟和费用），要么本地推理。

选本地，理由很直接：语料是**静态**的（56 本书不会变），向量只在索引时算一次；运行时每次只 embed 一个 query —— 2 核 CPU 完全扛得住。

选型：**bge-small-zh-v1.5（ONNX int8，24MB，512 维）**。

| 指标 | 实测值 |
|------|--------|
| 模型体积 | 24MB（int8），随镜像分发，不联网 |
| 单条 query 向量化 | 79ms |
| 全量索引 9198 片段 | 11 分钟（2 核）|

模型文件直接进 git（私有仓库），构建完全离线——国内服务器拉 HuggingFace 是另一个坑，`hf-mirror.com` 可用但别指望稳定。

### 2. 分块：比模型更重要的是「别把目录喂进去」

56 本书来自不同提取器：有的每段一行（几百字长行），有的是硬换行（每行 40~60 字）。所以不能按行切——**先按句末标点把行合并回段落**，再按 ~700 字切块（带 260 字重叠）。

真正让我返工的是**目录**：

```
目录
第一章　两性的秘密
魔鬼眼中的两性关系
"性"吸引是原动力
...
```

这些短行的关键词密度极高。如果混进检索库，「邀约」「信号」这类词会被目录行抢走大量得分，而目录行本身没有任何内容。我用了三重特征识别并整体剔除：

1. 短行（≤30 字）+ 无句末标点 + **该行文本在后文再次出现**（目录是正文标题的复述）
2. 连续 ≥4 行满足上述特征
3. 点线导引（`引言...... 1`）单独判定——这类行必属目录

效果：9198 个片段里目录残留 2%，且几乎都是单行混入。剩下那 2% 由后面的 LLM 重排兜住。

### 3. 检索链路：双路召回 + RRF + LLM 重排

```
query
 ├─ 向量召回：pgvector 精确 KNN（cosine）→ top 24
 └─ 词法召回：字级 2/3-gram + BM25 饱和 → top 24
        ↓
     RRF 名次融合（k=60）
        ↓
   3-gram Jaccard 去重（语料里有重复译本）
        ↓
   LLM 重排：把 top12 喂给模型，返回最相关的 5 条的编号
        ↓
   带出处片段 → 注入回答
```

几个刻意的选择：

**为什么不建 HNSW 索引？** 9198 条 512 维向量，精确 KNN 单次 70ms——比近似索引还快，而且**召回率 100%**（HNSW 大约 95~99%）。量级不到 10 万条，别急着上索引。

**为什么要词法召回？** 中文没有天然分词，但字级 n-gram 对**术语和专名**特别好用：「上堆」「下切」「三三法则」这种词，向量有时会漂，2-gram 命中是硬的。两路互补，且**用 RRF 按名次融合而不是按分**——两路分值不可比，校准是白费功夫。

**为什么用 LLM 重排？** 重排是精度杠杆最大的一环，而独立 reranker 模型（bge-reranker 系列）要么超 100MB 不利于分发、要么在 2 核上慢到不可用。既然主模型本来就是廉价的 flash 级模型，一次「从 12 条里挑 5 条」的调用（约 3k prompt tokens）比部署一个模型划算得多。

实测单次检索：**embed 79ms + 向量 70ms + 词法 93ms ≈ 240ms**（重排另算约 1~2s）。

### 4. 引用纪律：把「不许编」写进工具返回值

RAG 最常见的翻车是模型编书名。我在工具返回里直接带上约束：

```ts
return {
  matched: hits.length,
  results: hits.map(h => ({ book: h.book, section: h.heading, excerpt: h.text })),
  hint: "引用出处用「《书名》· 章节」的形式，不要补充页码；观点用你自己的话概括，"
      + "最多一两句直引。检索无命中就明确告诉用户「语料里没有直接依据」。"
};
```

系统提示词里再加一条硬约束：**引用只能来自检索结果**。实测回答里出现的每个书名都能在检索结果里找到。

---

## 二、记忆：三层结构，写入全部异步

「聊到第 30 轮忘了开头」和「换个会话就失忆」是两个不同的问题，用两层不同机制解决：

| 层 | 机制 | 成本 |
|----|------|------|
| 短期 | 最近 16 条逐字保留 | 0 |
| 会话内压缩 | 超窗历史滚动摘要（增量更新，攒够 8 条才重压一次） | 每 8 条一次模型调用 |
| 跨会话 | 稳定事实抽成键值记忆（`user_memory`，同 key 覆盖、过时删除） | 每轮一次小调用 |

关键设计是**时序**：所有记忆维护都在回复**完成之后**异步执行（Next.js AI SDK 的 `onFinish` 里 fire-and-forget），用户完全感知不到：

```ts
onFinish: async ({ text }) => {
  // ... 正常落库、记用量
  if (conversationId) {
    void refreshConversationSummary(conversationId, user.id).catch(logError);
    void extractUserMemories({ userId, conversationId, userText, assistantText: text }).catch(logError);
  }
}
```

事实抽取的 prompt 要求模型返回 **ADD/UPDATE/DELETE 决策**（参考 Mem0 的思路）：

```json
{ "upsert": [{ "key": "关系阶段", "value": "微信聊了两周，用户主动开话题，她回复越来越短" }],
  "forget": ["过时或错误的 key"] }
```

实测一轮对话后写入的记忆：

```
年龄职业 | 26岁，在杭州做程序员，母胎单身
目标对象 | 图书馆认识的女生，已加微信
关系阶段 | 微信聊了两周，用户主动开话题，她回复越来越短，尚未见面
当前目标 | 想追她
情绪风险 | 很怕被拒绝
```

另外做了个透明性设计：`/account` 页把「教练记住的事」全部列出来，**用户可单条删除或一键清空**。记忆系统如果不可见，用户迟早会因为「它怎么知道这个」而反感。

---

## 三、部署工程：2 核服务器的现实

这部分是我觉得最值得其他中小项目抄的。

### 1. Next.js 构建 8~10 分钟 → 全流程 4 分钟

2 核 CPU 上 `next build` 要 8~10 分钟，每次部署都这样是不可接受的。做法：**把构建搬回本机，只把镜像传过去**。

```bash
# 本机构建（2~3 分钟）
docker compose build app
# 传输（约 1 分钟，257MB 镜像 gzip 后 ~100MB）
docker save love-coach:latest | gzip -1 | ssh server 'gunzip | docker load'
# 服务器只做：拉码 / 备份 / 迁移 / 重启 / 健康检查
```

整体 4~5 分钟，而且不占服务器 CPU（服务器还跑着应用和语料索引）。

顺带一个优化：**迁移/索引镜像只在「迁移目录或索引代码」变化时才重建**——用 git 树哈希做判断：

```bash
TOOLS_HASH="$(git rev-parse HEAD:prisma/migrations)-$(git rev-parse HEAD:lib/rag)"
[ "$TOOLS_HASH" = "$(cat .tools-image-hash 2>/dev/null)" ] && echo "跳过重建（省 8 分钟）"
```

### 2. 健康门禁 + 自动回滚

部署流程里我最在意的是「失败要能退回去」：

```bash
# 构建前：把当前版本标记为回滚点
docker tag love-coach:latest love-coach:previous
# 切换后：12 次探测都不健康 → 自动回滚
for i in $(seq 1 12); do curl -fsS "$HEALTH_URL" && HEALTHY=1 && break; sleep 10; done
if [ "$HEALTHY" != 1 ]; then
  docker tag love-coach:previous love-coach:latest && docker compose up -d app
fi
```

再往前一步：**部署前自动 `pg_dump`**（保留最近 10 份，实测 30MB 的库 5 秒）。迁移出问题的时候，有备份和没备份是两种心情。

每个版本都打 `love-coach:sha-<commit>` 标签，回滚目标明确。

### 3. 索引与部署解耦

首轮语料索引要 11~60 分钟（取决于机器），把它塞进部署流程会让每次上线都超时。拆成独立任务：**部署只管上线，索引单独跑**，而且靠「内容哈希主键」实现断点续跑——中断后重跑只补没算过的片段。

---

## 四、踩坑合集（8 个，含 2 个「假成功」的静默故障）

### 1. `ssh host 'bash -s' < script` 会静默截断脚本 ⚠️

这是我踩过最阴的坑。用管道把脚本喂给远端 bash：

```bash
ssh server 'APP_DIR=/opt/app bash -s' < deploy.sh
```

脚本从 **stdin** 读取。当脚本执行到 `docker compose build` 时——**compose 读走了 stdin，把脚本剩余部分吃掉了**。结果是：脚本跑到第 4 步就退出，**退出码 0**，我的部署器以为「部署成功」。

修复：先把脚本落盘再执行，stdin 保持干净。

```bash
ssh server 'cat > /tmp/deploy.sh && bash /tmp/deploy.sh' < deploy.sh
```

> 教训：部署脚本的「假成功」比「报错」危险得多。现在我的部署器会在最后打印容器状态和关键指标，就是为了对抗这类静默失败。

### 2. GitHub Actions 的 runner 协商不了主机密钥

CD 在 Actions 里连服务器时：

```
Unable to negotiate with x.x.x.x: no matching host key type found.
Their offer: sk-ssh-ed25519@openssh.com
```

runner 上的 OpenSSH 客户端只提议 FIDO 类型的 `sk-ssh-ed25519` 主机密钥，普通 sshd 不支持。修复是在 client config 里显式声明标准算法：

```
HostKeyAlgorithms +ssh-ed25519,rsa-sha2-512,ecdsa-sha2-nistp256
PubkeyAcceptedAlgorithms +ssh-ed25519
```

（顺带一个观察：同样场景下 `appleboy/ssh-action` 一直能用——它自带 Go 实现的 SSH 客户端，不走系统 OpenSSH。）

### 3. 「换国内 npm 源」不一定更快 ⚠️

服务器上 `npm ci` 卡了 40 分钟，我顺手换成 npmmirror——更慢。实测这台京东云主机：

| 源 | 下载速度 |
|----|----------|
| npmmirror（阿里） | **754 B/s** |
| registry.npmjs.org（官方） | **720 KB/s** |

差了 1000 倍。**别信「国内源一定快」，测了再说**。

### 4. 裁剪 onnxruntime 要小心：有的能删，有的删了启动就崩

onnxruntime-node 自带三平台二进制（darwin/win32/linux 各 60~80MB）。容器只用 linux，删掉另外两个平台省 133MB——安全。

但我顺手把 `onnxruntime-web`（浏览器后端，91MB）和 `@img/sharp-*`（图像处理，20MB）也删了——**容器启动即崩**：

```
Error: Could not load the sharp module using the linux-x64 runtime
```

因为 transformers.js 在 Node 下**加载时就会 require sharp**，不是懒加载。裁剪前先在容器里跑一遍，别只看体积。

### 5. Prisma 7：`migrate diff` 的 shadow 库参数没了

旧写法（Prisma 6 及之前）：

```bash
prisma migrate diff --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "postgresql://..."
```

Prisma 7 会报 `unknown or unexpected option: --shadow-database-url`。新写法是把 shadow 库写进 `prisma.config.ts`：

```ts
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
```

然后 CI 里跑 `prisma migrate diff --from-migrations ... --to-schema ... --exit-code`，影子库用 `pgvector/pgvector:pg17` 起一个 service——**schema 漂移（改了 schema 忘写迁移）当场拦下**，这条检查很值。

### 6. Postgres 保留字：`offset` 不加引号直接报错

```sql
INSERT INTO rag_chunk (id, book, ..., offset, ...) -- ✗ syntax error at or near "offset"
```

`offset` 是保留字，必须 `"offset"`。

### 7. JSON mode 的坑：提示词不写字段名，模型就自创

结构化输出（`response_format: json_object`）只保证「是 JSON」，**不保证字段名**。我的分析工具只写了「输出 JSON」+ 分析原则，模型返回了 `stageLabel`、`interestLevel`、`signals[].type`——和 zod schema 全对不上，整次分析失败。

修复两步：**提示词里内嵌完整 JSON 模板（含字段名和枚举值）** + 加一层容错归一（兼容 `stageLabel` 这类别名、中文枚举值「低兴趣」→ `negative`）。

### 8. 输出上限太小会把 JSON 截成非法 JSON

同一个分析工具，长聊天记录时报告超过 1600 token 上限被截断，`JSON.parse` 抛「Unexpected end of JSON input」，还被原样透传给了前端。修复：上限提到 8K（模型支持 384K，不必抠），并且**解析必须自带 try/catch**：

```ts
try {
  parsedJson = JSON.parse(raw);
} catch {
  const truncated = result.finishReason === "length" || raw.length === 0;
  return Response.json({
    error: truncated
      ? "模型输出被长度上限截断（长聊天记录时常见）。请缩短后重试。"
      : "模型没有返回可解析的 JSON。",
  }, { status: 502 });
}
```

同样的病在记忆抽取上又犯了一次（上限 500 token，多条事实必然截断）——**凡是 JSON.parse 都要问一句：被截断了会怎样？**

---

## 五、成本与效果

| 项目 | 数值 |
|------|------|
| 语料 | 56 本书 / 590 万字 → 9198 片段 |
| 索引耗时 | 11 分钟（2 核） |
| 单次检索 | ~240ms（含双路召回），重排另计 |
| embedding 成本 | **0**（本地 int8 推理） |
| 每日限额 | 12 次/分钟、200 次/日（Redis 计数） |
| 服务器 | 2 核 4G 轻量云主机，四容器（app/embed/pg/redis）内存占用约 2.5G |

成本大头只有主模型 token。重排和记忆抽取都用同一个 flash 级模型，一次检索重排约 3k prompt tokens。

---

## 六、可以抄走的东西

1. **静态语料别用 embedding API**：本地 bge-small-zh int8（24MB）足够，零成本、零网络依赖。
2. **10 万条以内别建向量索引**：精确 KNN 更快且召回 100%。
3. **双路召回用 RRF 融合**，别费劲校准两路分数。
4. **分块先处理目录**：目录行是检索质量的隐形杀手。
5. **重排交给 LLM**：比部署 reranker 模型划算得多。
6. **记忆写入全部异步**（`onFinish` fire-and-forget），用户无感。
7. **部署用「本机构建 + 镜像传输」**：小服务器上省下 80% 时间。
8. **健康门禁 + 自动回滚 + 部署前备份**：这三件事加起来不到 30 行 shell，但能救命。
9. **对所有 `JSON.parse` 做截断防御**；结构化输出的提示词里**写死字段名**。

---

## 最后

系统目前是**私有部署**，语料仅用于个人学习研究，不提供语料分发。如果你在做类似的「垂直领域 + 私有语料 + 小服务器」的项目，上面这些取舍和坑应该能让你少走点弯路。

有问题欢迎评论区讨论——尤其是部署那块，我很想知道别人在更差的网络环境下是怎么做的。

---

*标签建议：`RAG` `Next.js` `pgvector` `Docker` `GitHub Actions` `LLM`*
