import { tool } from "ai";
import { z } from "zod";
import { rememberFact } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { searchCorpus } from "@/lib/rag/search";
import { scenes } from "@/lib/scenes";

/** 从场景提示词中抽出「方法要点」段落，作为可检索知识 */
function sceneMethod(systemPrompt: string): string {
  const after = systemPrompt.split("## 这个场景的方法要点")[1] ?? "";
  const before = after.split("## 用户通常这样描述自己的问题")[0] ?? after;
  return before.trim();
}

interface KnowledgeEntry {
  code: string;
  name: string;
  tagline: string;
  focus: string[];
  sources: string[];
  method: string;
  haystack: string;
}

const KNOWLEDGE: KnowledgeEntry[] = scenes.map((scene) => {
  const method = sceneMethod(scene.systemPrompt);
  return {
    code: scene.code,
    name: scene.name,
    tagline: scene.tagline,
    focus: scene.focus,
    sources: scene.sources,
    method,
    haystack: [scene.code, scene.name, scene.tagline, scene.description, ...scene.focus, ...scene.sources, method]
      .join(" ")
      .toLowerCase(),
  };
});

/** 中英混排的轻量打分：命中关键词 + 双字组重叠 */
function score(query: string, entry: KnowledgeEntry): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let s = 0;
  for (const term of entry.focus) {
    if (q.includes(term.toLowerCase())) s += 6;
  }
  if (q.includes(entry.code.toLowerCase())) s += 8;
  if (q.includes(entry.name.toLowerCase())) s += 8;

  const bigrams = new Set<string>();
  for (let i = 0; i < q.length - 1; i += 1) bigrams.add(q.slice(i, i + 2));
  for (const gram of bigrams) {
    if (gram.trim().length < 2) continue;
    if (entry.haystack.includes(gram)) s += 1;
  }
  return s;
}

export function searchScenes(query: string, limit = 2) {
  return KNOWLEDGE.map((entry) => ({ entry, s: score(query, entry) }))
    .filter((item) => item.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ entry }) => ({
      code: entry.code,
      name: entry.name,
      tagline: entry.tagline,
      focus: entry.focus,
      sources: entry.sources,
      method: entry.method.slice(0, 1500),
    }));
}

const SUPPORT_RESOURCES = [
  "全国心理援助热线：12356（24 小时）",
  "如涉及人身威胁或暴力，请优先联系当地公安机关并告知可信任的人",
  "持续的情绪困扰可寻求线下心理咨询；本服务不提供诊断",
];

/**
 * 教练工具集。
 * 每个工具都有真实副作用或真实数据来源，不做「假装有功能」的摆设。
 */
export function createCoachTools({ userId, conversationId }: { userId: string; conversationId?: string }) {
  return {
    search_books: tool({
      description:
        "检索 56 本原著全文（语义 + 词法双路召回、LLM 重排）。" +
        "当用户的问题涉及具体方法、判断标准、术语、话术，或你需要在回答中引用原文依据时调用。" +
        "返回的是带出处的原文片段，引用只能来自返回结果，不要编造书名、章节或页码。",
      inputSchema: z.object({
        query: z
          .string()
          .describe("检索词：用户原话、场景或方法名，例如「已读不回」「邀约 决策成本」「上堆 下切」"),
        book: z
          .string()
          .optional()
          .describe("可选：限定在某本书内检索（书名关键词即可，如「魔鬼约会学」）"),
        limit: z.number().int().min(1).max(6).optional().describe("返回片段数，默认 4"),
      }),
      execute: async ({ query, book, limit }) => {
        const result = await searchCorpus(query, { book, limit: limit ?? 4, userId });
        if (result.hits.length === 0) {
          return {
            matched: 0,
            results: [],
            hint: result.error
              ? `检索服务不可用（${result.error}）。可以基于通用教练知识回答，但不要伪造原文引用，并如实说明暂时无法查证原文。`
              : "原文没有直接命中。换更短、更具体的关键词再检索一次（例如只留核心名词或用户原话）。仍无命中就明确告诉用户「语料里没有直接依据」，不要编造书名、章节或页码。",
          };
        }
        return {
          matched: result.hits.length,
          mode: result.mode,
          reranked: result.reranked,
          results: result.hits.map((hit) => ({
            book: hit.book,
            section: hit.heading,
            excerpt: hit.text,
            score: hit.score,
          })),
          hint: "引用出处用「《书名》· 章节」的形式，不要补充页码；观点用你自己的话概括，最多一两句直引，不要把整段原文抄给用户。",
        };
      },
    }),

    search_scenes: tool({
      description:
        "检索十一个教练场景（S0-S10）的方法要点，用于「用户的问题其实属于另一个阶段」时跨场景定位。" +
        "注意：需要原文依据或具体话术时用 search_books，这个工具只给场景级方法概要。",
      inputSchema: z.object({
        query: z.string().describe("用户的问题或关键词，例如「约不出来」「已读不回」"),
      }),
      execute: async ({ query }) => {
        const matches = searchScenes(query, 2);
        return {
          matched: matches.length,
          results: matches,
          hint:
            matches.length === 0
              ? "没有直接命中的场景，按你自己的教练知识回答，不要编造出处。"
              : "引用时请给出场景代号与要点，不要虚构书目或页码。",
        };
      },
    }),

    save_action_plan: tool({
      description:
        "把给用户的建议固化成一份可执行的行动清单，用户之后能在「我的清单」中查看。当回答中包含 2 条以上具体动作时调用。",
      inputSchema: z.object({
        title: z.string().describe("清单标题，例如「本周聊天练习」"),
        steps: z
          .array(
            z.object({
              action: z.string().describe("具体动作，必须是明天就能做的"),
              when: z.string().optional().describe("建议时间，例如「本周内」"),
            }),
          )
          .min(1)
          .max(8),
      }),
      execute: async ({ title, steps }) => {
        const plan = await prisma.actionPlan.create({
          data: {
            userId,
            conversationId: conversationId ?? null,
            title,
            steps,
          },
        });
        return { planId: plan.id, title: plan.title, stepCount: steps.length };
      },
    }),

    set_followup_reminder: tool({
      description:
        "为用户设置一次跟进提醒（例如「三天后记录她是否主动开启话题」）。仅当用户明确需要后续跟进或主动要求提醒时调用。",
      inputSchema: z.object({
        title: z.string().describe("提醒标题"),
        dueAt: z.string().describe("ISO 8601 时间，例如 2026-10-20T20:00:00+08:00"),
        note: z.string().optional().describe("提醒备注：到时该记录什么、该做什么"),
      }),
      execute: async ({ title, dueAt, note }) => {
        const parsed = new Date(dueAt);
        if (Number.isNaN(parsed.getTime())) {
          return { ok: false, error: "时间格式无法解析，请使用 ISO 8601 格式。" };
        }
        const reminder = await prisma.reminder.create({
          data: {
            userId,
            conversationId: conversationId ?? null,
            title,
            note: note ?? null,
            dueAt: parsed,
          },
        });
        return { ok: true, reminderId: reminder.id, dueAt: parsed.toISOString() };
      },
    }),

    remember_about_user: tool({
      description:
        "把用户明确希望你记住的事实写入长期记忆（跨会话生效）。仅在用户主动要求记住、或纠正一个已写入的事实、或陈述了长期有效的重要背景时调用。" +
        "不要把临时安排、单次情绪写进来，这些用 set_followup_reminder。",
      inputSchema: z.object({
        key: z
          .string()
          .describe("事实键，2-8 个汉字的稳定短语，如「年龄职业」「关系阶段」「目标对象」「禁忌」"),
        value: z.string().describe("事实内容，一句话说清楚，例如「26 岁，程序员，母胎单身」"),
      }),
      execute: async ({ key, value }) => {
        const saved = await rememberFact({
          userId,
          conversationId,
          key,
          value,
        });
        if (!saved) return { ok: false, error: "key 或 value 为空，未写入。" };
        return { ok: true, ...saved, note: "已写入长期记忆，之后的对话都会带上这条信息。" };
      },
    }),

    get_user_context: tool({
      description:
        "读取该用户的近期情况：长期记忆、历史对话主题、未完成的行动清单、待办提醒。当用户问「我之前跟你说过」「我上次的情况」或需要延续上一次建议时调用。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(10).optional().describe("取最近几条对话，默认 5"),
      }),
      execute: async ({ limit }) => {
        const take = limit ?? 5;
        const [conversations, plans, reminders, memories] = await Promise.all([
          prisma.conversation.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take,
            select: {
              id: true,
              title: true,
              sceneId: true,
              updatedAt: true,
              _count: { select: { messages: true } },
            },
          }),
          prisma.actionPlan.findMany({
            where: { userId, status: "open" },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, title: true, steps: true, createdAt: true },
          }),
          prisma.reminder.findMany({
            where: { userId, status: "pending" },
            orderBy: { dueAt: "asc" },
            take: 5,
            select: { id: true, title: true, dueAt: true },
          }),
          prisma.userMemory.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 30,
            select: { key: true, value: true, updatedAt: true },
          }),
        ]);

        return {
          longTermMemories: memories.map((memory) => ({
            key: memory.key,
            value: memory.value,
            updatedAt: memory.updatedAt.toISOString(),
          })),
          conversations: conversations.map((c) => ({
            id: c.id,
            title: c.title,
            scene: c.sceneId,
            messages: c._count.messages,
            updatedAt: c.updatedAt.toISOString(),
          })),
          openPlans: plans.map((p) => ({ id: p.id, title: p.title, steps: p.steps })),
          pendingReminders: reminders.map((r) => ({
            id: r.id,
            title: r.title,
            dueAt: r.dueAt.toISOString(),
          })),
        };
      },
    }),

    escalate_to_support: tool({
      description:
        "当用户描述自己被操控、被持续贬低、被反复拉扯，或出现自我价值崩塌、安全风险时调用，切换到支持模式并给出求助资源。",
      inputSchema: z.object({
        situation: z.string().describe("一句话概括用户处境，用于记录"),
        riskLevel: z.enum(["low", "medium", "high"]).describe("自评风险等级"),
      }),
      execute: async ({ situation, riskLevel }) => ({
        mode: "support",
        riskLevel,
        situation,
        resources: SUPPORT_RESOURCES,
        guidance: [
          "先做情绪确认，不做技巧分析，不评价用户「也有问题」",
          "指出可识别的模式（忽冷忽热、贬低、隔离、责任转移、去同意化）",
          "给出自我保护动作：留证据、拉开距离、告知可信任的人、设定明确边界",
          riskLevel === "high"
            ? "风险较高：第一句先讲安全与求助资源，并建议线下专业支持"
            : "若持续困扰，建议寻求线下专业支持",
        ],
      }),
    }),
  };
}

export type CoachTools = ReturnType<typeof createCoachTools>;
