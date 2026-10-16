import type { UIMessage } from "ai";

/** 本地保存的会话记录（消息主体沿用 AI SDK 的 UIMessage parts 结构） */
export interface StoredConversation {
  id: string;
  sceneId: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
}

/** 从 UIMessage 中提取纯文本（只取 text part） */
export function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}
