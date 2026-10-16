/** 对话请求的可调参数（客户端 → 服务端） */
export interface ChatRequestOptions {
  sceneId: string;
  conversationId?: string;
  /** 模型 id，默认取服务端 LLM_MODEL */
  model?: string;
  /** 思考模式（DeepSeek thinking.type） */
  thinking?: boolean;
  /** 思考强度：low | high | max（thinking 开启时生效） */
  reasoningEffort?: "low" | "high" | "max";
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  /** 是否返回 token 对数概率（高级调试） */
  logprobs?: boolean;
}

export const DEFAULT_EFFORT = "high" as const;

/**
 * 思考模式下 max_tokens 同时覆盖「推理」与「正文」。
 * 若沿用非思考模式的小额度（如 1600），推理会把预算吃光、正文为空。
 * 这里给思考模式一个安全下限。
 */
export const THINKING_MIN_OUTPUT_TOKENS = 8192;

/** 官方上限：输出最多 384K（393216）tokens；上下文 1M */
export const MAX_OUTPUT_TOKENS = 393216;
export const CONTEXT_WINDOW_TOKENS = 1000000;

export function effectiveMaxTokens(
  maxTokens: number | undefined,
  thinking: boolean,
): number | undefined {
  if (!thinking) return maxTokens;
  return Math.max(maxTokens ?? 0, THINKING_MIN_OUTPUT_TOKENS);
}

export function normalizeOptions(raw: Record<string, unknown>): ChatRequestOptions {
  const pickNumber = (value: unknown, min: number, max: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, n));
  };

  return {
    sceneId: typeof raw.sceneId === "string" ? raw.sceneId : "free",
    conversationId: typeof raw.conversationId === "string" ? raw.conversationId : undefined,
    model: typeof raw.model === "string" && raw.model ? raw.model : undefined,
    thinking: raw.thinking === true,
    reasoningEffort:
      raw.reasoningEffort === "low" || raw.reasoningEffort === "high" || raw.reasoningEffort === "max"
        ? raw.reasoningEffort
        : DEFAULT_EFFORT,
    temperature: pickNumber(raw.temperature, 0, 2),
    topP: pickNumber(raw.topP, 0.01, 1),
    maxTokens: pickNumber(raw.maxTokens, 64, MAX_OUTPUT_TOKENS),
    stop: Array.isArray(raw.stop)
      ? raw.stop.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 16)
      : undefined,
    logprobs: raw.logprobs === true,
  };
}
