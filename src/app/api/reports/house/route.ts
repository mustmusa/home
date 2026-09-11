import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// تقرير مصاريف بيت واحد (لصاحبة البيت نفسها) — مبوّب حسب التصنيف، مع تفاصيل كل عنصر
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "wife" || !session.houseId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month =
    searchParams.get("month") ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const { start, end } = monthRange(month);

  const db = supabaseServer();
  const { data: lines, error } = await db
    .from("purchase_lines")
    .select("item_name, quantity, unit_price, line_total, category, created_at")
    .eq("house_id", session.houseId)
    .eq("destination", "house")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = lines ?? [];
  const total = rows.reduce((s, r) => s + Number(r.line_total || 0), 0);

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const cat = (r.category as string | null) ?? "أخرى";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(r.line_total || 0));
  }
  const categories = Array.from(byCategory.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ month, total, categories, items: rows });
}
