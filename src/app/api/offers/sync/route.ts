import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { CATEGORIES } from "@/lib/types";

export const maxDuration = 60;

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("متغير البيئة ANTHROPIC_API_KEY غير مضبوط على الخادم");
  cached = new Anthropic({ apiKey });
  return cached;
}

const MALLS = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];

// USD per million tokens, for the cost figures shown in the comparison.
const MODELS = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
} as const;
type ModelId = keyof typeof MODELS;
const DEFAULT_MODEL: ModelId = "claude-sonnet-5";

type Extracted = {
  category?: string | null;
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
            .filter((u: string) =>
              /^https:\/\/cdn\.d4donline\.com\/.+\.(webp|jpe?g|png)$/i.test(u)
            );
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
- description: الحجم أو الوزن أو عدد الحبات أو الوحدة كما هو مكتوب (مثل: "كرتون ١٠ حبات"، "١ كجم"، "حبة")
- category: صنّف المنتج بواحدة من هذه القيم حرفياً: ${CATEGORIES.join(" | ")}

قواعد صارمة:
- تجاهل أي منتج لا يظهر له سعر واضح ومقروء
- offer_price مطلوب دائماً ويجب أن يكون رقماً أكبر من صفر
- لا تخمّن سعراً غير مقروء
- الأسعار أرقام فقط بلا رمز عملة
- النشرة قد تعرض نفس المنتج بأحجام مختلفة وأسعار مختلفة: سجّل كل حجم كعرض منفصل
- إذا ظهر حجم أو وزن أو عدد حبات أو كلمة (كرتون/حبة/كجم/جم/لتر/مل)، فأضفه في نهاية item_name بين قوسين وكرّره في description
- لا تترك منتجين بنفس item_name تماماً وسعرين مختلفين: ميّزهما بالحجم

أعد مصفوفة JSON فقط، بلا أي نص آخر:
[{"item_name":"...","offer_price":0,"original_price":null,"discount_percent":null,"description":null,"category":"بقالة جافة"}]`;

const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

function parseOffers(text: string): Extracted[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  return (Array.isArray(raw) ? raw : []).filter(
    (o): o is Extracted =>
      !!o &&
      typeof o.item_name === "string" &&
      o.item_name.trim().length > 0 &&
      positive(o.offer_price) !== null
  );
}

async function extractPages(model: ModelId, urls: string[]) {
  const message = await getClient().messages.create({
    model,
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          ...urls.map((u) => ({
            type: "image" as const,
            source: { type: "url" as const, url: u },
          })),
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new Error(`رُفض الطلب على ${model}`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const price = MODELS[model];
  const cost =
    (message.usage.input_tokens / 1e6) * price.in +
    (message.usage.output_tokens / 1e6) * price.out;

  return {
    model,
    offers: parseOffers(text),
    usage: message.usage,
    costUsd: Number(cost.toFixed(4)),
    raw: text.slice(0, 2000),
  };
}

async function handle(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const {
    url,
    mall,
    offset = 0,
    batchSize = 2,
    dryRun = false,
    compare = false,
    force = false,
    model = DEFAULT_MODEL,
  } = await req.json();

  if (!MALLS.includes(mall)) {
    return NextResponse.json({ error: "المول غير صحيح", malls: MALLS }, { status: 400 });
  }
  if (!(model in MODELS)) {
    return NextResponse.json({ error: "النموذج غير معروف" }, { status: 400 });
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
  const campaignId = parsed.pathname.match(/\/offers\/[^/]+\/(\d+)\//)?.[1] ?? null;

  const pageRes = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8",
    },
  });
  if (!pageRes.ok) {
    return NextResponse.json({ error: `الموقع رجّع ${pageRes.status}` }, { status: 502 });
  }

  const pages = flyerPages(await pageRes.text());
  if (pages.length === 0) {
    return NextResponse.json({ error: "لم أجد صفحات النشرة في هذه الصفحة" }, { status: 404 });
  }

  // Side-by-side on one page, so the cheaper model is chosen on evidence.
  if (compare) {
    const [fast, strong] = await Promise.all([
      extractPages("claude-sonnet-5", pages.slice(0, 1)),
      extractPages("claude-opus-5", pages.slice(0, 1)),
    ]);
    const perMallPages = pages.length;
    const scale = perMallPages / Math.max(1, batchSize);
    return NextResponse.json({
      compare: true,
      totalPages: perMallPages,
      testedPage: pages[0],
      sonnet: {
        ...fast,
        projectedMallCostUsd: Number((fast.costUsd * scale).toFixed(2)),
      },
      opus: {
        ...strong,
        projectedMallCostUsd: Number((strong.costUsd * scale).toFixed(2)),
      },
    });
  }

  // Re-reading a flyer already stored costs a full run and yields the same
  // rows, so a known campaign is refused unless the caller insists.
  if (!dryRun && offset === 0 && campaignId && !force) {
    const { count } = await supabaseServer()
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("mall", mall)
      .eq("source", "scrape")
      .eq("campaign_id", campaignId);
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        alreadySynced: true,
        campaignId,
        existing: count,
        totalPages: pages.length,
      });
    }
  }

  const slice = dryRun ? pages.slice(0, 1) : pages.slice(offset, offset + batchSize);
  if (slice.length === 0) {
    return NextResponse.json({ done: true, totalPages: pages.length, offset });
  }

  const result = await extractPages(model as ModelId, slice);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      model,
      totalPages: pages.length,
      testedPage: slice[0],
      extracted: result.offers.length,
      offers: result.offers.slice(0, 20),
      usage: result.usage,
      costUsd: result.costUsd,
      promptVersion: 4,
      raw: result.raw,
    });
  }

  const db = supabaseServer();
  if (offset === 0) {
    const base = db.from("offers").delete().eq("mall", mall).eq("source", "scrape");
    // Replace this campaign only, so a mall's concurrent flyers accumulate.
    // Rows predating the campaign_id column have none and would otherwise
    // never be cleared, leaving a duplicate of every item.
    await (campaignId
      ? base.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
      : base);

    // Flyers are weekly; anything this old belongs to a campaign that ended.
    const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .from("offers")
      .delete()
      .eq("mall", mall)
      .eq("source", "scrape")
      .lt("created_at", cutoff);
  }

  let inserted = 0;
  if (result.offers.length > 0) {
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("offers")
      .insert(
        result.offers.map((o) => ({
          mall,
          campaign_id: campaignId,
          item_name: o.item_name.trim(),
          offer_price: positive(o.offer_price)!,
          original_price: positive(o.original_price),
          discount_percent: positive(o.discount_percent),
          description: o.description ? String(o.description).trim() : null,
          category: CATEGORIES.includes(o.category as any) ? o.category : null,
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
    model,
    campaignId,
    totalPages: pages.length,
    processedPages: nextOffset,
    nextOffset,
    done: nextOffset >= pages.length,
    inserted,
    costUsd: result.costUsd,
  });
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    // Without this the route answers an unhandled throw with an opaque 500
    // and a non-JSON body, which tells the caller nothing.
    const status = (e as { status?: number })?.status;
    if (typeof status === "number") {
      return NextResponse.json(
        { error: `خطأ من Claude (${status}): ${(e as Error).message}`, kind: "anthropic" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), kind: "server" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  let clientInit: string;
  try {
    getClient();
    clientInit = "ok";
  } catch (e) {
    clientInit = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json({
    routeLoaded: true,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    keyLength: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    clientInit,
    defaultModel: DEFAULT_MODEL,
  });
}
