import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const category = p.get("category");
  const mall = p.get("mall");
  const minDiscount = p.get("minDiscount");
  const maxDiscount = p.get("maxDiscount");
  const limit = Math.min(Number(p.get("limit") ?? 200), 500);

  const db = supabaseServer();
  let q = db
    .from("offers")
    .select("id, mall, item_name, description, original_price, offer_price, discount_pct, category", {
      count: "exact",
    })
    .order("discount_pct", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (category) q = q.eq("category", category);
  if (mall) q = q.eq("mall", mall);
  if (minDiscount) q = q.gte("discount_pct", Number(minDiscount));
  if (maxDiscount) q = q.lt("discount_pct", Number(maxDiscount));

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ total: count ?? 0, shown: data?.length ?? 0, offers: data ?? [] });
}
