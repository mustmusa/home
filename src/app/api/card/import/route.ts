import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { parseStatementJson } from "@/lib/parseStatementJson";

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

const PROMPT = `هذا ملف PDF يُفترض أنه كشف حساب بطاقة ائتمانية سعودية.

أولاً حدّد نوع المستند:
- "card": كشف بطاقة ائتمانية (فيه حد ائتماني، أو رقم بطاقة، أو الحد الأدنى للسداد، أو "كشف حساب البطاقة")
- "account": كشف حساب جارٍ/بنكي (فيه رقم حساب أو IBAN ورصيد افتتاحي ومدين/دائن وحوالات ورواتب)
- "other": أي شيء آخر

إن لم يكن "card" فأعد فقط: {"doc_type":"account","doc_hint":"سطر واحد يصف ما رأيته"}
ولا تستخرج أي عملية.

إن كان كشف بطاقة، استخرج كل عملية فيه. لكل عملية:
- d: تاريخ العملية YYYY-MM-DD
- m: اسم التاجر كما هو مكتوب (اللاتيني كما هو، والعربي مقروءاً بشكل صحيح)
- a: المبلغ رقماً. المصروف سالب والسداد موجب
- p: تاريخ القيد YYYY-MM-DD — اكتبه فقط إن اختلف عن d
- fa و fc: المبلغ والعملة الأجنبية — فقط إن وُجدا
- s: اكتب "pending" فقط للعمليات تحت "التفاويض المعلقة"

قواعد:
- لا تتجاهل أي عملية، بما فيها ذات المبلغ صفر
- لا تجمع عمليتين متشابهتين: نفس التاجر قد يتكرر في اليوم بمبالغ مختلفة، سجّل كل واحدة
- المبالغ أرقام بلا رمز عملة أو فواصل آلاف
- لا تكتب مفتاحاً قيمته null — احذفه
- سطر واحد لكل عملية، بلا مسافات زائدة، فالكشف قد يكون طويلاً

أعد JSON فقط بلا أي شرح:
{"doc_type":"card","card_last4":"1649","tx":[
{"d":"2026-09-17","m":"PANDA","a":-24.00},
{"d":"2026-09-18","m":"مطعم","a":-31.50,"s":"pending"}
]}`;

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
  //
  // Streamed, because a long statement's answer runs past the SDK's timeout on
  // a plain create() at this token ceiling. 16k used to cut the answer off at
  // about 120 charges; the compact one-line-per-charge shape above roughly
  // halves the cost of each, and 32k leaves room for a statement several times
  // longer than a month's.
  const message = await getClient().messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 32000,
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
  }).finalMessage();

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseStatementJson(text);
  if (parsed.transactions.length === 0 && !parsed.docType) {
    return NextResponse.json(
      { error: "تعذّر قراءة الكشف", sample: text.slice(0, 300) },
      { status: 502 }
    );
  }

  // A current-account statement reads as a perfectly good list of transactions,
  // so nothing downstream would have caught it: it has to be refused here,
  // before a single row is written.
  if (parsed.docType && parsed.docType !== "card") {
    const what =
      parsed.docType === "account" ? "كشف حساب جارٍ/بنكي" : "مستند غير معروف";
    return NextResponse.json(
      {
        error:
          `هذا ${what}، وليس كشف بطاقة ائتمانية — لم يُستورد شيء.` +
          (parsed.docHint ? `\n(${parsed.docHint})` : "") +
          "\nارفع كشف البطاقة الائتمانية.",
        docType: parsed.docType,
      },
      { status: 400 }
    );
  }

  const txns: Txn[] = parsed.transactions
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const date = String(r.d ?? r.txn_date ?? "");
      const posted = r.p ?? r.posted_date ?? null;
      return {
        txn_date: date,
        posted_date: posted ? String(posted) : null,
        merchant: String(r.m ?? r.merchant ?? ""),
        amount: Number(r.a ?? r.amount),
        foreign_amount: Number.isFinite(Number(r.fa ?? r.foreign_amount))
          ? Number(r.fa ?? r.foreign_amount)
          : null,
        foreign_currency:
          typeof (r.fc ?? r.foreign_currency) === "string"
            ? String(r.fc ?? r.foreign_currency)
            : null,
        status: (r.s ?? r.status) === "pending" ? ("pending" as const) : ("posted" as const),
      };
    })
    .filter((t) => t.txn_date && t.merchant && Number.isFinite(t.amount));
  if (txns.length === 0) {
    return NextResponse.json({ error: "لم أجد عمليات في الكشف" }, { status: 400 });
  }

  const last4 = (parsed.cardLast4 ?? "").replace(/\D/g, "").slice(-4) || null;
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
    docType: "card",
    read: txns.length,
    // Rows the answer mangled or cut off are reported rather than hidden: the
    // statement can be re-uploaded and the missing ones fill in.
    unreadable: parsed.skipped,
    // The model's own stop reason is the reliable signal; a half-written last
    // object only shows up when the cut landed mid-row.
    truncated: parsed.truncated || message.stop_reason === "max_tokens",
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
