import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { CATEGORIES } from "@/lib/types";

type Db = ReturnType<typeof supabaseServer>;

/**
 * A purchase's totals are the sum of its lines, so editing or removing one
 * leaves the ledger wrong until they are recomputed. The tax ratio the
 * invoice arrived with is preserved rather than re-derived.
 */
async function recomputePurchase(db: Db, purchaseId: string) {
  const { data: lines } = await db
    .from("purchase_lines")
    .select("line_total, destination")
    .eq("purchase_id", purchaseId);

  const total = (lines ?? []).reduce((s, l) => s + Number(l.line_total || 0), 0);
  const warehouseTotal = (lines ?? [])
    .filter((l) => l.destination === "warehouse")
    .reduce((s, l) => s + Number(l.line_total || 0), 0);

  const { data: purchase } = await db
    .from("purchases")
    .select("total_amount, total_with_tax")
    .eq("id", purchaseId)
    .maybeSingle();

  const oldTotal = Number(purchase?.total_amount ?? 0);
  const oldWithTax = Number(purchase?.total_with_tax ?? 0);
  const ratio = oldTotal > 0 && oldWithTax > 0 ? oldWithTax / oldTotal : 1;

  await db
    .from("purchases")
    .update({
      total_amount: total,
      warehouse_total: warehouseTotal,
      total_with_tax: Number((total * ratio).toFixed(2)),
    })
    .eq("id", purchaseId);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { lineId } = body;
    if (!lineId) {
      return NextResponse.json({ error: "معرّف السطر مفقود" }, { status: 400 });
    }

    const db = supabaseServer();
    const { data: line, error: readErr } = await db
      .from("purchase_lines")
      .select("id, purchase_id, quantity, unit_price")
      .eq("id", lineId)
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!line) return NextResponse.json({ error: "السطر غير موجود" }, { status: 404 });

    const patch: Record<string, unknown> = {};

    if (body.itemName !== undefined) {
      const name = String(body.itemName).trim();
      if (!name) return NextResponse.json({ error: "الاسم لا يمكن أن يكون فارغاً" }, { status: 400 });
      patch.item_name = name;
    }

    if (body.destination !== undefined) {
      if (body.destination !== "house" && body.destination !== "warehouse") {
        return NextResponse.json({ error: "الوجهة يجب أن تكون بيت أو مخزن" }, { status: 400 });
      }
      if (body.destination === "house" && !body.houseId) {
        return NextResponse.json({ error: "يجب تحديد البيت" }, { status: 400 });
      }
      patch.destination = body.destination;
      patch.house_id = body.destination === "house" ? body.houseId : null;
    }

    if (body.category !== undefined) {
      patch.category = CATEGORIES.includes(body.category) ? body.category : null;
    }

    // Quantity and price drive line_total, so they are resolved together
    // against the stored values whichever of the two was edited.
    const quantity =
      body.quantity !== undefined ? Number(body.quantity) : Number(line.quantity ?? 1);
    const unitPrice =
      body.unitPrice !== undefined ? Number(body.unitPrice) : Number(line.unit_price ?? 0);

    if (body.quantity !== undefined || body.unitPrice !== undefined) {
      if (!Number.isFinite(quantity) || quantity < 0) {
        return NextResponse.json({ error: "كمية غير صالحة" }, { status: 400 });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "سعر غير صالح" }, { status: 400 });
      }
      patch.quantity = quantity;
      patch.unit_price = unitPrice;
      patch.line_total = Number((quantity * unitPrice).toFixed(2));
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد تغيير" }, { status: 400 });
    }

    const { error } = await db.from("purchase_lines").update(patch).eq("id", lineId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (line.purchase_id) await recomputePurchase(db, line.purchase_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { lineId } = await req.json();
    if (!lineId) return NextResponse.json({ error: "معرّف السطر مفقود" }, { status: 400 });

    const db = supabaseServer();
    const { data: line } = await db
      .from("purchase_lines")
      .select("purchase_id")
      .eq("id", lineId)
      .maybeSingle();

    const { error } = await db.from("purchase_lines").delete().eq("id", lineId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (line?.purchase_id) await recomputePurchase(db, line.purchase_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
