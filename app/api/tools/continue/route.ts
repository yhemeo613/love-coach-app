import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { checkAndConsumeRateLimit } from "@/lib/redis";
import { defaultModel, llmApiKey } from "@/lib/ai/provider";
import { fimBaseURL } from "@/lib/ai/models";
import { recordUsage } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  suffix: z.string().max(2000).optional(),
  maxTokens: z.number().int().min(8).max(512).optional(),
});

/**
 * 话术接龙：调用 DeepSeek FIM 补全（Beta）。
 * FIM 必须走 /beta 前缀的 base_url，因此这里直接发 HTTP，而不复用 chat 的 provider。
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  if (user.banned) return Response.json({ error: "账号已被限制使用" }, { status: 403 });

  const apiKey = llmApiKey();
  if (!apiKey) return Response.json({ error: "服务端未配置 LLM_API_KEY" }, { status: 500 });

  const limit = await checkAndConsumeRateLimit(user.id);
  if (!limit.allowed) return Response.json({ error: limit.reason }, { status: 429 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "参数不合法：请填写 1-2000 字的开头。" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    model: defaultModel(),
    prompt: body.prompt,
    max_tokens: body.maxTokens ?? 128,
    temperature: 0.9,
  };
  if (body.suffix) payload.suffix = body.suffix;

  try {
    const res = await fetch(`${fimBaseURL()}/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: req.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        {
          error:
            res.status === 404
              ? "上游未开放 FIM 补全接口（404）。该能力为 Beta，可能未对你的账号开放。"
              : `上游返回 ${res.status}：${detail.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ text?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
    };

    const text = json.choices?.[0]?.text ?? "";

    await recordUsage({
      userId: user.id,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      cachedTokens: json.usage?.prompt_cache_hit_tokens ?? 0,
      promptChars: body.prompt.length,
      completionChars: text.length,
    });

    return Response.json({ completion: text });
  } catch (error) {
    return Response.json(
      { error: `补全失败：${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
