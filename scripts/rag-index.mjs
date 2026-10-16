#!/usr/bin/env node
/**
 * 语料索引：分块（lib/rag/corpus.ts）→ 调 embed 服务向量化 → 写入 pgvector。
 *
 * 幂等：以片段内容哈希为主键，语料不变时重复执行只做一次比对，不会重复向量化；
 * 语料变更时只向量化新增片段，并清理已失效的旧片段。
 *
 * 用法：node scripts/rag-index.mjs
 * 环境：DATABASE_URL（必填）、EMBED_URL（默认 http://127.0.0.1:8080）
 */
try {
  await import("dotenv/config");
} catch {
  // 容器内环境变量由 compose 注入，无需 dotenv
}

import pg from "pg";
import { buildCorpusChunks } from "../lib/rag/corpus.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const EMBED_URL = (process.env.EMBED_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const BATCH = Math.max(1, Number(process.env.RAG_INDEX_BATCH || 24));
const EMBED_TEXT_MAX = Math.max(200, Number(process.env.RAG_EMBED_TEXT_MAX || 1200));

if (!DATABASE_URL) {
  console.error("[rag-index] 缺少 DATABASE_URL");
  process.exit(1);
}

/** 向量化文本 = 书名 + 章节 + 正文（带上下文标题的向量语义更准） */
function embedTextFor(chunk) {
  const head = `《${chunk.book}》${chunk.heading ? ` ${chunk.heading}` : ""}`;
  return `${head}\n${chunk.text}`.slice(0, EMBED_TEXT_MAX);
}

async function waitForEmbed() {
  const deadline = Date.now() + Number(process.env.RAG_EMBED_WAIT_MS || 120000);
  for (;;) {
    try {
      const res = await fetch(`${EMBED_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ready) return;
      }
    } catch {
      // 服务未就绪，继续等
    }
    if (Date.now() > deadline) {
      throw new Error(`等待嵌入服务超时（${EMBED_URL}）。请确认 embed 服务已启动。`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function embedBatch(texts) {
  const res = await fetch(`${EMBED_URL}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    throw new Error(`嵌入服务返回 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.vectors) || data.vectors.length !== texts.length) {
    throw new Error("嵌入服务返回的向量数量与输入不符");
  }
  return data.vectors;
}

async function upsertBatch(client, batch, vectors) {
  const params = [];
  const tuples = [];
  batch.forEach((chunk, index) => {
    const base = index * 7;
    params.push(
      chunk.id,
      chunk.book,
      chunk.heading,
      chunk.chunkIndex,
      chunk.offset,
      chunk.text,
      `[${vectors[index].join(",")}]`,
    );
    tuples.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::vector, now())`,
    );
  });
  await client.query(
    `INSERT INTO rag_chunk (id, book, heading, "chunkIndex", "offset", text, embedding, "updatedAt")
     VALUES ${tuples.join(", ")}
     ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = now()`,
    params,
  );
}

async function main() {
  const started = Date.now();
  const chunks = buildCorpusChunks();
  console.log(`[rag-index] 语料分块：${chunks.length} 个片段`);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const existing = new Set(
      (await client.query("SELECT id FROM rag_chunk")).rows.map((row) => row.id),
    );
    const current = new Set(chunks.map((chunk) => chunk.id));
    const todo = chunks.filter((chunk) => !existing.has(chunk.id));
    const stale = [...existing].filter((id) => !current.has(id));

    if (stale.length > 0) {
      await client.query("DELETE FROM rag_chunk WHERE id = ANY($1::text[])", [stale]);
      console.log(`[rag-index] 清理失效片段：${stale.length} 条`);
    }
    console.log(`[rag-index] 已有 ${existing.size} 条，本次需向量化 ${todo.length} 条`);

    if (todo.length > 0) {
      await waitForEmbed();
      let done = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const vectors = await embedBatch(batch.map(embedTextFor));
        await upsertBatch(client, batch, vectors);
        done += batch.length;
        const percent = ((done / todo.length) * 100).toFixed(1);
        if (done % (BATCH * 4) === 0 || done === todo.length) {
          console.log(`[rag-index] 进度 ${done}/${todo.length}（${percent}%）`);
        }
      }
    }

    const total = await client.query("SELECT count(*)::int AS n FROM rag_chunk");
    console.log(
      `[rag-index] 完成：库内共 ${total.rows[0].n} 个片段，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[rag-index] 失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
