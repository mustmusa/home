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
  const limit = Number(searchParams.get("limit") ?? 1000);

  try {
    const db = supabaseServer();
    let query = db.from("offers").select("*").order("created_at", { ascending: false }).limit(limit);

    if (mall) {
      query = query.eq("mall", mall);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // تجميع حسب المول
    const grouped: Record<string, any[]> = {};
    (data || []).forEach((offer) => {
      if (!grouped[offer.mall]) {
        grouped[offer.mall] = [];
      }
      grouped[offer.mall].push(offer);
    });

    return NextResponse.json({
      success: true,
      total: data?.length || 0,
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
