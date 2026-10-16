import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 列出长期记忆（用户自查：教练记住了我什么） */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const memories = await prisma.userMemory.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, key: true, value: true, updatedAt: true },
  });

  return Response.json({
    memories: memories.map((memory) => ({
      id: memory.id,
      key: memory.key,
      value: memory.value,
      updatedAt: memory.updatedAt.toISOString(),
    })),
  });
}

/** 删除一条（?id=）或全部（?all=1）长期记忆 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    const result = await prisma.userMemory.deleteMany({ where: { userId: user.id } });
    return Response.json({ ok: true, deleted: result.count });
  }

  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "缺少 id" }, { status: 400 });

  const result = await prisma.userMemory.deleteMany({ where: { id, userId: user.id } });
  return Response.json({ ok: true, deleted: result.count });
}
