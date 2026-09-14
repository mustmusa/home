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

// Classifying names costs a fraction of re-reading the flyers they came from.
async function handle(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { batchSize = 250 } = await req.json().catch(() => ({}));
  const db = supabaseServer();

  const { count: remaining } = await db
    .from("offers")
    .select("id", { count: "exact", head: true })
    .is("category", null);

  const { data: rows, error } = await db
    .from("offers")
    .select("item_name")
    .is("category", null)
    .limit(batchSize);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return NextResponse.json({ done: true, remaining: 0, updated: 0 });
  }

  const names = [...new Set(rows.map((r) => r.item_name as string))];

  const message = await getClient().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `صنّف كل اسم منتج أدناه بواحدة من هذه التصنيفات حرفياً:
${CATEGORIES.join(" | ")}

الأسماء:
${names.map((n, i) => `${i}. ${n}`).join("\n")}

أعد JSON فقط: مصفوفة بنفس ترتيب الأسماء وطولها، كل عنصر هو التصنيف نصاً.
مثال: ["بقالة جافة","لحوم ودواجن",...]
ما لا ينتمي لشيء واضح ضعه في "أخرى".`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let labels: unknown;
  try {
    labels = JSON.parse(text.trim());
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return NextResponse.json({ error: "تعذّر قراءة رد النموذج" }, { status: 502 });
    labels = JSON.parse(m[0]);
  }
  if (!Array.isArray(labels)) {
    return NextResponse.json({ error: "رد غير متوقع" }, { status: 502 });
  }

  // One update per category beats one per row.
  const byCategory = new Map<string, string[]>();
  names.forEach((name, i) => {
    const label = CATEGORIES.includes(labels[i] as any) ? (labels[i] as string) : "أخرى";
    const list = byCategory.get(label) ?? [];
    list.push(name);
    byCategory.set(label, list);
  });

  let updated = 0;
  for (const [category, group] of byCategory) {
    const { data, error: upErr } = await db
      .from("offers")
      .update({ category })
      .is("category", null)
      .in("item_name", group)
      .select("id");
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    updated += data?.length ?? 0;
  }

  return NextResponse.json({
    done: updated === 0,
    updated,
    uniqueNames: names.length,
    remainingBefore: remaining ?? 0,
    costHint: message.usage,
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
