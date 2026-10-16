import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ChatRequestOptions } from "./options";

export const PROVIDER_NAME = "coach";

export function llmBaseURL(): string {
  return (process.env.LLM_API_BASE || "https://api.deepseek.com/v1").replace(/\/+$/, "");
}

export function llmApiKey(): string {
  return process.env.LLM_API_KEY || "";
}

export function defaultModel(): string {
  return process.env.LLM_MODEL || "deepseek-flash";
}

/**
 * 结构化输出专用模型：强制 response_format=json_object。
 * DeepSeek 要求此时必须在提示词里明确要求输出 JSON，否则可能长时间输出空白。
 */
export function createStructuredModel(modelId: string, context: { userId: string }): LanguageModel {
  const provider = createOpenAICompatible({
    name: PROVIDER_NAME,
    baseURL: llmBaseURL(),
    apiKey: llmApiKey(),
    includeUsage: true,
  });

  return provider.languageModel(modelId, {
    includeUsage: true,
    transformRequestBody: (args: Record<string, unknown>) => {
      const body: Record<string, unknown> = {
        ...args,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        user_id: safeUserId(context.userId),
      };
      delete body.frequency_penalty;
      delete body.presence_penalty;
      return body;
    },
  });
}

/** DeepSeek 要求 user_id 只能包含 [a-zA-Z0-9-_]，且不得含隐私信息 */
function safeUserId(userId: string): string {
  return `u-${userId.replace(/[^a-zA-Z0-9-_]/g, "")}`.slice(0, 512);
}

/**
 * 构造一个「带 DeepSeek 原生能力」的对话模型。
 *
 * 关键点：@ai-sdk/openai-compatible 并不认识 DeepSeek 的 thinking / user_id 字段，
 * 因此通过官方的 transformRequestBody 钩子注入请求体：
 *   - thinking: { type, reasoning_effort }  思考模式与强度
 *   - user_id                                KVCache 隔离与内容安全（不传隐私信息）
 *   - logprobs / top_logprobs               对数概率
 *   - 显式删除已废弃的 frequency_penalty / presence_penalty
 */
export function createChatModel(
  modelId: string,
  options: ChatRequestOptions,
  context: { userId: string },
): LanguageModel {
  const provider = createOpenAICompatible({
    name: PROVIDER_NAME,
    baseURL: llmBaseURL(),
    apiKey: llmApiKey(),
    includeUsage: true,
  });

  return provider.languageModel(modelId, {
    includeUsage: true,
    transformRequestBody: (args: Record<string, unknown>) => {
      const body: Record<string, unknown> = { ...args };

      body.thinking = options.thinking
        ? { type: "enabled", reasoning_effort: options.reasoningEffort || "high" }
        : { type: "disabled" };

      body.user_id = safeUserId(context.userId);

      if (options.logprobs) {
        body.logprobs = true;
        body.top_logprobs = 3;
      }

      delete body.frequency_penalty;
      delete body.presence_penalty;

      return body;
    },
  });
}
