import type { SupabaseClient } from "@supabase/supabase-js";

export type DeletePurchaseResult =
  | { ok: true; restoredRequests: number; stockReversed: number }
  | { ok: false; error: string; status: number };

/**
 * Removes a purchase and undoes what saving it changed elsewhere: requests it
 * closed go back to pending, and stock it added is taken off again. Shared by
 * the per-invoice delete and the duplicate cleanup so the two cannot drift.
 */
export async function deletePurchase(
  db: SupabaseClient,
  id: string,
  userId: string | null
): Promise<DeletePurchaseResult> {
  const { data: purchase, error: readErr } = await db
    .from("purchases")
    .select("id, store_name")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message, status: 500 };
  if (!purchase) return { ok: false, error: "الفاتورة غير موجودة", status: 404 };

  const { data: lines, error: linesErr } = await db
    .from("purchase_lines")
    .select("item_name, quantity, destination, source, matched_request_id")
    .eq("purchase_id", id);
  if (linesErr) return { ok: false, error: linesErr.message, status: 500 };

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
      created_by: userId,
    });
    stockReversed += 1;
  }

  // purchase_lines cascade; card_transactions.purchase_id is set null.
  const { error: delErr } = await db.from("purchases").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message, status: 500 };

  return { ok: true, restoredRequests: matchedIds.length, stockReversed };
}
