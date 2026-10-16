import { getCurrentUser } from "@/lib/session";
import { createConversation, listConversations } from "@/lib/conversations";
import { scenes } from "@/lib/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const conversations = await listConversations(user.id);
  return Response.json({ conversations });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let sceneId = "free";
  try {
    const body = (await req.json()) as { sceneId?: string };
    if (body.sceneId && scenes.some((s) => s.id === body.sceneId)) sceneId = body.sceneId;
  } catch {
    /* 用默认场景 */
  }

  const conversation = await createConversation(user.id, sceneId);
  return Response.json({ conversation }, { status: 201 });
}
