/**
 * 语料分块：把 data/corpus/*.txt（56 本原著全文）切成带出处的检索单元。
 *
 * 语料特点决定分块策略（来自 love-skills 的提取审计）：
 *  - 不同书来自不同提取器：有的每段一行（长行），有的是硬换行（每行 40–60 字），
 *    所以不能按行切 —— 要先按句末标点把行合并回段落；
 *  - 每本书开头常有一份「目录」（几十行连续短行，形如「第三章　约会的技巧」+ 小节名），
 *    必须整体丢弃：目录行关键词密度极高，会污染检索排序。
 *    判据：某行是短行、无句末标点，且该行文本在书的后文里再次出现（目录是正文标题的复述）；
 *  - 章节标题通常独立成行，作为片段出处（heading），随片段一起返回。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface Chunk {
  /** 内容哈希：book + offset + text，语料不变则稳定，用于幂等重建 */
  id: string;
  book: string;
  heading: string;
  chunkIndex: number;
  /** 片段起始在书中的字符位置（近似值，供排序与去重） */
  offset: number;
  text: string;
}

/** 片段目标长度（字符）。中文一个字约一个 token，700 字约 700 token，留足上下文余量。 */
const TARGET = 700;
/** 段落合并的硬上限，超过就先按句切开 */
const MAX_PARA = 1100;
/** 片段重叠：把上一片段的最后一段带入下一片段，避免答案跨在边界上 */
const OVERLAP_MAX = 260;

const END_PUNCT = /[。！？!?…][”』"')）】]?$/;
const CHAPTER_RE = /^第\s*[0-9一二三四五六七八九十百零两]+\s*[章节讲部课篇回]/;
const NUM_HEAD_RE = /^[（(]?[0-9一二三四五六七八九十]{1,3}[）)、.．:：]/;
const CAPS_RE = /^[A-Z0-9][A-Z0-9 .,'&:;!?—\-]{2,28}$/;
const TOC_MARK_RE = /^(目\s*录|目\s*次|contents|table of contents)$/i;
/** 「目录 ......」这类带点线导引的标记行 */
const MARK_WITH_DOTS_RE = /(目\s*录|目\s*次|contents)\s*[.．·…]{3,}/i;
/** 点线导引（「引言...... 1」），目录行的强特征 */
const DOT_LEADER_RE = /[.．·…]{3,}/;
const CJK_RE = /[\u4e00-\u9fff]/;

export function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+$/gm, "");
}

/** 标题判定：短、无句末标点，且命中章节/编号/全大写模式 */
function isHeadingLine(line: string): boolean {
  if (line.length > 30) return false;
  if (END_PUNCT.test(line)) return false;
  return CHAPTER_RE.test(line) || NUM_HEAD_RE.test(line) || CAPS_RE.test(line);
}

/**
 * 目录识别，两条规则取并集：
 *  规则 1：「目录/目次」标记行之后，连续的短行块（≤40 字、无句末标点）整体丢弃；
 *  规则 2：连续 ≥4 行「短行 + 无句末标点 + 后文再次出现」判为目录
 *          （目录是正文标题的复述；覆盖没有「目录」标记的书）。
 *          「后文出现」按归一化后的文本比较：去掉点线导引与结尾页码，
 *          这样「引言...... 1」能和正文里的「引言」对上。
 */
function detectTocLines(lines: string[]): boolean[] {
  const drop = new Array<boolean>(lines.length).fill(false);

  // 规则 1：「目录」标记之后，一直丢弃到出现真正的正文长行
  //（目录项可能以「？」「！」结尾，所以不能拿句末标点当正文判据）
  for (let i = 0; i < lines.length; i += 1) {
    const isMarker = TOC_MARK_RE.test(lines[i]) || MARK_WITH_DOTS_RE.test(lines[i]);
    if (!isMarker) continue;
    drop[i] = true;
    let j = i + 1;
    const limit = Math.min(lines.length, i + 1 + 300);
    while (j < limit) {
      const line = lines[j];
      if (line.length >= 60 || (END_PUNCT.test(line) && line.length >= 30)) break;
      drop[j] = true;
      j += 1;
    }
    i = j - 1;
  }

  // 规则 2
  const key = (s: string): string =>
    s.replace(DOT_LEADER_RE, "").replace(/\s+/g, "").replace(/[0-9]{1,4}$/, "");
  const lastIndex = new Map<string, number>();
  lines.forEach((line, i) => lastIndex.set(key(line), i));

  const isTocish = (index: number): boolean => {
    if (drop[index]) return false;
    const line = lines[index];
    if (END_PUNCT.test(line)) return false;
    if (DOT_LEADER_RE.test(line)) return line.length <= 120; // 点线导引行必属目录
    if (line.length > 30) return false;
    return (lastIndex.get(key(line)) ?? index) > index; // 后文还出现过
  };

  let runStart = -1;
  for (let i = 0; i <= lines.length; i += 1) {
    const ok = i < lines.length && isTocish(i);
    if (ok) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) {
      if (i - runStart >= 4) {
        for (let j = runStart; j < i; j += 1) drop[j] = true;
      }
      runStart = -1;
    }
  }
  return drop;
}

/** 行合并：同为拉丁文时补空格，中文直接相接 */
function joinLines(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (!out) {
      out = line;
      continue;
    }
    const prevLatin = !CJK_RE.test(out.slice(-1));
    const currLatin = !CJK_RE.test(line[0]);
    out += prevLatin && currLatin ? ` ${line}` : line;
  }
  return out;
}

/** 按句末标点切成不超过 max 的片段（超长段落专用） */
function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[。！？!?…；;])/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > max && current) {
      out.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) out.push(current);
  return out;
}

function hash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 24);
}

/** 把一本书的全文切成片段 */
export function chunkBook(raw: string, book: string): Chunk[] {
  const lines = normalizeText(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const drop = detectTocLines(lines);

  const chunks: Chunk[] = [];
  let heading = "";
  let paraLines: string[] = [];
  let paraOffset = 0;
  let cursor = 0;

  let buf: { text: string; offset: number }[] = [];
  let bufLen = 0;
  let bufHeading = "";
  let chunkIndex = 0;
  let carry: { text: string; offset: number } | null = null;

  const flushChunk = () => {
    if (buf.length === 0) return;
    const text = buf.map((p) => p.text).join("\n\n");
    const offset = buf[0].offset;
    chunks.push({
      id: hash(`${book}\u0000${offset}\u0000${text}`),
      book,
      heading: bufHeading,
      chunkIndex: chunkIndex++,
      offset,
      text,
    });
    const last = buf[buf.length - 1];
    carry = buf.length > 1 && last.text.length <= OVERLAP_MAX ? last : null;
    buf = [];
    bufLen = 0;
    bufHeading = "";
  };

  const flushParagraph = () => {
    if (paraLines.length === 0) return;
    const paraText = joinLines(paraLines);
    const offset = paraOffset;
    paraLines = [];
    for (const piece of splitLongText(paraText, MAX_PARA)) {
      if (bufLen > 0 && bufLen + piece.length > TARGET) flushChunk();
      if (bufLen === 0) {
        if (carry) {
          buf.push(carry);
          bufLen += carry.text.length;
          carry = null;
        }
        bufHeading = heading;
      }
      buf.push({ text: piece, offset });
      bufLen += piece.length;
      if (bufLen >= TARGET) flushChunk();
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineOffset = cursor;
    cursor += line.length + 1;

    if (drop[i]) continue;

    if (isHeadingLine(line)) heading = line;
    // 独立短行（前后是长行）也当标题，作为出处记录；该行仍参与正文，不丢内容
    else if (
      line.length <= 24 &&
      !END_PUNCT.test(line) &&
      (i === 0 || lines[i - 1].length > 60) &&
      (i === lines.length - 1 || lines[i + 1].length > 60)
    ) {
      heading = line;
    }

    if (paraLines.length === 0) paraOffset = lineOffset;
    paraLines.push(line);
    const mergedLen = paraLines.reduce((sum, l) => sum + l.length, 0);
    if ((END_PUNCT.test(line) && mergedLen >= 40) || mergedLen >= MAX_PARA) {
      flushParagraph();
    }
  }

  flushParagraph();
  flushChunk();
  return chunks;
}

export interface CorpusFile {
  book: string;
  path: string;
}

/** 列出语料目录下的全部书（*.txt / *.md） */
export function listCorpusFiles(dir?: string): CorpusFile[] {
  const corpusDir = dir ?? path.join(process.cwd(), "data", "corpus");
  if (!fs.existsSync(corpusDir)) return [];
  return fs
    .readdirSync(corpusDir)
    .filter((name) => /\.(txt|md)$/i.test(name))
    .sort()
    .map((name) => ({
      book: name.replace(/\.(txt|md)$/i, ""),
      path: path.join(corpusDir, name),
    }));
}

/** 读取并切分整个语料目录 */
export function buildCorpusChunks(dir?: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of listCorpusFiles(dir)) {
    const raw = fs.readFileSync(file.path, "utf8");
    chunks.push(...chunkBook(raw, file.book));
  }
  return chunks;
}
