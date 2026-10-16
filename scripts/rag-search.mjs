#!/usr/bin/env node
/**
 * 检索质量验证 CLI：与线上同一条检索链路（向量 + 词法 → RRF → 去重），
 * 只是省略了 LLM 重排，便于人工核对召回结果。
 *
 * 用法：
 *   node scripts/rag-search.mjs "已读不回 要不要继续发"
 *   node scripts/rag-search.mjs "邀约 决策成本" --book 魔鬼约会学
 */
try {
  await import("dotenv/config");
} catch {
  // 容器内环境变量由 compose 注入
}

import pg from "pg";
import { dedupeNear, lexicalRank, rrfFuse } from "../lib/rag/ranking.ts";

const args = process.argv.slice(2);
const bookIndex = args.indexOf("--book");
const bookFilter = bookIndex >= 0 ? args[bookIndex + 1] : undefined;
// 注意：bookIndex 为 -1 时不能按索引过滤，否则会把第一个参数（查询词）也丢掉
const query = args
  .filter((_, i) => bookIndex < 0 || (i !== bookIndex && i !== bookIndex + 1))
  .join(" ")
  .trim();

const DATABASE_URL = process.env.DATABASE_URL;
const EMBED_URL = (process.env.EMBED_URL || "").replace(/\/+$/, "");
const TOPK = 24;

if (!query) {
  console.error('用法：node scripts/rag-search.mjs "查询词" [--book 书名关键词]');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const compact = (s) => s.toLowerCase().replace(/[\s\p{P}]+/gu, "");
const bookMatches = (rowBook, filter) =>
  compact(rowBook).includes(compact(filter)) || compact(filter).includes(compact(rowBook));

async function embedQuery(text) {
  if (!EMBED_URL) return null;
  try {
    const res = await fetch(`${EMBED_URL}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: [text], query: true }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.vectors?.[0]) ? data.vectors[0] : null;
  } catch {
    return null;
  }
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const all = (
  await client.query('SELECT id, book, heading, "chunkIndex", text FROM rag_chunk ORDER BY book, "chunkIndex"')
).rows;
const scoped = bookFilter ? all.filter((row) => bookMatches(row.book, bookFilter)) : all;
console.log(`片段库：${all.length} 条${bookFilter ? `（限定书名「${bookFilter}」后 ${scoped.length} 条）` : ""}`);
console.log(`查询：${query}\n`);

const t0 = Date.now();
const vector = await embedQuery(query);
const tEmbed = Date.now() - t0;

const t1 = Date.now();
let dense = [];
if (vector) {
  const literal = `[${vector.join(",")}]`;
  const sql = bookFilter
    ? `SELECT id, book, heading, "chunkIndex", text, 1 - (embedding <=> $1::vector) AS sim
       FROM rag_chunk WHERE book ILIKE $2 ORDER BY embedding <=> $1::vector LIMIT ${TOPK}`
    : `SELECT id, book, heading, "chunkIndex", text, 1 - (embedding <=> $1::vector) AS sim
       FROM rag_chunk ORDER BY embedding <=> $1::vector LIMIT ${TOPK}`;
  const params = bookFilter ? [literal, `%${bookFilter}%`] : [literal];
  dense = (await client.query(sql, params)).rows.map((row) => ({
    row: { ...row, sim: Number(row.sim) },
    score: Number(row.sim),
  }));
}
const tDense = Date.now() - t1;

const t2 = Date.now();
const lexical = lexicalRank(query, scoped, TOPK);
const tLex = Date.now() - t2;

const fused = dedupeNear(rrfFuse([dense, lexical]));
await client.end();

console.log(
  `耗时：embed ${tEmbed}ms | 向量 ${tDense}ms | 词法 ${tLex}ms | 融合后候选 ${fused.length} 条` +
    (vector ? "" : "（embed 服务不可用，仅词法）"),
);
console.log("\n融合结果前 8 条：");
fused.slice(0, 8).forEach((item, index) => {
  const denseRank = dense.findIndex((d) => d.row.id === item.row.id);
  const lexRank = lexical.findIndex((l) => l.row.id === item.row.id);
  const mark = (r) => (r >= 0 ? `#${r + 1}` : "—");
  console.log(
    `\n${String(index + 1).padStart(2)}. 《${item.row.book}》${item.row.heading ? ` · ${item.row.heading}` : ""}` +
      ` （向量 ${mark(denseRank)} / 词法 ${mark(lexRank)}，rrf=${item.score.toFixed(4)}）`,
  );
  console.log(`    ${item.row.text.slice(0, 110).replace(/\n/g, " ")}...`);
});
