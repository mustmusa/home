import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

const client = new Anthropic();

const MALLS = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];

type Extracted = {
  item_name: string;
  original_price?: number | null;
  offer_price: number;
  discount_percent?: number | null;
  description?: string | null;
};

// D4D emits JSON-LD image URLs missing the slash before the /u/ path segment
// (".comu/d/..."), while its <img> tags carry the correct form. Unrepaired
// URLs 404 when Claude fetches them.
function normalize(u: string) {
  return u.replace(/d4donline\.comu\//, "d4donline.com/u/").trim();
}

function flyerPages(html: string): string[] {
  const blocks = [
    ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node?.["@type"] === "CreativeWork" && Array.isArray(node.image)) {
          return node.image
            .filter((u: unknown): u is string => typeof u === "string")
            .map(normalize)
            .filter((u: string) => /^https:\/\/cdn\.d4donline\.com\/.+\.(webp|jpe?g|png)$/i.test(u));
        }
      }
    } catch {
      // a malformed block is not fatal — other blocks may still parse
    }
  }
  return [];
}

const PROMPT = `استخرج كل عرض ظاهر في صور نشرة العروض هذه.

لكل منتج له سعر واضح، أعطني:
- item_name: اسم المنتج كما هو مكتوب بالعربية
- offer_price: سعر العرض بالريال (رقم)
- original_price: السعر قبل الخصم إن ظهر، وإلا null
- discount_percent: نسبة الخصم إن ظهرت، وإلا null
- description: الحجم أو الوزن أو الوحدة إن ظهرت، وإلا null

قواعد صارمة:
- تجاهل أي منتج لا يظهر له سعر واضح ومقروء
- offer_price مطلوب دائماً ويجب أن يكون رقماً أكبر من صفر
- لا تخمّن سعراً غير مقروء
- الأسعار أرقام فقط بلا رمز عملة

أعد مصفوفة JSON فقط، بلا أي نص آخر:
[{"item_name":"...","offer_price":0,"original_price":null,"discount_percent":null,"description":null}]`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { url, mall, offset = 0, batchSize = 3, dryRun = false } = await req.json();

  if (!MALLS.includes(mall)) {
    return NextResponse.json({ error: "المول غير صحيح", malls: MALLS }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "رابط غير صالح" }, { status: 400 });
  }
  if (parsed.hostname.replace(/^www\./, "") !== "d4donline.com") {
    return NextResponse.json({ error: "الرابط يجب أن يكون من d4donline.com" }, { status: 400 });
  }

  const pageRes = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8",
    },
  });
  if (!pageRes.ok) {
    return NextResponse.json(
      { error: `الموقع رجّع ${pageRes.status}` },
      { status: 502 }
    );
  }

  const pages = flyerPages(await pageRes.text());
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "لم أجد صفحات النشرة في هذه الصفحة" },
      { status: 404 }
    );
  }

  const slice = dryRun ? pages.slice(0, 1) : pages.slice(offset, offset + batchSize);
  if (slice.length === 0) {
    return NextResponse.json({ done: true, totalPages: pages.length, offset });
  }

  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          ...slice.map((u) => ({
            type: "image" as const,
            source: { type: "url" as const, url: u },
          })),
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    return NextResponse.json({ error: "رُفض الطلب" }, { status: 502 });
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) {
      return NextResponse.json(
        { error: "تعذّر قراءة رد النموذج", sample: text.slice(0, 400) },
        { status: 502 }
      );
    }
    raw = JSON.parse(m[0]);
  }

  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

  const valid = (Array.isArray(raw) ? raw : []).filter(
    (o): o is Extracted =>
      !!o &&
      typeof o.item_name === "string" &&
      o.item_name.trim().length > 0 &&
      num(o.offer_price) !== null
  );

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalPages: pages.length,
      testedPage: slice[0],
      extracted: valid.length,
      offers: valid.slice(0, 20),
      usage: message.usage,
    });
  }

  const db = supabaseServer();

  if (offset === 0) {
    await db.from("offers").delete().eq("mall", mall).eq("source", "scrape");
  }

  let inserted = 0;
  if (valid.length > 0) {
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("offers")
      .insert(
        valid.map((o) => ({
          mall,
          item_name: o.item_name.trim(),
          offer_price: num(o.offer_price)!,
          original_price: num(o.original_price),
          discount_percent: num(o.discount_percent),
          description: o.description ? String(o.description).trim() : null,
          source: "scrape",
          created_at: now,
          updated_at: now,
        }))
      )
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }

  const nextOffset = offset + slice.length;
  return NextResponse.json({
    mall,
    totalPages: pages.length,
    processedPages: nextOffset,
    nextOffset,
    done: nextOffset >= pages.length,
    inserted,
    usage: message.usage,
  });
}
