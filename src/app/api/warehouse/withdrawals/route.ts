import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

// سجل السحوبات من المخزن (لكل البيوت، أو بيت واحد محدد)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "warehouse" && session.role !== "admin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const houseId = searchParams.get("house_id");

  let query = supabaseServer()
    .from("purchase_lines")
    .select("id, item_name, quantity, unit_price, line_total, category, created_at, house_id, houses(name)")
    .eq("source", "warehouse_pull")
    .order("created_at", { ascending: false })
    .limit(200);

  if (houseId) query = query.eq("house_id", houseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withdrawals = (data ?? []).map((r) => ({
    id: r.id as string,
    item_name: r.item_name as string,
    quantity: r.quantity as number | null,
    unit_price: r.unit_price as number | null,
    line_total: r.line_total as number,
    category: r.category as string | null,
    created_at: r.created_at as string,
    house_id: r.house_id as string | null,
    house_name: ((r as unknown as { houses: { name: string } | null }).houses?.name) ?? "—",
  }));

  return NextResponse.json({ withdrawals });
}
