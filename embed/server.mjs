/**
 * 嵌入服务：把 bge-small-zh-v1.5（ONNX int8）封装为 HTTP 接口。
 *
 * 为什么单独一个服务而不是放进 Next.js：
 *  - onnxruntime-node 是原生模块，不进 Next 的打包链路，避免 standalone 构建的追踪问题；
 *  - 模型常驻内存（约 250MB），与应用的生命周期解耦，重启应用不必重新加载模型；
 *  - 只在内网（compose 网络）暴露，不对外发布端口。
 *
 * 接口：
 *   GET  /health        → { ok, ready }
 *   POST /embed         → { texts: string[], query?: boolean } → { count, dim, vectors }
 *     query=true 时加 bge-zh 官方推荐的检索指令前缀（仅查询侧使用）。
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";

const PORT = Number(process.env.EMBED_PORT || 8080);
const MODEL = process.env.EMBED_MODEL || "bge-small-zh-v1.5";
const MAX_TEXTS = 256;
const MAX_TEXT_CHARS = 4000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// 只用镜像内自带的模型文件，运行时不访问外网
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = fileURLToPath(new URL("./models/", import.meta.url));

// bge-*-zh-v1.5 官方推荐的检索查询指令（查询侧加、语料侧不加）
const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";

let extractorPromise = null;
let ready = false;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      pooling: "cls",
      normalize: true,
    }).then((extractor) => {
      ready = true;
      console.log(`[embed] 模型已加载：${MODEL}（q8 / cls / normalize）`);
      return extractor;
    });
    extractorPromise.catch((error) => {
      console.error("[embed] 模型加载失败", error);
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on("data", (part) => {
      size += part.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      parts.push(part);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, ready, model: MODEL });
      return;
    }

    if (req.method === "POST" && req.url === "/embed") {
      const raw = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: "请求体不是合法 JSON" });
        return;
      }

      const texts = (Array.isArray(payload.texts) ? payload.texts : [])
        .slice(0, MAX_TEXTS)
        .map((t) => String(t ?? "").slice(0, MAX_TEXT_CHARS));
      if (texts.length === 0) {
        sendJson(res, 400, { error: "texts 为空" });
        return;
      }

      // 预热：第一次调用包含模型加载（约 1-3 秒）
      const extractor = await getExtractor();
      const input = payload.query ? texts.map((t) => QUERY_PREFIX + t) : texts;
      const output = await extractor(input, { pooling: "cls", normalize: true });

      // output 形如 [n, dim]；tolist 转为普通数组，避免前端依赖张量类型
      const vectors = output.tolist();
      sendJson(res, 200, {
        count: vectors.length,
        dim: Array.isArray(vectors[0]) ? vectors[0].length : 0,
        vectors,
      });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    console.error("[embed] 处理失败", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "内部错误" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[embed] 监听 0.0.0.0:${PORT}`);
  // 启动即预热，避免第一个请求等待加载
  getExtractor().catch(() => {});
});
