import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { matchScore, normalizeArabic } from "@/lib/arabicMatch";

export const maxDuration = 30;

const MIN_SCORE = 0.5;
const TOP_PER_NEED = 3;

type OfferRow = {
  id: string;
  mall: string;
  item_name: string;
  description: string | null;
  original_price: number | null;
  offer_price: number;
  discount_pct: number | null;
  category: string | null;
};

function bestOffers(need: string, offers: OfferRow[]) {
  return offers
    .map((o) => ({ offer: o, score: matchScore(need, o.item_name) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score || (b.offer.discount_pct ?? 0) - (a.offer.discount_pct ?? 0)
    )
    .slice(0, TOP_PER_NEED)
    .map((x) => x.offer);
}

export async function GET() {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const db = supabaseServer();

    const [offersRes, requestsRes, warehouseRes, housesRes, linesRes] = await Promise.all([
      db
        .from("offers")
        .select("id, mall, item_name, description, original_price, offer_price, discount_pct, category")
        .limit(1000),
      db.from("requests").select("id, item_name, quantity_text, house_id").eq("status", "pending"),
      db.from("warehouse_items").select("id, name, quantity, unit").lte("quantity", 0),
      db.from("houses").select("id, name"),
      db
        .from("purchase_lines")
        .select("item_name, unit_price, created_at")
        .not("unit_price", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const err =
      offersRes.error || requestsRes.error || warehouseRes.error || housesRes.error || linesRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const offers = (offersRes.data ?? []) as OfferRow[];
    const houseName = new Map((housesRes.data ?? []).map((h) => [h.id, h.name]));

    const requested = (requestsRes.data ?? [])
      .map((r) => ({
        need: r.item_name as string,
        quantity: r.quantity_text as string | null,
        house: houseName.get(r.house_id as string) ?? null,
        offers: bestOffers(r.item_name as string, offers),
      }))
      .filter((x) => x.offers.length > 0);

    const depleted = (warehouseRes.data ?? [])
      .map((w) => ({
        need: w.name as string,
        quantity: w.quantity as number,
        unit: w.unit as string | null,
        offers: bestOffers(w.name as string, offers),
      }))
      .filter((x) => x.offers.length > 0);

    // Most recent price per distinct purchased item; rows arrive newest first.
    const lastPaid = new Map<string, { name: string; price: number }>();
    for (const l of linesRes.data ?? []) {
      const key = normalizeArabic(l.item_name as string);
      if (key && !lastPaid.has(key)) {
        lastPaid.set(key, { name: l.item_name as string, price: Number(l.unit_price) });
      }
    }

    const cheaper: {
      need: string;
      lastPaid: number;
      offer: OfferRow;
      savedPct: number;
    }[] = [];
    for (const { name, price } of lastPaid.values()) {
      for (const offer of bestOffers(name, offers)) {
        if (offer.offer_price < price) {
          cheaper.push({
            need: name,
            lastPaid: price,
            offer,
            savedPct: Math.round(((price - offer.offer_price) / price) * 100),
          });
          break; // one suggestion per item is enough to act on
        }
      }
    }
    cheaper.sort((a, b) => b.savedPct - a.savedPct);

    return NextResponse.json({
      requested,
      depleted,
      cheaper: cheaper.slice(0, 40),
      counts: {
        offersConsidered: offers.length,
        pendingRequests: requestsRes.data?.length ?? 0,
        depletedItems: warehouseRes.data?.length ?? 0,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
