import type { Metadata } from "next";
import { ChatView } from "@/components/chat-view";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "对话",
};

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await requireUser("/login?next=/chat");

  return (
    <ChatView
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role,
      }}
    />
  );
}
