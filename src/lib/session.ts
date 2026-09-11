import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import type { SessionPayload } from "./types";

/** يُستخدم داخل مسارات API ومكونات السيرفر لقراءة جلسة المستخدم الحالي */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
