import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { matchScore } from "@/lib/arabicMatch";

export const maxDuration = 30;

const MIN_SCORE = 0.5;

type OfferRow = {
  id: string;
  mall: string;
  item_name: string;
  description: string | null;
  original_price: number | null;
  offer_price: number;
  discount_pct: number | null;
};

export async function GET() {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const db = supabaseServer();
    const [reqRes, offersRes] = await Promise.all([
      db.from("requests").select("id, item_name, quantity_text, house_id").eq("status", "pending"),
      db
        .from("offers")
        .select("id, mall, item_name, description, original_price, offer_price, discount_pct")
        .limit(1000),
    ]);

    const err = reqRes.error || offersRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const requests = reqRes.data ?? [];
    const offers = (offersRes.data ?? []) as OfferRow[];

    // For each mall, the cheapest offer matching each requested item.
    const perMall = new Map<
      string,
      { need: string; quantity: string | null; offer: OfferRow }[]
    >();

    for (const r of requests) {
      const need = r.item_name as string;
      const cheapestByMall = new Map<string, OfferRow>();

      for (const o of offers) {
        if (matchScore(need, o.item_name) < MIN_SCORE) continue;
        const current = cheapestByMall.get(o.mall);
        if (!current || o.offer_price < current.offer_price) {
          cheapestByMall.set(o.mall, o);
        }
      }

      for (const [mall, offer] of cheapestByMall) {
        const list = perMall.get(mall) ?? [];
        list.push({ need, quantity: r.quantity_text as string | null, offer });
        perMall.set(mall, list);
      }
    }

    const malls = [...perMall.entries()]
      .map(([mall, items]) => ({
        mall,
        items: items.sort((a, b) => a.offer.offer_price - b.offer.offer_price),
        covered: items.length,
        total: Number(items.reduce((s, i) => s + i.offer.offer_price, 0).toFixed(2)),
      }))
      // Best basket first: most of the list covered, then cheapest.
      .sort((a, b) => b.covered - a.covered || a.total - b.total);

    const matchedNeeds = new Set(
      [...perMall.values()].flat().map((i) => i.need)
    );

    return NextResponse.json({
      totalRequests: requests.length,
      matchedRequests: matchedNeeds.size,
      unmatched: requests
        .map((r) => r.item_name as string)
        .filter((n) => !matchedNeeds.has(n)),
      malls,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
