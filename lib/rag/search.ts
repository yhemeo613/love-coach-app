/**
 * 原文检索（RAG）主流程：向量召回 + 词法召回 → RRF 融合 → 去重 → LLM 重排。
 *
 * 数据流：
 *   用户问题 ──embed 服务(bge-small-zh)──▶ 512 维查询向量
 *        ├─ 向量召回：pgvector 精确 KNN（9 千级片段下召回率 100%）top 24
 *        └─ 词法召回：字级 n-gram BM25 全量扫描 top 24
 *        └─ RRF 融合 → 3-gram 去重 → LLM（默认模型）重排选 5 → 返回带出处片段
 *
 * 降级策略：embed 服务不可用时退化为纯词法检索；重排失败时保留融合排序。
 * 检索结果始终带书名与章节，供回答时标注出处。
 */
import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { createStructuredModel, defaultModel } from "@/lib/ai/provider";
import {
  dedupeNear,
  lexicalRank,
  rrfFuse,
  type RagRow,
  type RankedRow,
} from "./ranking";

export interface SearchHit {
  book: string;
  heading: string;
  text: string;
  score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** 实际使用的通道：hybrid（向量+词法）/ lexical（纯词法）/ unavailable */
  mode: "hybrid" | "lexical" | "unavailable";
  reranked: boolean;
  error?: string;
}

const DENSE_TOPK = 24;
const LEXICAL_TOPK = 24;
const RERANK_CANDIDATES = 12;

/* ---------------- 查询向量 ---------------- */

async function embedQuery(query: string): Promise<number[] | null> {
  const base = (process.env.EMBED_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: [query], query: true }),
      signal: AbortSignal.timeout(Number(process.env.EMBED_TIMEOUT_MS || 15000)),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { vectors?: unknown };
    const vector = Array.isArray(data.vectors) ? data.vectors[0] : null;
    return Array.isArray(vector) ? (vector as number[]) : null;
  } catch (error) {
    console.error("[rag] 查询向量化失败，退化为词法检索", error);
    return null;
  }
}

/* ---------------- 向量召回（pgvector 精确 KNN） ---------------- */

interface DenseRow {
  id: string;
  book: string;
  heading: string;
  chunkIndex: number;
  text: string;
  sim: number | string;
}

async function denseSearch(
  vector: number[],
  book: string | undefined,
  topK: number,
): Promise<RankedRow[]> {
  const literal = `[${vector.join(",")}]`;
  const rows = book
    ? await prisma.$queryRaw<DenseRow[]>`
        SELECT id, book, heading, "chunkIndex", text,
               1 - (embedding <=> ${literal}::vector) AS sim
        FROM rag_chunk
        WHERE book ILIKE ${`%${book}%`}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${topK}`
    : await prisma.$queryRaw<DenseRow[]>`
        SELECT id, book, heading, "chunkIndex", text,
               1 - (embedding <=> ${literal}::vector) AS sim
        FROM rag_chunk
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${topK}`;

  return rows.map((row) => ({
    row: {
      id: row.id,
      book: row.book,
      heading: row.heading,
      chunkIndex: row.chunkIndex,
      text: row.text,
      sim: Number(row.sim),
    },
    score: Number(row.sim),
  }));
}

/* ---------------- 词法召回（片段表常驻内存） ---------------- */

const CACHE_TTL_MS = 10 * 60 * 1000;
const globalForRag = globalThis as unknown as {
  __ragCorpusCache?: { at: number; rows: RagRow[] };
};

async function loadLexicalCorpus(): Promise<RagRow[]> {
  const cached = globalForRag.__ragCorpusCache;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
  const rows = await prisma.$queryRaw<RagRow[]>`
    SELECT id, book, heading, "chunkIndex", text FROM rag_chunk`;
  globalForRag.__ragCorpusCache = { at: Date.now(), rows };
  return rows;
}

function bookMatches(rowBook: string, filter: string): boolean {
  const compact = (s: string): string => s.toLowerCase().replace(/[\s\p{P}]+/gu, "");
  const a = compact(rowBook);
  const b = compact(filter);
  return a.includes(b) || b.includes(a);
}

/* ---------------- LLM 重排 ---------------- */

function rerankEnabled(): boolean {
  return process.env.RAG_RERANK !== "0";
}

async function llmRerank(
  query: string,
  candidates: RankedRow[],
  limit: number,
  userId: string,
): Promise<{ rows: RankedRow[]; ok: boolean }> {
  const pool = candidates.slice(0, RERANK_CANDIDATES);
  if (!rerankEnabled() || pool.length <= limit) {
    return { rows: candidates.slice(0, limit), ok: false };
  }

  const list = pool
    .map(
      (candidate, index) =>
        `[${index}] 《${candidate.row.book}》${candidate.row.heading ? ` · ${candidate.row.heading}` : ""}\n${candidate.row.text.slice(0, 180)}`,
    )
    .join("\n\n");

  const prompt = [
    "你是检索结果重排器。下面是用户问题和若干候选原文片段。",
    `用户问题：${query}`,
    "",
    "候选片段：",
    list,
    "",
    `请挑出最能直接支撑回答该问题的片段，按相关性从高到低排列，最多 ${limit} 个。`,
    '只输出 JSON：{"ids":[...]}，不要输出其他内容。',
  ].join("\n");

  try {
    const { text } = await generateText({
      model: createStructuredModel(defaultModel(), { userId }),
      prompt,
      temperature: 0,
      maxOutputTokens: 128,
      abortSignal: AbortSignal.timeout(Number(process.env.RAG_RERANK_TIMEOUT_MS || 9000)),
    });
    const parsed = JSON.parse(text) as { ids?: unknown };
    const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
    const seen = new Set<number>();
    const picked: RankedRow[] = [];
    for (const raw of ids) {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= pool.length || seen.has(index)) continue;
      seen.add(index);
      picked.push(pool[index]);
      if (picked.length >= limit) break;
    }
    if (picked.length === 0) return { rows: candidates.slice(0, limit), ok: false };
    // 重排结果之后，用融合排序补齐，保证条数稳定
    const rest = candidates.filter((candidate) => !seen.has(pool.indexOf(candidate)));
    const merged = [...picked];
    for (const candidate of rest) {
      if (merged.length >= limit) break;
      if (!merged.some((item) => item.row.id === candidate.row.id)) merged.push(candidate);
    }
    return { rows: merged, ok: true };
  } catch (error) {
    console.error("[rag] LLM 重排失败，保留融合排序", error);
    return { rows: candidates.slice(0, limit), ok: false };
  }
}

/* ---------------- 主入口 ---------------- */

export async function searchCorpus(
  query: string,
  options: { book?: string; limit?: number; userId?: string } = {},
): Promise<SearchResult> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const trimmed = query.trim();
  if (!trimmed) {
    return { hits: [], mode: "unavailable", reranked: false, error: "查询为空" };
  }

  const bookFilter = options.book?.trim() || undefined;

  try {
    const vector = await embedQuery(trimmed);

    const [dense, corpus] = await Promise.all([
      vector ? denseSearch(vector, bookFilter, DENSE_TOPK) : Promise.resolve([] as RankedRow[]),
      loadLexicalCorpus(),
    ]);

    const scoped = bookFilter ? corpus.filter((row) => bookMatches(row.book, bookFilter)) : corpus;
    const lexical = lexicalRank(trimmed, scoped, LEXICAL_TOPK);

    const fused = rrfFuse([dense, lexical]);
    const deduped = dedupeNear(fused);
    if (deduped.length === 0) {
      return { hits: [], mode: vector ? "hybrid" : "lexical", reranked: false };
    }

    const { rows, ok } = await llmRerank(trimmed, deduped, limit, options.userId ?? "anonymous");

    return {
      hits: rows.slice(0, limit).map((item) => ({
        book: item.row.book,
        heading: item.row.heading,
        text: item.row.text,
        score: Math.round(item.score * 1000) / 1000,
      })),
      mode: vector ? "hybrid" : "lexical",
      reranked: ok,
    };
  } catch (error) {
    console.error("[rag] 检索失败", error);
    return {
      hits: [],
      mode: "unavailable",
      reranked: false,
      error: error instanceof Error ? error.message : "检索失败",
    };
  }
}
