import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { CATEGORIES } from "@/lib/types";
import { normalizeArabic } from "@/lib/arabicMatch";

export const maxDuration = 30;

const MALLS = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("متغير البيئة ANTHROPIC_API_KEY غير مضبوط على الخادم");
  cached = new Anthropic({ apiKey });
  return cached;
}

type Filters = {
  keywords?: string[];
  category?: string | null;
  mall?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minDiscount?: number | null;
  sort?: "discount" | "price" | null;
  explain?: string;
};

async function handle(req: NextRequest) {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { query } = await req.json();
  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "اكتب ما تبحث عنه" }, { status: 400 });
  }

  // The model turns the sentence into filters; the database does the search.
  // Sending it the whole offers table would cost orders of magnitude more.
  const message = await getClient().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `حوّل طلب المستخدم إلى فلاتر بحث في جدول عروض بقالة سعودية.

الطلب: "${query}"

التصنيفات المتاحة: ${CATEGORIES.join(" | ")}
المولات المتاحة: ${MALLS.join(" | ")}

أعد JSON فقط بهذا الشكل:
{
  "keywords": ["كلمات المنتج المراد البحث عنها في الاسم"],
  "category": "تصنيف من القائمة أو null",
  "mall": "مول من القائمة أو null",
  "minPrice": رقم أو null,
  "maxPrice": رقم أو null,
  "minDiscount": رقم أو null,
  "sort": "discount" أو "price" أو null,
  "explain": "جملة عربية قصيرة تشرح ما فهمته"
}

قواعد:
- keywords كلمات المنتج نفسه فقط، بلا صفات مثل "رخيص" أو "أفضل"
- "أرخص" أو "بأقل سعر" ← sort: "price"
- "أقوى خصم" أو "أكبر تخفيض" ← sort: "discount"
- "تحت 20" أو "بأقل من 20 ريال" ← maxPrice: 20
- إن كان الطلب عاماً بلا منتج محدد، اترك keywords فارغة واعتمد على category
- لا تخترع تصنيفاً أو مولاً خارج القائمتين`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let f: Filters;
  try {
    f = JSON.parse(text.trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: "تعذّر فهم الطلب" }, { status: 502 });
    f = JSON.parse(m[0]);
  }

  const db = supabaseServer();
  let q = db
    .from("offers")
    .select("id, mall, item_name, description, original_price, offer_price, discount_pct, category", {
      count: "exact",
    })
    .limit(100);

  for (const kw of (f.keywords ?? []).slice(0, 4)) {
    const n = normalizeArabic(String(kw));
    if (n) q = q.ilike("item_name_norm", `%${n}%`);
  }
  if (f.category && CATEGORIES.includes(f.category as any)) q = q.eq("category", f.category);
  if (f.mall && MALLS.includes(f.mall)) q = q.eq("mall", f.mall);
  if (typeof f.minPrice === "number") q = q.gte("offer_price", f.minPrice);
  if (typeof f.maxPrice === "number") q = q.lte("offer_price", f.maxPrice);
  if (typeof f.minDiscount === "number") q = q.gte("discount_pct", f.minDiscount);

  q =
    f.sort === "price"
      ? q.order("offer_price", { ascending: true })
      : q.order("discount_pct", { ascending: false, nullsFirst: false });

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    understood: f.explain ?? "",
    filters: {
      keywords: f.keywords ?? [],
      category: f.category ?? null,
      mall: f.mall ?? null,
      minPrice: f.minPrice ?? null,
      maxPrice: f.maxPrice ?? null,
      minDiscount: f.minDiscount ?? null,
      sort: f.sort ?? null,
    },
    total: count ?? 0,
    offers: data ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (typeof status === "number") {
      return NextResponse.json(
        { error: `خطأ من Claude (${status}): ${(e as Error).message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
