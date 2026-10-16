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
 * 这里按思考强度给安全下限：强度越高、推理越长，预算必须越大。
 *
 * 依据（2026-10 核对 api-docs.deepseek.com）：
 *  - 上下文 1M、最大输出 384K；接口对 max_tokens 直到 393216 均接受（实测）
 *  - 文档将思考模式列为默认能力，未单列 reasoning token 的独立上限，
 *    即推理与正文共享输出预算 —— 因此下限必须按强度分级而不是给固定 8K
 */
export const THINKING_MIN_OUTPUT_TOKENS: Record<"low" | "high" | "max", number> = {
  low: 16384,
  high: 32768,
  max: 65536,
};

/** 官方上限：输出最多 384K（393216）tokens；上下文 1M */
export const MAX_OUTPUT_TOKENS = 393216;
export const CONTEXT_WINDOW_TOKENS = 1000000;

export function effectiveMaxTokens(
  maxTokens: number | undefined,
  thinking: boolean,
  reasoningEffort: "low" | "high" | "max" = DEFAULT_EFFORT,
): number | undefined {
  if (!thinking) return maxTokens;
  return Math.max(maxTokens ?? 0, THINKING_MIN_OUTPUT_TOKENS[reasoningEffort]);
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
