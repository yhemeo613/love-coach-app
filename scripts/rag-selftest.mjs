#!/usr/bin/env node
/**
 * 语料分块自检（CI 用，无需数据库与模型，秒级）：
 * 断言分块结果的关键不变量，防止改动分块/语料后出现静默劣化
 * （例如目录页混入、碎片化、某本书整体丢失）。
 *
 * 用法：node scripts/rag-selftest.mjs
 */
import { buildCorpusChunks, listCorpusFiles } from "../lib/rag/corpus.ts";

const MIN_CHUNKS = 8000;
const MAX_CHUNKS = 11000;
const MIN_PER_BOOK = 3;
const MIN_AVG_LEN = 400;
const MAX_AVG_LEN = 900;
const MAX_CHUNK_LEN = 2500;
const MAX_TOC_RATIO = 0.05; // 点线导引（目录）残留比例上限

const files = listCorpusFiles();
const chunks = buildCorpusChunks();
const failures = [];

function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

check("书目数量", files.length >= 50, `${files.length} 本`);

const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
const avgLen = chunks.length ? Math.round(totalChars / chunks.length) : 0;
check("片段总数", chunks.length >= MIN_CHUNKS && chunks.length <= MAX_CHUNKS, `${chunks.length} 个`);
check("平均片段长度", avgLen >= MIN_AVG_LEN && avgLen <= MAX_AVG_LEN, `${avgLen} 字`);

const empty = chunks.filter((c) => c.text.trim().length === 0);
check("无空片段", empty.length === 0, `${empty.length} 个`);

const tooLong = chunks.filter((c) => c.text.length > MAX_CHUNK_LEN);
check("无超长片段", tooLong.length === 0, `${tooLong.length} 个（上限 ${MAX_CHUNK_LEN} 字）`);

const perBook = new Map();
for (const chunk of chunks) perBook.set(chunk.book, (perBook.get(chunk.book) ?? 0) + 1);
const missing = files.filter((f) => (perBook.get(f.book) ?? 0) < MIN_PER_BOOK);
check("每本书都有内容", missing.length === 0, missing.length ? `缺内容的书: ${missing.map((f) => f.book).join("、")}` : "");

const tocLike = chunks.filter((c) => /[.．·…]{8,}/.test(c.text));
const tocRatio = chunks.length ? tocLike.length / chunks.length : 0;
check("目录残留比例", tocRatio <= MAX_TOC_RATIO, `${(tocRatio * 100).toFixed(1)}%（${tocLike.length} 个片段含点线导引）`);

const withHeading = chunks.filter((c) => c.heading).length;
const headingRatio = chunks.length ? withHeading / chunks.length : 0;
check("标题覆盖率", headingRatio >= 0.5, `${(headingRatio * 100).toFixed(1)}% 的片段带章节出处`);

console.log(
  `\n统计：${files.length} 本书 → ${chunks.length} 个片段，共 ${totalChars.toLocaleString()} 字，平均 ${avgLen} 字/片段`,
);

if (failures.length > 0) {
  console.error(`\n自检未通过：${failures.join("；")}`);
  process.exit(1);
}
console.log("\n语料分块自检通过");
