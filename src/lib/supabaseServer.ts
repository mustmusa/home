import { createClient, SupabaseClient } from "@supabase/supabase-js";

// عميل Supabase بصلاحية service role — يُستخدم فقط داخل مسارات API على السيرفر
// (لا يصل أبدًا إلى المتصفح). نتولى التحقق من الصلاحيات يدويًا في كل مسار عبر session.ts
let cached: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "متغيرات البيئة NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY غير مضبوطة",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
