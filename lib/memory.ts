/**
 * 对话记忆：会话内滚动摘要（压缩）+ 跨会话长期记忆（事实抽取）。
 *
 * 分层设计（参考 Mem0 的事实级增删改、Letta/Zep 的分层记忆，按本项目规模做减法）：
 *  1. 窗口内（最近 CHAT_HISTORY_LIMIT 条）：逐字保留，最准；
 *  2. 窗口外（更早的消息）：压缩为会话摘要，随对话推进增量更新
 *     （summary + summarizedCount 记录已覆盖条数，只在攒够一批时重压缩一次）；
 *  3. 跨会话：把稳定事实抽取成键值记忆（user_memory），同 key 覆盖、过时删除。
 *
 * 时序：写入都发生在回复完成之后（onFinish 异步执行），不拖慢用户等待；
 *       读取发生在构建系统提示词之前，注入「长期记忆 + 会话摘要」两段。
 * 开关：MEMORY_SUMMARY=0 / MEMORY_EXTRACT=0 可分别关闭；失败只记日志，不影响对话。
 */
import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { createChatModel, createStructuredModel, defaultModel } from "@/lib/ai/provider";

export interface MemoryContext {
  summary: string | null;
  memories: Array<{ key: string; value: string }>;
}

export interface MemoryModelConfig {
  /** 使用的模型（默认站点默认模型） */
  modelId?: string;
}

function enabled(flag: string): boolean {
  return (process.env[flag] ?? "1") !== "0";
}

function windowSize(): number {
  return Math.max(2, Number(process.env.CHAT_HISTORY_LIMIT || 16));
}

/** 攒够多少条未摘要的历史才触发一次压缩（越小越勤、越贵） */
function summaryChunk(): number {
  return Math.max(2, Number(process.env.MEMORY_SUMMARY_CHUNK || 8));
}

/* ---------------- 读取：注入系统提示词 ---------------- */

export async function loadMemoryContext(
  userId: string,
  conversationId?: string,
): Promise<MemoryContext> {
  const [conversation, memories] = await Promise.all([
    conversationId
      ? prisma.conversation.findFirst({
          where: { id: conversationId, userId },
          select: { summary: true },
        })
      : Promise.resolve(null),
    prisma.userMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { key: true, value: true },
    }),
  ]);
  return { summary: conversation?.summary ?? null, memories };
}

export function buildMemoryPrompt(context: MemoryContext): string | null {
  const parts: string[] = [];

  if (context.memories.length > 0) {
    parts.push(
      [
        "## 关于这位用户的长期记忆（跨会话）",
        ...context.memories.map((memory) => `- ${memory.key}：${memory.value}`),
        "使用规则：记忆可能过时——与本轮对话冲突时以用户最新说法为准；自然地使用，不要生硬复述；用户纠正后用 remember_about_user 更新。",
      ].join("\n"),
    );
  }

  if (context.summary) {
    parts.push(
      [
        "## 本会话较早内容的摘要",
        context.summary,
        "使用规则：摘要用于延续上下文；细节记不清就向用户确认，不要编造。",
      ].join("\n"),
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/* ---------------- 写入 1：会话滚动摘要 ---------------- */

export async function refreshConversationSummary(
  conversationId: string,
  userId: string,
  config: MemoryModelConfig = {},
): Promise<void> {
  if (!enabled("MEMORY_SUMMARY")) return;

  const total = await prisma.message.count({ where: { conversationId } });
  const overflow = total - windowSize();
  if (overflow <= 0) return;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { summary: true, summarizedCount: true },
  });
  if (!conversation) return;

  const pending = overflow - conversation.summarizedCount;
  if (pending < summaryChunk()) return; // 攒够一批再压缩，避免每轮都调模型

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    skip: conversation.summarizedCount,
    take: pending,
    select: { role: true, content: true },
  });
  if (rows.length === 0) return;

  const transcript = rows
    .map((row) => `${row.role === "user" ? "用户" : "教练"}：${row.content.slice(0, 600)}`)
    .join("\n")
    .slice(0, 9000);

  const prompt = [
    "把下面这段恋爱教练对话压缩成「供后续轮次使用的进展摘要」。",
    "必须保留：用户的事实背景（年龄/职业/感情经历）、当前目标对象与关系阶段、已给出的关键建议与话术、用户的反馈与进展、未解决的问题与下一步约定。",
    "丢弃：寒暄、重复表达、模板话术。",
    "输出要求：中文要点列表，400 字以内；直接输出摘要正文，不要解释、不要标题。",
    "",
    conversation.summary ? `已有摘要（在其基础上更新）：\n${conversation.summary}` : "已有摘要：（无）",
    "",
    "需要并入的新对话：",
    transcript,
  ].join("\n");

  const { text } = await generateText({
    // sceneId 只用于类型约束，provider 不读取；记忆调用一律关闭思考模式
    model: createChatModel(
      config.modelId ?? defaultModel(),
      { sceneId: "memory", thinking: false },
      { userId },
    ),
    prompt,
    temperature: 0.2,
    maxOutputTokens: 700,
    abortSignal: AbortSignal.timeout(30000),
  });

  const summary = text.trim();
  if (!summary) return;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { summary: summary.slice(0, 4000), summarizedCount: overflow },
  });
}

/* ---------------- 写入 2：跨会话事实抽取 ---------------- */

export async function extractUserMemories(params: {
  userId: string;
  conversationId?: string;
  userText: string;
  assistantText: string;
  config?: MemoryModelConfig;
}): Promise<void> {
  if (!enabled("MEMORY_EXTRACT")) return;
  const { userId, conversationId, userText, assistantText, config } = params;
  if (userText.trim().length < 6) return;

  const existing = await prisma.userMemory.findMany({
    where: { userId },
    select: { key: true, value: true },
  });
  const existingText = existing.length
    ? existing.map((memory) => `- ${memory.key}：${memory.value}`).join("\n")
    : "（暂无）";

  const prompt = [
    "任务：从一轮恋爱教练对话中抽取关于用户的「稳定事实」，维护跨会话记忆。",
    "",
    "只记录长期有效的信息，例如：年龄、职业与生活状态、恋爱经历、当前目标对象与关系阶段、已采纳或拒绝的建议、重要偏好与禁忌、需要持续关注的情绪或风险信号。",
    "不要记录：临时安排、单次情绪、寒暄、你自己的建议内容（只记用户的事实与立场）。",
    "key 用 2-8 个汉字的稳定短语（如「年龄职业」「关系阶段」「目标对象」「已给建议」「禁忌」）；同一 key 的新事实覆盖旧值。",
    "",
    `已有记忆：\n${existingText}`,
    "",
    `本轮对话：\n用户：${userText.slice(0, 1500)}\n教练：${assistantText.slice(0, 1500)}`,
    "",
    '输出 JSON：{"upsert":[{"key":"...","value":"..."}],"forget":["过时或错误的 key"]}',
    '若无新增或修改，输出 {"upsert":[],"forget":[]}。',
  ].join("\n");

  const { text } = await generateText({
    model: createStructuredModel(config?.modelId ?? defaultModel(), { userId }),
    prompt,
    temperature: 0,
    // 多条事实的 JSON 容易超过 500 token 被截断（截断后 JSON.parse 必失败）：
    // 默认给到 2048，并可经 MEMORY_MAX_TOKENS 调整
    maxOutputTokens: Number(process.env.MEMORY_MAX_TOKENS || 2048),
    abortSignal: AbortSignal.timeout(20000),
  });

  // 解析自带保护：模型输出被截断/为空时不抛异常，只跳过本轮记忆维护
  let parsed: { upsert?: unknown; forget?: unknown };
  try {
    parsed = JSON.parse(text) as { upsert?: unknown; forget?: unknown };
  } catch (error) {
    console.error(
      "[memory] 记忆抽取返回的不是合法 JSON（可能是输出被截断），本轮跳过：",
      text.slice(0, 120),
      error instanceof Error ? error.message : error,
    );
    return;
  }
  const upserts = Array.isArray(parsed.upsert) ? parsed.upsert.slice(0, 8) : [];
  const forgets = Array.isArray(parsed.forget)
    ? parsed.forget.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];

  for (const item of upserts) {
    const record = item as { key?: unknown; value?: unknown };
    const key = String(record?.key ?? "").trim().slice(0, 40);
    const value = String(record?.value ?? "").trim().slice(0, 800);
    if (!key || !value) continue;
    await prisma.userMemory.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value, conversationId: conversationId ?? null },
      update: { value, conversationId: conversationId ?? null },
    });
  }

  if (forgets.length > 0) {
    await prisma.userMemory.deleteMany({ where: { userId, key: { in: forgets } } });
  }
}

/** 工具入口：用户明确要求记住/纠正某件事时直接写入 */
export async function rememberFact(params: {
  userId: string;
  conversationId?: string;
  key: string;
  value: string;
}): Promise<{ key: string; value: string } | null> {
  const key = params.key.trim().slice(0, 40);
  const value = params.value.trim().slice(0, 800);
  if (!key || !value) return null;
  const saved = await prisma.userMemory.upsert({
    where: { userId_key: { userId: params.userId, key } },
    create: {
      userId: params.userId,
      key,
      value,
      conversationId: params.conversationId ?? null,
    },
    update: { value, conversationId: params.conversationId ?? null },
    select: { key: true, value: true },
  });
  return saved;
}
