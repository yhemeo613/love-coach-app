import type { UIMessage } from "ai";
import { prisma } from "./prisma";

export interface ConversationSummary {
  id: string;
  sceneId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean || "新对话";
}

/** 把数据库里的消息行还原成 AI SDK 的 UIMessage，供 useChat 直接消费 */
export function toUIMessages(
  rows: Array<{ id: string; role: string; content: string; createdAt: Date }>,
): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    parts: [{ type: "text", text: row.content }],
  })) as UIMessage[];
}

export async function listConversations(userId: string, take = 40): Promise<ConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      sceneId: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sceneId: row.sceneId,
    title: row.title,
    messageCount: row._count.messages,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createConversation(userId: string, sceneId: string) {
  return prisma.conversation.create({
    data: { userId, sceneId, title: "新对话" },
    select: { id: true, sceneId: true, title: true, updatedAt: true },
  });
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, sceneId: true, title: true, updatedAt: true },
  });
  if (!conversation) return null;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return { conversation, messages };
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  const result = await prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  return result.count > 0;
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, userId },
    data: { title: title.slice(0, 60) },
  });
  return result.count > 0;
}

/**
 * 取得（或创建）会话，并把最新的用户消息落库。
 * 只落最后一条 user 消息，避免整段历史重复写入。
 */
export async function appendUserMessage(params: {
  userId: string;
  conversationId?: string;
  sceneId: string;
  content: string;
}): Promise<string> {
  const { userId, conversationId, sceneId, content } = params;

  let targetId = conversationId;
  if (targetId) {
    const exists = await prisma.conversation.findFirst({
      where: { id: targetId, userId },
      select: { id: true, _count: { select: { messages: true } } },
    });
    if (!exists) targetId = undefined;
    else if (exists._count.messages === 0) {
      await prisma.conversation.update({
        where: { id: exists.id },
        data: { sceneId, title: titleFrom(content) },
      });
    }
  }

  if (!targetId) {
    const created = await prisma.conversation.create({
      data: { userId, sceneId, title: titleFrom(content) },
      select: { id: true },
    });
    targetId = created.id;
  }

  // 同一条用户消息不重复写入（重试/重新生成场景）
  const last = await prisma.message.findFirst({
    where: { conversationId: targetId },
    orderBy: { createdAt: "desc" },
    select: { role: true, content: true },
  });
  if (!(last && last.role === "user" && last.content === content)) {
    await prisma.message.create({
      data: {
        conversationId: targetId,
        role: "user",
        content,
        charCount: content.length,
      },
    });
  }

  await prisma.conversation.update({
    where: { id: targetId },
    data: { updatedAt: new Date() },
  });

  return targetId;
}

export async function appendAssistantMessage(params: {
  conversationId: string;
  content: string;
  meta?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    toolCalls?: number;
  };
}): Promise<void> {
  const { conversationId, content, meta } = params;
  if (!content.trim()) return;

  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      charCount: content.length,
      model: meta?.model ?? null,
      promptTokens: meta?.promptTokens ?? null,
      completionTokens: meta?.completionTokens ?? null,
      cachedTokens: meta?.cachedTokens ?? null,
      reasoningTokens: meta?.reasoningTokens ?? null,
      toolCalls: meta?.toolCalls ?? 0,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}
