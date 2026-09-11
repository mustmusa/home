import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

// يسحب كمية من عنصر بالمخزن ويحوّلها لأحد البيتين (يُنشئ سطر "مصروف" بدون فاتورة جديدة)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "warehouse" && session.role !== "admin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const warehouseItemId = String(body.warehouse_item_id ?? "");
  const houseId = String(body.house_id ?? "");
  const quantity = Number(body.quantity ?? 0);
  const matchedRequestId = body.matched_request_id ? String(body.matched_request_id) : null;

  if (!warehouseItemId || !houseId || quantity <= 0) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: item, error: itemErr } = await db
    .from("warehouse_items")
    .select("*")
    .eq("id", warehouseItemId)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "العنصر غير موجود بالمخزن" }, { status: 404 });
  if (Number(item.quantity) < quantity) {
    return NextResponse.json({ error: "الكمية المتوفرة بالمخزن أقل من المطلوب" }, { status: 400 });
  }

  const unitCost = Number(item.unit_cost ?? 0);
  const lineTotal = unitCost * quantity;

  const { error: updateErr } = await db
    .from("warehouse_items")
    .update({ quantity: Number(item.quantity) - quantity, updated_at: new Date().toISOString() })
    .eq("id", warehouseItemId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await db.from("warehouse_movements").insert({
    warehouse_item_id: warehouseItemId,
    change_qty: -quantity,
    reason: "pull_out",
    related_house_id: houseId,
    created_by: session.uid,
  });

  const { data: line, error: lineErr } = await db
    .from("purchase_lines")
    .insert({
      purchase_id: null,
      item_name: item.name,
      quantity,
      unit_price: unitCost,
      line_total: lineTotal,
      destination: "house",
      house_id: houseId,
      category: item.category ?? null,
      matched_request_id: matchedRequestId,
      source: "warehouse_pull",
    })
    .select()
    .single();
  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  if (matchedRequestId) {
    await db.from("requests").update({ status: "purchased" }).eq("id", matchedRequestId);
  }

  return NextResponse.json({ ok: true, line });
}
