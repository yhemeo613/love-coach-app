import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/chat" : "/login");
}
