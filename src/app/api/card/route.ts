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

    const { data: houses } = await db.from("houses").select("id, name");

    // A category can be excluded as a whole: every charge carrying it drops out
    // of the month's spending, the ones already imported and any that arrive in
    // a later upload, without ticking them one by one.
    const { data: excludedCats } = await db.from("card_excluded_categories").select("name");
    const excludedCategories = (excludedCats ?? []).map((r) => r.name as string);
    const excludedSet = new Set(excludedCategories);
    const isExcluded = (t: { excluded?: boolean | null; category: string | null }) =>
      Boolean(t.excluded) || (t.category ? excludedSet.has(t.category) : false);

    const { data: purchases } = await db
      .from("purchases")
      .select("id, store_name, total_amount, purchased_at, purchase_lines(item_name)")
      .order("purchased_at", { ascending: false })
      .limit(300);

    // A card charge and its invoice share an amount and fall within a few days
    // of each other; the bank posts a day or two after the till.
    const linkedIds = new Set((txns ?? []).map((t) => t.purchase_id).filter(Boolean));
    const withSuggestions = (txns ?? []).map((t) => {
      const flags = { excluded_by_category: Boolean(t.category && excludedSet.has(t.category)) };
      if (t.purchase_id) return { ...t, ...flags, suggestions: [] };
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
      return { ...t, ...flags, suggestions };
    });

    // Excluded charges stay in the ledger and in their section, but no report
    // counts them: a card payment or a transfer is not the month's spending.
    const spend = (txns ?? []).filter((t) => Number(t.amount) < 0 && !isExcluded(t));
    const excluded = (txns ?? []).filter(isExcluded);
    const totalSpend = spend.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const unlinked = withSuggestions.filter(
      (t) => !t.purchase_id && Number(t.amount) < 0 && !isExcluded(t)
    );

    const byCategory: Record<string, number> = {};
    for (const t of spend) {
      // A charge tied to an invoice is accounted for even without a category,
      // so it is not lumped in with the genuinely unexplained spending.
      const key = t.category || (t.purchase_id ? "مرتبط بفاتورة" : "غير مصنّف");
      byCategory[key] = (byCategory[key] ?? 0) + Math.abs(Number(t.amount));
    }

    const houseName = new Map((houses ?? []).map((h) => [h.id, h.name]));
    const targetLabel = (t: { target_kind: string | null; target_house_id: string | null; target_label: string | null }) => {
      if (t.target_kind === "house") return houseName.get(t.target_house_id ?? "") ?? "بيت";
      if (t.target_kind === "personal") return "مصاريف شخصية";
      if (t.target_kind === "warehouse") return "المخزن";
      if (t.target_kind === "other") return t.target_label || "أخرى";
      return "بلا جهة";
    };

    const byTarget: Record<string, number> = {};
    for (const t of spend) {
      const key = targetLabel(t);
      byTarget[key] = (byTarget[key] ?? 0) + Math.abs(Number(t.amount));
    }

    const usedTargets = [
      ...new Set(
        (txns ?? [])
          .filter((t) => t.target_kind === "other" && t.target_label)
          .map((t) => t.target_label as string)
      ),
    ].sort();

    const usedCategories = [
      ...new Set((txns ?? []).map((t) => t.category).filter((c): c is string => !!c)),
    ].sort();

    return NextResponse.json({
      transactions: withSuggestions,
      houses: houses ?? [],
      purchases: purchases ?? [],
      usedCategories,
      usedTargets,
      excludedCategories,
      summary: {
        count: txns?.length ?? 0,
        totalSpend: Number(totalSpend.toFixed(2)),
        excludedCount: excluded.length,
        excludedTotal: Number(
          excluded.reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2)
        ),
        unlinkedCount: unlinked.length,
        unlinkedTotal: Number(
          unlinked.reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2)
        ),
        byCategory,
        byTarget,
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
    if (body.excluded !== undefined) {
      patch.excluded = Boolean(body.excluded);
    }
    if (body.targetKind !== undefined) {
      const kind = body.targetKind || null;
      if (kind && !["house", "personal", "warehouse", "other"].includes(kind)) {
        return NextResponse.json({ error: "جهة غير معروفة" }, { status: 400 });
      }
      patch.target_kind = kind;
      patch.target_house_id = kind === "house" ? body.targetHouseId || null : null;
      patch.target_label = kind === "other" ? String(body.targetLabel || "").trim() || null : null;
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

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    // One id, or many — an import of the wrong statement is undone in one go.
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map(String).filter(Boolean)
      : body.id
        ? [String(body.id)]
        : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "معرّف العملية مفقود" }, { status: 400 });
    }
    const { data, error } = await supabaseServer()
      .from("card_transactions")
      .delete()
      .in("id", ids)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
