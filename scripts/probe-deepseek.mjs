/**
 * DeepSeek API 能力探测脚本（开发用，不参与构建）
 *   node scripts/probe-deepseek.mjs
 * 读取 .env 里的 LLM_API_BASE / LLM_API_KEY，逐项验证：
 *   1. /models          可用模型列表
 *   2. /user/balance    账户余额
 *   3. chat 思考模式     thinking.type + reasoning_effort + reasoning_content 回包
 *   4. JSON 模式         response_format=json_object
 *   5. 工具调用          tools / tool_calls
 *   6. logprobs          logprobs + top_logprobs
 *   7. stop 序列         stop
 *   8. FIM 补全（Beta）  /beta/completions 前缀续写
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const BASE = (env.LLM_API_BASE || "https://api.deepseek.com/v1").replace(/\/+$/, "");
const KEY = env.LLM_API_KEY;
const H = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const text = await res.text();
  return { status: res.status, body: text };
}

function preview(text, n = 220) {
  return text.replace(/\s+/g, " ").slice(0, n);
}

let models = [];
try {
  const r = await get("/models");
  const parsed = JSON.parse(r.body);
  models = (parsed.data || []).map((m) => m.id);
  record("/models", r.status === 200, `status=${r.status} models=[${models.join(", ")}]`);
} catch (error) {
  record("/models", false, String(error));
}

try {
  const r = await get("/user/balance");
  record("/user/balance", r.status === 200, preview(r.body));
} catch (error) {
  record("/user/balance", false, String(error));
}

const testModel = models[0] || env.LLM_MODEL || "deepseek-chat";

// 3. 思考模式
try {
  const r = await post("/chat/completions", {
    model: testModel,
    messages: [{ role: "user", content: "用一句话说明什么是上堆和下切。" }],
    thinking: { type: "enabled", reasoning_effort: "low" },
    max_tokens: 512,
    stream: false,
  });
  let hasReasoning = false;
  let ok = r.status === 200;
  if (ok) {
    const j = JSON.parse(r.body);
    hasReasoning = Boolean(j.choices?.[0]?.message?.reasoning_content);
  }
  record("思考模式 thinking", ok, `status=${r.status} reasoning_content=${hasReasoning} ${ok ? "" : preview(r.body)}`);
} catch (error) {
  record("思考模式 thinking", false, String(error));
}

// 4. JSON 模式
try {
  const r = await post("/chat/completions", {
    model: testModel,
    messages: [
      { role: "system", content: "只输出 JSON。" },
      { role: "user", content: '输出 {"stage":"S3","risk":"low"} 这样的对象，stage 用 S0-S10 之一。' },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    max_tokens: 256,
  });
  let valid = false;
  if (r.status === 200) {
    try {
      JSON.parse(JSON.parse(r.body).choices[0].message.content);
      valid = true;
    } catch {
      valid = false;
    }
  }
  record("JSON 模式", r.status === 200 && valid, `status=${r.status} 可解析=${valid}`);
} catch (error) {
  record("JSON 模式", false, String(error));
}

// 5. 工具调用
try {
  const r = await post("/chat/completions", {
    model: testModel,
    messages: [{ role: "user", content: "北京现在天气怎么样？用工具查一下。" }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "查询城市天气",
          parameters: {
            type: "object",
            properties: { city: { type: "string", description: "城市名" } },
            required: ["city"],
          },
        },
      },
    ],
    tool_choice: "auto",
    thinking: { type: "disabled" },
    max_tokens: 256,
  });
  let called = false;
  if (r.status === 200) {
    called = Boolean(JSON.parse(r.body).choices?.[0]?.message?.tool_calls?.length);
  }
  record("工具调用 tools", r.status === 200 && called, `status=${r.status} tool_calls=${called}`);
} catch (error) {
  record("工具调用 tools", false, String(error));
}

// 6. logprobs
try {
  const r = await post("/chat/completions", {
    model: testModel,
    messages: [{ role: "user", content: "说三个字。" }],
    logprobs: true,
    top_logprobs: 3,
    thinking: { type: "disabled" },
    max_tokens: 32,
  });
  let has = false;
  if (r.status === 200) has = Boolean(JSON.parse(r.body).choices?.[0]?.logprobs);
  record("logprobs", r.status === 200 && has, `status=${r.status} logprobs=${has}`);
} catch (error) {
  record("logprobs", false, String(error));
}

// 7. stop 序列
try {
  const r = await post("/chat/completions", {
    model: testModel,
    messages: [{ role: "user", content: "从 1 数到 10，每个数字一行。" }],
    stop: ["5"],
    thinking: { type: "disabled" },
    max_tokens: 128,
  });
  let stopped = false;
  let content = "";
  if (r.status === 200) {
    const j = JSON.parse(r.body);
    content = j.choices?.[0]?.message?.content ?? "";
    stopped = !content.includes("6");
  }
  record("stop 序列", r.status === 200 && stopped, `status=${r.status} 在 5 前停止=${stopped}`);
} catch (error) {
  record("stop 序列", false, String(error));
}

// 8. FIM 补全（Beta）
try {
  const r = await post("/beta/completions", {
    model: testModel,
    prompt: "她说明天有空，我打算回复：那",
    max_tokens: 64,
  });
  record("FIM 补全(beta)", r.status === 200, `status=${r.status} ${preview(r.body, 160)}`);
} catch (error) {
  record("FIM 补全(beta)", false, String(error));
}

console.log("\n===== 汇总 =====");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
console.log(`\n可用模型: ${models.join(", ") || "（未获取到）"}`);
