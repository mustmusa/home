import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { homePathForRole } from "@/lib/auth";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? homePathForRole[session.role] : "/login");
}
