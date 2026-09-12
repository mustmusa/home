import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

type UpdatePriceRequest = {
  lineId: string;
  unitPrice: number;
  lineTotal: number;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const db = supabaseServer();

  // احصل على الفواتير التي تحتوي على أسطر بأسعار = 0
  const { data: zeroItems, error } = await db
    .from("purchase_lines")
    .select("id, purchase_id, item_name, quantity, unit_price, line_total, purchases(id, store_name, created_at)")
    .or("line_total.eq.0,unit_price.eq.0")
    .order("created_at", { ascending: false, referencedTable: "purchases" })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const grouped: Record<
    string,
    {
      purchaseId: string;
      storeName: string;
      date: string;
      items: Array<{
        lineId: string;
        itemName: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }>;
    }
  > = {};

  (zeroItems || []).forEach((item: any) => {
    const purchase = item.purchases;
    const key = purchase.id;
    if (!grouped[key]) {
      grouped[key] = {
        purchaseId: purchase.id,
        storeName: purchase.store_name || "متجر",
        date: purchase.created_at ? purchase.created_at.slice(0, 10) : "—",
        items: [],
      };
    }
    grouped[key].items.push({
      lineId: item.id,
      itemName: item.item_name,
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unit_price || 0),
      lineTotal: Number(item.line_total || 0),
    });
  });

  return NextResponse.json({
    invoicesNeedingPrices: Object.values(grouped),
    totalItems: (zeroItems || []).length,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const updates = (await req.json()) as UpdatePriceRequest[];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "لا توجد تحديثات" }, { status: 400 });
  }

  const db = supabaseServer();

  let successCount = 0;
  const errors: string[] = [];

  for (const update of updates) {
    if (!update.lineId || update.unitPrice < 0 || update.lineTotal < 0) {
      errors.push(`تحديث غير صحيح: ${update.lineId}`);
      continue;
    }

    const { error } = await db
      .from("purchase_lines")
      .update({
        unit_price: update.unitPrice,
        line_total: update.lineTotal,
      })
      .eq("id", update.lineId);

    if (error) {
      errors.push(`فشل تحديث ${update.lineId}: ${error.message}`);
    } else {
      successCount++;
    }
  }

  return NextResponse.json({
    success: successCount > 0,
    updated: successCount,
    failed: errors.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : [],
  });
}
