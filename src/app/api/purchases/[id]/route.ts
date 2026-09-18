import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (body.storeName !== undefined) {
      const name = String(body.storeName).trim();
      if (!name) return NextResponse.json({ error: "اسم المتجر مطلوب" }, { status: 400 });
      patch.store_name = name;
    }
    if (body.purchasedAt !== undefined) patch.purchased_at = body.purchasedAt;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد تغيير" }, { status: 400 });
    }

    const ids: string[] = Array.isArray(body.alsoIds) ? [id, ...body.alsoIds] : [id];
    const { error } = await supabaseServer().from("purchases").update(patch).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const db = supabaseServer();

    const { data: purchase, error: readErr } = await db
      .from("purchases")
      .select("id, store_name")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!purchase) return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });

    const { data: lines, error: linesErr } = await db
      .from("purchase_lines")
      .select("item_name, quantity, destination, source, matched_request_id")
      .eq("purchase_id", id);
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

    // Requests this invoice closed go back to pending, otherwise deleting the
    // invoice would silently drop the items from the household's list.
    const matchedIds = (lines ?? [])
      .map((l) => l.matched_request_id as string | null)
      .filter((v): v is string => !!v);
    if (matchedIds.length > 0) {
      await db.from("requests").update({ status: "pending" }).in("id", matchedIds);
    }

    // Stock is only ever added by the invoice-save path (source 'invoice'),
    // so only those lines are reversed — manual entries never raised it.
    let stockReversed = 0;
    for (const l of lines ?? []) {
      if (l.destination !== "warehouse" || l.source !== "invoice") continue;
      const qty = Number(l.quantity ?? 0);
      if (qty <= 0) continue;

      const { data: item } = await db
        .from("warehouse_items")
        .select("id, quantity")
        .ilike("name", String(l.item_name).trim())
        .maybeSingle();
      if (!item) continue;

      // Some of it may already have been pulled out, so never go negative.
      const remaining = Math.max(0, Number(item.quantity) - qty);
      const change = remaining - Number(item.quantity);
      if (change === 0) continue;

      await db
        .from("warehouse_items")
        .update({ quantity: remaining, updated_at: new Date().toISOString() })
        .eq("id", item.id as string);
      await db.from("warehouse_movements").insert({
        warehouse_item_id: item.id as string,
        change_qty: change,
        reason: "adjustment",
        note: `حذف فاتورة ${purchase.store_name ?? ""}`.trim(),
        created_by: session.uid,
      });
      stockReversed += 1;
    }

    // purchase_lines cascade; card_transactions.purchase_id is set null.
    const { error: delErr } = await db.from("purchases").delete().eq("id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      restoredRequests: matchedIds.length,
      stockReversed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
