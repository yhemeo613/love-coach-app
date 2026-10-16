-- RAG 原文检索：启用 pgvector 并建立片段表
-- 说明：9 千余条 512 维向量下用精确 KNN（无 HNSW 索引）即可，
-- 召回率 100%，单次检索毫秒级；语料规模增长 10 倍后再考虑加索引。
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "rag_chunk" (
    "id" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "heading" TEXT NOT NULL DEFAULT '',
    "chunkIndex" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(512) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_chunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rag_chunk_book_idx" ON "rag_chunk"("book");
