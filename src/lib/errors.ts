/** يحوّل أي خطأ (Error، أو كائن خطأ من Supabase بدون toString مفيد، أو أي شيء آخر) لنص قابل للعرض */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * "TypeError: fetch failed" is what Node says when it could not open the
 * connection at all — a paused Supabase project, a wrong URL, a network
 * outage. On its own it tells the household nothing, so it is named.
 */
export function friendlyError(e: unknown): string {
  const raw = errorMessage(e);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(raw)) {
    return "تعذّر الاتصال بقاعدة البيانات. تأكد أن مشروع Supabase يعمل (قد يكون متوقفاً مؤقتاً) ثم أعد المحاولة.";
  }
  return raw;
}
