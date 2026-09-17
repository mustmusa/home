import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export const maxDuration = 120;

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("متغير البيئة ANTHROPIC_API_KEY غير مضبوط على الخادم");
  cached = new Anthropic({ apiKey });
  return cached;
}

type Txn = {
  txn_date: string;
  posted_date?: string | null;
  merchant: string;
  amount: number;
  foreign_amount?: number | null;
  foreign_currency?: string | null;
  status?: "pending" | "posted";
};

const PROMPT = `هذا كشف حساب بطاقة ائتمانية سعودية. استخرج كل عملية فيه.

لكل عملية أعطني:
- txn_date: تاريخ العملية بصيغة YYYY-MM-DD
- posted_date: تاريخ الإرسال/القيد بنفس الصيغة، أو null
- merchant: اسم التاجر كما هو مكتوب (اللاتيني كما هو، والعربي مقروءاً بشكل صحيح)
- amount: المبلغ رقماً. المصروف سالب والسداد موجب
- foreign_amount و foreign_currency: إن ظهر مبلغ بعملة أجنبية، وإلا null
- status: "pending" إن كانت تحت "التفاويض المعلقة"، و"posted" فيما عدا ذلك

قواعد:
- لا تتجاهل أي عملية، بما فيها ذات المبلغ صفر
- لا تجمع عمليتين متشابهتين: نفس التاجر قد يتكرر في اليوم بمبالغ مختلفة، سجّل كل واحدة
- المبالغ أرقام بلا رمز عملة أو فواصل آلاف

أعد JSON فقط:
{"card_last4":"1649","transactions":[{"txn_date":"2026-09-17","posted_date":null,"merchant":"...","amount":-24.00,"foreign_amount":null,"foreign_currency":null,"status":"posted"}]}`;

function fingerprint(t: Txn) {
  return createHash("sha256")
    .update(`${t.txn_date}|${t.merchant.trim().toLowerCase()}|${t.amount}`)
    .digest("hex")
    .slice(0, 32);
}

async function handle(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يُرفع ملف" }, { status: 400 });
  if (!file.type.includes("pdf")) {
    return NextResponse.json({ error: "الملف يجب أن يكون PDF" }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  // The PDF goes to the model as a document: extracting its text first returns
  // the Arabic reversed, while the layout survives this way.
  const message = await getClient().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document" as const,
            source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
          },
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { card_last4?: string; transactions?: Txn[] };
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json(
        { error: "تعذّر قراءة الكشف", sample: text.slice(0, 300) },
        { status: 502 }
      );
    }
    parsed = JSON.parse(m[0]);
  }

  const txns = (parsed.transactions ?? []).filter(
    (t) => t?.txn_date && t?.merchant && Number.isFinite(Number(t.amount))
  );
  if (txns.length === 0) {
    return NextResponse.json({ error: "لم أجد عمليات في الكشف" }, { status: 400 });
  }

  const last4 = (parsed.card_last4 ?? "").replace(/\D/g, "").slice(-4) || null;
  const db = supabaseServer();

  const rows = txns.map((t) => ({
    txn_date: t.txn_date,
    posted_date: t.posted_date || null,
    merchant: String(t.merchant).trim(),
    amount: Number(t.amount),
    foreign_amount: t.foreign_amount ?? null,
    foreign_currency: t.foreign_currency ?? null,
    status: t.status === "pending" ? "pending" : "posted",
    card_last4: last4,
    fingerprint: fingerprint(t),
    updated_at: new Date().toISOString(),
  }));

  // Ignoring duplicates keeps the category, note and purchase link a previous
  // upload already carried; re-inserting would wipe them.
  const { data: inserted, error } = await db
    .from("card_transactions")
    .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A pending charge reappears as posted under a new fingerprint, so pending
  // rows in this statement's range that it no longer lists are stale.
  const dates = rows.map((r) => r.txn_date).sort();
  const seen = rows.map((r) => r.fingerprint);
  const { data: dropped } = await db
    .from("card_transactions")
    .delete()
    .eq("status", "pending")
    .gte("txn_date", dates[0])
    .lte("txn_date", dates[dates.length - 1])
    .not("fingerprint", "in", `(${seen.join(",")})`)
    .select("id");

  return NextResponse.json({
    ok: true,
    read: txns.length,
    added: inserted?.length ?? 0,
    alreadyKnown: txns.length - (inserted?.length ?? 0),
    staleRemoved: dropped?.length ?? 0,
    range: { from: dates[0], to: dates[dates.length - 1] },
    cardLast4: last4,
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
