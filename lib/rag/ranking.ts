/**
 * 检索排序的纯函数集合（不依赖数据库与框架，便于 CLI 与测试直接调用）。
 *
 * 设计目标：在轻量模型（bge-small-zh int8）的前提下把正确率做高——
 *  - 词法召回用「字级 n-gram + BM25 饱和」：中文没有天然分词，
 *    2-gram/3-gram 能稳定命中术语与短语（「上堆」「已读不回」「决策成本」）；
 *  - 双路召回（向量 + 词法）用 RRF 名次融合：两路各自擅长不同的问题形态，
 *    融合比分值加权更稳（不需要校准两路分数）；
 *  - 3-gram Jaccard 去重：语料里存在重复译本，避免同一内容挤占上下文。
 */

export interface RagRow {
  id: string;
  book: string;
  heading: string;
  chunkIndex: number;
  text: string;
  /** 向量相似度（余弦，1 为最近），仅向量召回结果携带 */
  sim?: number;
}

export interface RankedRow {
  row: RagRow;
  score: number;
}

export interface Gram {
  text: string;
  weight: number;
}

/** 从查询里抽出检索单元：CJK 字级 n-gram + 拉丁词 */
export function buildQueryGrams(query: string): Gram[] {
  const normalized = query.normalize("NFKC").toLowerCase();
  const grams = new Map<string, number>();

  for (const run of normalized.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length <= 3) {
      grams.set(run, 3 + run.length);
      continue;
    }
    // 整段短语权重最高，再补 2/3-gram 兜底
    if (run.length <= 10) grams.set(run, run.length + 1);
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i + n <= run.length; i += 1) {
        const gram = run.slice(i, i + n);
        grams.set(gram, Math.max(grams.get(gram) ?? 0, n));
      }
    }
  }

  for (const word of normalized.match(/[a-z0-9][a-z0-9'’\-]{1,}/g) ?? []) {
    grams.set(word, Math.min(word.length, 6) + 1);
  }

  return [...grams.entries()]
    .map(([text, weight]) => ({ text, weight }))
    .sort((a, b) => b.weight - a.weight || (a.text < b.text ? -1 : 1))
    .slice(0, 48);
}

function countOccurrences(haystack: string, needle: string, cap: number): number {
  let count = 0;
  let from = 0;
  while (count < cap) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + 1;
  }
  return count;
}

/**
 * 词法召回（BM25 形式的饱和加权）。
 * 一次全量扫描计算 tf 与 df：9 千余片段、每条片段约 640 字，
 * 单次约 150–250ms，对一次对话检索可接受，换取 100% 的召回覆盖。
 */
export function lexicalRank(query: string, rows: RagRow[], topK: number): RankedRow[] {
  const grams = buildQueryGrams(query);
  if (grams.length === 0 || rows.length === 0) return [];

  const df = new Map<string, number>();
  const hits: Array<{ row: RagRow; counts: number[] }> = [];
  let totalLen = 0;

  for (const row of rows) {
    const hay = `${row.heading}\n${row.text}`;
    totalLen += hay.length;
    const counts: number[] = [];
    let any = false;
    for (const gram of grams) {
      const n = countOccurrences(hay, gram.text, 5);
      counts.push(n);
      if (n > 0) {
        any = true;
        df.set(gram.text, (df.get(gram.text) ?? 0) + 1);
      }
    }
    if (any) hits.push({ row, counts });
  }

  const N = rows.length;
  const avgLen = totalLen / N || 1;
  const k1 = 1.2;
  const b = 0.6;

  const ranked = hits.map(({ row, counts }) => {
    const hayLen = row.heading.length + 1 + row.text.length;
    let score = 0;
    let hitGrams = 0;
    for (let i = 0; i < grams.length; i += 1) {
      const tf = counts[i];
      if (tf === 0) continue;
      hitGrams += 1;
      const gram = grams[i];
      const docFreq = df.get(gram.text) ?? 1;
      const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
      score +=
        (gram.weight * idf * (tf * (k1 + 1))) /
        (tf + k1 * (1 - b + b * (hayLen / avgLen)));
    }
    // 覆盖度加成：命中越多不同检索单元，越可能真的相关
    const coverage = hitGrams / grams.length;
    score *= 0.6 + 0.6 * coverage;
    return { row, score };
  });

  ranked.sort((a, b2) => b2.score - a.score);
  return ranked.slice(0, topK);
}

/** Reciprocal Rank Fusion：按名次融合多路召回 */
export function rrfFuse(lists: RankedRow[][], k = 60, max = 40): RankedRow[] {
  const acc = new Map<string, RankedRow>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const add = 1 / (k + index + 1);
      const prev = acc.get(item.row.id);
      if (prev) prev.score += add;
      else acc.set(item.row.id, { row: item.row, score: add });
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, max);
}

function trigramSet(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= normalized.length; i += 1) grams.add(normalized.slice(i, i + 3));
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const gram of a) if (b.has(gram)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** 近似重复去重：内容高度重叠的片段只保留名次更靠前的一条 */
export function dedupeNear(candidates: RankedRow[], threshold = 0.55, max = 24): RankedRow[] {
  const kept: RankedRow[] = [];
  const sets: Set<string>[] = [];
  for (const candidate of candidates) {
    const grams = trigramSet(candidate.row.text.slice(0, 420));
    if (sets.some((existing) => jaccard(existing, grams) > threshold)) continue;
    sets.push(grams);
    kept.push(candidate);
    if (kept.length >= max) break;
  }
  return kept;
}
