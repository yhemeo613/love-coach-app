import { cached } from "@/lib/redis";

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
}

export interface BalanceInfo {
  available: boolean;
  currency: string;
  total: string;
}

/** 官方文档列出的可用模型；/models 拉取失败时作为兜底 */
export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "deepseek-flash",
    label: "DeepSeek Flash",
    description: "响应快、成本低，适合日常聊天与陪练",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "推理更强，适合复杂关系分析与长文本复盘",
  },
];

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.LLM_API_KEY || ""}`,
  };
}

function baseURL(): string {
  return (process.env.LLM_API_BASE || "https://api.deepseek.com/v1").replace(/\/+$/, "");
}

/** FIM 补全（Beta）必须使用 /beta 作为 base */
export function fimBaseURL(): string {
  const explicit = process.env.LLM_FIM_BASE;
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${baseURL().replace(/\/v1$/, "")}/beta`;
}

function describe(id: string): ModelInfo {
  const known = FALLBACK_MODELS.find((m) => m.id === id);
  if (known) return known;
  return { id, label: id, description: "上游返回的模型" };
}

/** 拉取可用模型列表（缓存 10 分钟，避免每次开面板都打上游） */
export async function listModels(): Promise<{ models: ModelInfo[]; fromUpstream: boolean }> {
  try {
    return await cached("llm:models", 600, async () => {
      const res = await fetch(`${baseURL()}/models`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (json.data || []).map((m) => m.id).filter(Boolean);
      if (ids.length === 0) throw new Error("模型列表为空");
      return { models: ids.map(describe), fromUpstream: true };
    });
  } catch {
    return { models: FALLBACK_MODELS, fromUpstream: false };
  }
}

/** 查询账户余额（缓存 60 秒） */
export async function getBalance(): Promise<BalanceInfo | null> {
  try {
    return await cached("llm:balance", 60, async () => {
      const res = await fetch(`${baseURL()}/user/balance`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        is_available?: boolean;
        balance_infos?: Array<{ currency: string; total_balance: string }>;
      };
      const info = json.balance_infos?.[0];
      return {
        available: Boolean(json.is_available),
        currency: info?.currency || "CNY",
        total: info?.total_balance || "0",
      };
    });
  } catch {
    return null;
  }
}
