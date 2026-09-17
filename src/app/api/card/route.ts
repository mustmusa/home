import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { CATEGORIES } from "@/lib/types";

export const maxDuration = 30;

const DAY = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 3;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const p = req.nextUrl.searchParams;
    const month = p.get("month"); // YYYY-MM
    const db = supabaseServer();

    let q = db.from("card_transactions").select("*").order("txn_date", { ascending: false });
    if (month) {
      const from = `${month}-01`;
      const end = new Date(`${month}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      q = q.gte("txn_date", from).lt("txn_date", end.toISOString().slice(0, 10));
    }

    const { data: txns, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: purchases } = await db
      .from("purchases")
      .select("id, store_name, total_amount, purchased_at")
      .order("purchased_at", { ascending: false })
      .limit(300);

    // A card charge and its invoice share an amount and fall within a few days
    // of each other; the bank posts a day or two after the till.
    const linkedIds = new Set((txns ?? []).map((t) => t.purchase_id).filter(Boolean));
    const withSuggestions = (txns ?? []).map((t) => {
      if (t.purchase_id) return { ...t, suggestions: [] };
      const spend = Math.abs(Number(t.amount));
      const when = new Date(t.txn_date).getTime();
      const suggestions = (purchases ?? [])
        .filter((pu) => {
          if (linkedIds.has(pu.id)) return false;
          if (Math.abs(Number(pu.total_amount) - spend) > 0.01) return false;
          const gap = Math.abs(new Date(pu.purchased_at).getTime() - when);
          return gap <= MATCH_WINDOW_DAYS * DAY;
        })
        .slice(0, 3);
      return { ...t, suggestions };
    });

    const spend = (txns ?? []).filter((t) => Number(t.amount) < 0);
    const totalSpend = spend.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const unlinked = withSuggestions.filter((t) => !t.purchase_id && Number(t.amount) < 0);

    const byCategory: Record<string, number> = {};
    for (const t of spend) {
      const key = t.category || "غير مصنّف";
      byCategory[key] = (byCategory[key] ?? 0) + Math.abs(Number(t.amount));
    }

    const usedCategories = [
      ...new Set((txns ?? []).map((t) => t.category).filter((c): c is string => !!c)),
    ].sort();

    return NextResponse.json({
      transactions: withSuggestions,
      usedCategories,
      summary: {
        count: txns?.length ?? 0,
        totalSpend: Number(totalSpend.toFixed(2)),
        unlinkedCount: unlinked.length,
        unlinkedTotal: Number(
          unlinked.reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2)
        ),
        byCategory,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "معرّف العملية مفقود" }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.category !== undefined) {
      patch.category = CATEGORIES.includes(body.category) ? body.category : body.category || null;
    }
    if (body.note !== undefined) {
      patch.note = body.note ? String(body.note).trim() || null : null;
    }
    if (body.purchaseId !== undefined) {
      patch.purchase_id = body.purchaseId || null;
    }

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: "لا يوجد تغيير" }, { status: 400 });
    }

    const { error } = await supabaseServer()
      .from("card_transactions")
      .update(patch)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
