-- 对话记忆：会话滚动摘要 + 跨会话长期记忆
-- 设计参考 Mem0（事实级 ADD/UPDATE/DELETE）与 Letta/Zep 的分层记忆：
-- 窗口内逐字保留、窗口外压缩为摘要、稳定事实抽到 user_memory 跨会话复用。

ALTER TABLE "conversation" ADD COLUMN "summary" TEXT;
ALTER TABLE "conversation" ADD COLUMN "summarizedCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "user_memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_memory_userId_key_key" ON "user_memory"("userId", "key");
CREATE INDEX "user_memory_userId_updatedAt_idx" ON "user_memory"("userId", "updatedAt");

ALTER TABLE "user_memory" ADD CONSTRAINT "user_memory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
