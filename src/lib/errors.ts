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
