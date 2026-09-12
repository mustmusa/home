import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const db = supabaseServer();

  // احسب بداية ونهاية اليوم (UTC)
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)).toISOString();

  let query = db
    .from("purchase_lines")
    .select("id, item_name, quantity, unit_price, line_total, destination, house_id, category, created_at, purchase_id, houses(name)")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false });

  // للزوجة: اعرض فقط مشتريات البيت الخاص بها
  if (session.role === "wife" && session.houseId) {
    query = query.eq("house_id", session.houseId).eq("destination", "house");
  } else if (session.role !== "admin") {
    // للمستخدمين الآخرين (warehouse): بدون وصول
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { data: lines, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = lines ?? [];

  // احسب الإجماليات
  const total = rows.reduce((s, r) => s + Number(r.line_total || 0), 0);

  // احسب الإجماليات حسب الوجهة (للأدمن فقط)
  let houseTotal = 0;
  let warehouseTotal = 0;
  if (session.role === "admin") {
    rows.forEach((r) => {
      if (r.destination === "house") {
        houseTotal += Number(r.line_total || 0);
      } else {
        warehouseTotal += Number(r.line_total || 0);
      }
    });
  }

  // احسب الإجماليات حسب البيت (للأدمن فقط)
  let byHouse: { [key: string]: { name: string; total: number; count: number } } = {};
  if (session.role === "admin") {
    rows.forEach((r) => {
      if (r.destination === "house" && r.house_id) {
        const houseName = ((r as unknown as { houses: { name: string } | null }).houses?.name) || "بيت";
        if (!byHouse[r.house_id]) {
          byHouse[r.house_id] = { name: houseName, total: 0, count: 0 };
        }
        byHouse[r.house_id].total += Number(r.line_total || 0);
        byHouse[r.house_id].count += 1;
      }
    });
  }

  return NextResponse.json({
    today: start.slice(0, 10),
    total,
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      item_name: r.item_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      line_total: r.line_total,
      destination: r.destination,
      house_id: r.house_id,
      house_name: ((r as unknown as { houses: { name: string } | null }).houses?.name) || "بيت",
      category: r.category,
      created_at: r.created_at,
      purchase_id: r.purchase_id,
    })),
    houseTotal,
    warehouseTotal,
    byHouse,
  });
}

// للأدمن فقط: تحديث وجهة عنصر
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const { lineId, destination, house_id } = body;

  if (!lineId || !destination || !["house", "warehouse"].includes(destination)) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  if (destination === "house" && !house_id) {
    return NextResponse.json({ error: "يجب تحديد البيت" }, { status: 400 });
  }

  const db = supabaseServer();

  const updateData: any = { destination };
  if (destination === "house") {
    updateData.house_id = house_id;
  } else {
    updateData.house_id = null;
  }

  const { error } = await db.from("purchase_lines").update(updateData).eq("id", lineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
