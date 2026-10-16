import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { DEFAULT_SCENE_ID, sceneMap } from "@/lib/scenes";
import { getCurrentUser } from "@/lib/session";
import { checkAndConsumeRateLimit, markActive, recordRateLimitRejection } from "@/lib/redis";
import { appendAssistantMessage, appendUserMessage } from "@/lib/conversations";
import { effectiveMaxTokens, normalizeOptions } from "@/lib/ai/options";
import { createChatModel } from "@/lib/ai/provider";
import { resolveModel } from "@/lib/model-settings";
import { createCoachTools } from "@/lib/ai/tools";
import { recordUsage } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  /* ---------- 1. 鉴权 ---------- */
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录后再发起对话。" }, { status: 401 });
  }
  if (user.banned) {
    return Response.json({ error: "该账号已被限制使用，请联系管理员。" }, { status: 403 });
  }

  if (!process.env.LLM_API_KEY) {
    return Response.json(
      { error: "服务端未配置 LLM_API_KEY，请在 .env 中设置后重启服务。" },
      { status: 500 },
    );
  }

  /* ---------- 2. 解析参数 ---------- */
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const messages = Array.isArray(payload.messages) ? (payload.messages as UIMessage[]) : [];
  if (messages.length === 0) {
    return Response.json({ error: "消息为空。" }, { status: 400 });
  }

  const options = normalizeOptions(payload);
  const scene = sceneMap[options.sceneId ?? DEFAULT_SCENE_ID] ?? sceneMap[DEFAULT_SCENE_ID];
  // 后台「模型管理」决定实际用哪个：请求的模型被停用或不存在时回落到默认模型
  const { modelId, source: modelSource } = await resolveModel(options.model);

  /* ---------- 3. 限流与配额（Redis 分钟窗口 + 自然日配额）---------- */
  const limit = await checkAndConsumeRateLimit(user.id);
  if (!limit.allowed) {
    // 分钟窗口先耗尽则记为 minute，否则是当日配额用尽
    void recordRateLimitRejection(user.id, limit.minuteRemaining === 0 ? "minute" : "day");
    return Response.json(
      { error: limit.reason, minuteRemaining: limit.minuteRemaining, dayRemaining: limit.dayRemaining },
      { status: 429 },
    );
  }
  void markActive(user.id);

  /* ---------- 4. 落库用户消息，拿到会话 id ---------- */
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = (lastUser?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  let conversationId = options.conversationId;
  try {
    conversationId = await appendUserMessage({
      userId: user.id,
      conversationId,
      sceneId: scene.id,
      content: lastUserText || "（空消息）",
    });
  } catch (error) {
    console.error("[chat] 保存用户消息失败", error);
  }

  /* ---------- 5. 调用模型：思考模式 / 工具 / 多步 ---------- */
  const historyLimit = Math.max(2, Number(process.env.CHAT_HISTORY_LIMIT || 16));
  const recent = messages.slice(-historyLimit);

  const result = streamText({
    model: createChatModel(modelId, options, { userId: user.id }),
    system: scene.systemPrompt,
    messages: await convertToModelMessages(recent),
    tools: createCoachTools({ userId: user.id, conversationId }),
    // 允许「检索知识 → 存行动清单」这类多步工具调用
    stopWhen: stepCountIs(4),
    temperature: options.temperature ?? Number(process.env.LLM_TEMPERATURE || 0.7),
    topP: options.topP,
    maxOutputTokens:
      effectiveMaxTokens(options.maxTokens, Boolean(options.thinking)) ??
      Number(process.env.LLM_MAX_TOKENS || 1600),
    stopSequences: options.stop,
    abortSignal: req.signal,

    onFinish: async ({ text, usage, steps }) => {
      const toolCalls = steps.reduce(
        (count, step) => count + (step.toolCalls?.length ?? 0),
        0,
      );

      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      const cachedTokens = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
      const reasoningTokens = usage?.outputTokenDetails?.reasoningTokens ?? 0;

      if (conversationId) {
        try {
          await appendAssistantMessage({
            conversationId,
            content: text,
            meta: {
              model: modelId,
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              cachedTokens,
              reasoningTokens,
              toolCalls,
            },
          });
        } catch (error) {
          console.error("[chat] 保存回复失败", error);
        }
      }

      await recordUsage({
        userId: user.id,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        cachedTokens,
        reasoningTokens,
        toolCalls,
        promptChars: lastUserText.length,
        completionChars: text.length,
      });
    },
  });

  /* ---------- 6. 以 UI Message 流返回（含思考过程）---------- */
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
    }),
    headers: conversationId ? { "X-Conversation-Id": conversationId } : undefined,
  });
}
