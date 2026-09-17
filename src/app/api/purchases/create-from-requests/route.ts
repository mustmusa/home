import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

type Item = {
  requestId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  destination: "house" | "warehouse";
  houseId: string | null;
  category: string | null;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { storeName, purchasedAt, items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "لا توجد عناصر للشراء" }, { status: 400 });
    }

    const clean: Item[] = [];
    for (const it of items as Item[]) {
      const quantity = Number(it.quantity);
      const unitPrice = Number(it.unitPrice);
      if (!it.itemName?.trim()) {
        return NextResponse.json({ error: "اسم عنصر فارغ" }, { status: 400 });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json(
          { error: `سعر غير صالح للعنصر: ${it.itemName}` },
          { status: 400 }
        );
      }
      clean.push({
        ...it,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPrice,
      });
    }

    const total = clean.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const warehouseTotal = clean
      .filter((it) => it.destination === "warehouse")
      .reduce((s, it) => s + it.quantity * it.unitPrice, 0);

    const db = supabaseServer();

    const { data: purchase, error: purchaseErr } = await db
      .from("purchases")
      .insert({
        // Prices are entered as paid, so there is no separate tax to derive.
        total_amount: total,
        total_with_tax: total,
        warehouse_total: warehouseTotal,
        store_name: String(storeName || "").trim() || "إدخال يدوي",
        purchased_by: session.uid,
        purchased_at: purchasedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (purchaseErr || !purchase) {
      return NextResponse.json(
        { error: purchaseErr?.message ?? "فشل إنشاء الفاتورة" },
        { status: 500 }
      );
    }

    const { error: linesErr } = await db.from("purchase_lines").insert(
      clean.map((it) => ({
        purchase_id: purchase.id,
        item_name: it.itemName.trim(),
        quantity: it.quantity,
        unit_price: it.unitPrice,
        line_total: it.quantity * it.unitPrice,
        destination: it.destination,
        house_id: it.destination === "house" ? it.houseId : null,
        matched_request_id: it.requestId,
        source: "manual" as const,
        category: it.category,
      }))
    );

    if (linesErr) {
      // Otherwise a failed run leaves an empty purchase behind in the ledger.
      await db.from("purchases").delete().eq("id", purchase.id);
      return NextResponse.json({ error: linesErr.message }, { status: 500 });
    }

    const requestIds = clean.map((it) => it.requestId).filter(Boolean);
    if (requestIds.length > 0) {
      const { error: updateErr } = await db
        .from("requests")
        .update({ status: "purchased" })
        .in("id", requestIds);
      if (updateErr) {
        return NextResponse.json(
          { error: `حُفظت الفاتورة لكن تعذّر تحديث الطلبات: ${updateErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      purchaseId: purchase.id,
      itemsCount: clean.length,
      total,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطأ غير متوقع" },
      { status: 500 }
    );
  }
}
