import { getCurrentUser } from "@/lib/session";
import {
  deleteConversation,
  getConversation,
  renameConversation,
  toUIMessages,
} from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const data = await getConversation(user.id, id);
  if (!data) return Response.json({ error: "会话不存在" }, { status: 404 });

  return Response.json({
    conversation: {
      id: data.conversation.id,
      sceneId: data.conversation.sceneId,
      title: data.conversation.title,
      updatedAt: data.conversation.updatedAt.toISOString(),
    },
    messages: toUIMessages(data.messages),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  let title = "";
  try {
    const body = (await req.json()) as { title?: string };
    title = (body.title || "").trim();
  } catch {
    /* ignore */
  }
  if (!title) return Response.json({ error: "标题不能为空" }, { status: 400 });

  const ok = await renameConversation(user.id, id, title);
  if (!ok) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const ok = await deleteConversation(user.id, id);
  if (!ok) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
