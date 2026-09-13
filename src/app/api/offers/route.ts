import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["admin", "warehouse"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mall = searchParams.get("mall");
  const limit = Number(searchParams.get("limit") ?? 5000);

  try {
    const db = supabaseServer();

    const countQuery = db.from("offers").select("id", { count: "exact", head: true });
    const { count } = await (mall ? countQuery.eq("mall", mall) : countQuery);

    // PostgREST caps a response at 1000 rows whatever limit is asked for, so
    // a single request silently returns only the newest mall's offers.
    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      let q = db
        .from("offers")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, Math.min(from + PAGE, limit) - 1);
      if (mall) q = q.eq("mall", mall);

      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const grouped: Record<string, any[]> = {};
    for (const offer of rows as any[]) {
      (grouped[offer.mall] ??= []).push(offer);
    }

    return NextResponse.json({
      success: true,
      total: count ?? rows.length,
      shown: rows.length,
      malls: Object.keys(grouped),
      offers: grouped,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { offerId } = await req.json();
    if (!offerId) {
      return NextResponse.json({ error: "معرف العرض غير محدد" }, { status: 400 });
    }

    const db = supabaseServer();
    const { error } = await db.from("offers").delete().eq("id", offerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
