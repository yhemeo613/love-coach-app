import { generateText } from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { checkAndConsumeRateLimit } from "@/lib/redis";
import { createStructuredModel, defaultModel } from "@/lib/ai/provider";
import { recordUsage } from "@/lib/ai/usage";
import { scenes } from "@/lib/scenes";

export const runtime = "nodejs";
export const maxDuration = 120;

const ReportSchema = z.object({
  stage: z.string().describe("当前所处阶段：S0-S10 之一，或 free"),
  stageName: z.string().describe("阶段中文名"),
  summary: z.string().describe("两三句总体判断，直指核心问题"),
  signals: z
    .array(
      z.object({
        label: z.string().describe("信号名，例如「主动开话题」"),
        reading: z.enum(["positive", "neutral", "negative"]),
        evidence: z.string().describe("引用聊天记录中的具体依据，不要泛泛而谈"),
      }),
    )
    .max(6),
  risks: z.array(z.string()).max(4).describe("风险提示：越界推进、讨好、操控倾向等"),
  nextActions: z
    .array(
      z.object({
        action: z.string().describe("明天就能做的具体动作"),
        sample: z.string().optional().describe("可直接照抄的一句话"),
      }),
    )
    .max(4),
  boundaryNote: z.string().describe("一句边界提醒：知情、可撤回、可拒绝"),
});

const SYSTEM = `你是恋爱教练的分析模块。用户会粘贴一段真实聊天记录，你要输出结构化诊断。

判断依据（必须遵守）：
1. 可靠的兴趣信号是「对方是否主动投入」：主动开话题、主动约、主动分享私事、回复长度增加。礼貌与有求必应不等于兴趣。
2. 用「上堆/下切」判断对话层级：概括化回答（还行、最近忙）是拉开距离，具体化回答（我周四要加班）是认真参与。
3. 约不出来通常是关系浓度不够，或邀约把决策成本全推给了对方。
4. 分清「情绪事件」与「结构问题」：反复出现的同一类冲突属于结构问题，必须正面谈。

严格禁止：
- 推荐任何操控手段：制造嫉妒、忽冷忽热、打压贬低、无视拒绝继续推进、酒精降低判断力。
- 把「对方没有明确拒绝」解读为同意；把回避、冷淡重新解释为兴趣。
- 给出针对未成年人的建议。

输出要求：
- 只输出 JSON，不要任何 Markdown 代码块或解释文字。
- evidence 必须引用聊天记录里的原话片段（可截断），不要编造。
- nextActions 最多 4 条，必须具体、可执行、可拒绝。
- 若记录里出现持续的贬低、拉扯、自我怀疑迹象，在 risks 中明确指出，并在 summary 里建议切换到「守护」场景。`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  if (user.banned) return Response.json({ error: "账号已被限制使用" }, { status: 403 });

  const limit = await checkAndConsumeRateLimit(user.id);
  if (!limit.allowed) return Response.json({ error: limit.reason }, { status: 429 });

  let transcript = "";
  try {
    const body = (await req.json()) as { transcript?: string };
    transcript = (body.transcript || "").trim();
  } catch {
    /* ignore */
  }

  if (transcript.length < 20) {
    return Response.json({ error: "请粘贴至少 20 个字的聊天记录。" }, { status: 400 });
  }
  if (transcript.length > 12000) {
    transcript = transcript.slice(0, 12000);
  }

  const sceneList = scenes.map((s) => `${s.code}=${s.name}`).join("、");

  try {
    const result = await generateText({
      model: createStructuredModel(defaultModel(), { userId: user.id }),
      system: SYSTEM,
      prompt: `可用阶段代号：${sceneList}\n\n聊天记录如下（用户与对方的对话）：\n"""\n${transcript}\n"""\n\n请输出 JSON。`,
      temperature: 0.3,
      // 结构化报告 + 长聊天记录时输出较长：默认 8K（模型上限 384K），避免 JSON 被截断
      maxOutputTokens: Number(process.env.TOOLS_MAX_TOKENS || 8192),
    });

    const raw = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");

    // 解析必须自带保护：输出被长度上限截断时 JSON 不完整，
    // 直接 JSON.parse 会抛出「Unexpected end of JSON input」并原样透传给前端
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      const truncated = result.finishReason === "length" || raw.length === 0;
      return Response.json(
        {
          error: truncated
            ? "模型输出被长度上限截断（长聊天记录时常见）。请缩短聊天记录后重试，或换用 V4 Pro 模型。"
            : "模型没有返回可解析的 JSON。请重试，或换用 V4 Pro 模型。",
          detail: raw.slice(0, 400),
        },
        { status: 502 },
      );
    }
    const parsed = ReportSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return Response.json(
        { error: "模型返回的 JSON 结构不符合预期，请重试或换用 V4 Pro 模型。", detail: raw.slice(0, 400) },
        { status: 502 },
      );
    }

    await recordUsage({
      userId: user.id,
      promptTokens: result.usage?.inputTokens ?? 0,
      completionTokens: result.usage?.outputTokens ?? 0,
      cachedTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
      reasoningTokens: result.usage?.outputTokenDetails?.reasoningTokens ?? 0,
      promptChars: transcript.length,
      completionChars: raw.length,
    });

    return Response.json({ report: parsed.data });
  } catch (error) {
    return Response.json(
      { error: `分析失败：${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
