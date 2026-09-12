import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

function monthRange(month: string) {
  // month: "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month =
    searchParams.get("month") ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const year = Number(searchParams.get("year") ?? now.getUTCFullYear());

  const db = supabaseServer();

  const { data: houses, error: housesErr } = await db.from("houses").select("id, name").order("name");
  if (housesErr) return NextResponse.json({ error: housesErr.message }, { status: 500 });

  const { start, end } = monthRange(month);

  // ---- مصاريف كل بيت هذا الشهر (فواتير + سحوبات من المخزن) ----
  const { data: monthLines, error: monthErr } = await db
    .from("purchase_lines")
    .select("house_id, destination, line_total, item_name, source, created_at")
    .gte("created_at", start)
    .lt("created_at", end);
  if (monthErr) return NextResponse.json({ error: monthErr.message }, { status: 500 });

  const houseTotals = (houses ?? []).map((h) => {
    const rows = (monthLines ?? []).filter((l) => l.destination === "house" && l.house_id === h.id);
    return {
      house_id: h.id as string,
      name: h.name as string,
      total: rows.reduce((s, r) => s + Number(r.line_total || 0), 0),
      count: rows.length,
    };
  });

  // حساب مصاريف العنصر المسحوب من المخزن للبيوت
  const warehouseToHouseTotal = (monthLines ?? [])
    .filter((l) => l.destination === "house" && l.source === "warehouse")
    .reduce((s, r) => s + Number(r.line_total || 0), 0);

  // ---- المخزون الحالي ----
  const { data: warehouseItems, error: whErr } = await db
    .from("warehouse_items")
    .select("*")
    .order("name");
  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  const warehouseValue = (warehouseItems ?? []).reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0),
    0,
  );

  // ---- تكلفة كل عنصر (سنويًا وشهريًا) — من مشتريات فعلية فقط (source=invoice) ----
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const { data: yearLines, error: yearErr } = await db
    .from("purchase_lines")
    .select("item_name, line_total, created_at, source")
    .eq("source", "invoice")
    .gte("created_at", yearStart)
    .lt("created_at", yearEnd);
  if (yearErr) return NextResponse.json({ error: yearErr.message }, { status: 500 });

  const itemStats = new Map<string, { yearTotal: number; monthTotal: number }>();
  for (const row of yearLines ?? []) {
    const key = (row.item_name as string).trim();
    const entry = itemStats.get(key) ?? { yearTotal: 0, monthTotal: 0 };
    entry.yearTotal += Number(row.line_total || 0);
    const created = String(row.created_at);
    if (created.slice(0, 7) === month) entry.monthTotal += Number(row.line_total || 0);
    itemStats.set(key, entry);
  }

  const items = Array.from(itemStats.entries())
    .map(([item_name, v]) => ({ item_name, ...v }))
    .sort((a, b) => b.yearTotal - a.yearTotal);

  return NextResponse.json({
    month,
    year,
    houseTotals,
    warehouse: {
      items: warehouseItems,
      totalValue: warehouseValue,
    },
    itemCosts: items,
  });
}
