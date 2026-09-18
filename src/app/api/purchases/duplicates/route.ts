import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { deletePurchase } from "@/lib/deletePurchase";
import { classifyDuplicates, type PurchaseRow } from "@/lib/duplicatePurchases";

async function findDuplicates(db: ReturnType<typeof supabaseServer>) {
  const { data, error } = await db
    .from("purchases")
    .select("id, store_name, total_amount, created_at, invoice_image_paths, purchase_lines(id)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows: PurchaseRow[] = (data ?? []).map((p: any) => ({
    id: p.id as string,
    store: String(p.store_name || "متجر").trim(),
    total: Number(p.total_amount || 0),
    items: (p.purchase_lines || []).length,
    created_at: p.created_at as string,
    has_image: Array.isArray(p.invoice_image_paths) && p.invoice_image_paths.length > 0,
  }));

  const candidates = classifyDuplicates(rows);
  return { candidates, scanned: rows.length };
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  try {
    const { candidates, scanned } = await findDuplicates(supabaseServer());
    return NextResponse.json({ duplicates: candidates, scanned });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const requested: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (requested.length === 0) {
      return NextResponse.json({ error: "لم تُحدَّد فواتير للحذف" }, { status: 400 });
    }

    const db = supabaseServer();
    // The set is recomputed here rather than trusted from the client, so a
    // stale screen can never delete an invoice that is no longer a duplicate.
    const { candidates } = await findDuplicates(db);
    const deletable = new Set(candidates.map((c) => c.id));

    const deleted: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of requested) {
      if (!deletable.has(id)) {
        skipped.push(id);
        continue;
      }
      const result = await deletePurchase(db, id, session.uid ?? null);
      if (result.ok) deleted.push(id);
      else failed.push({ id, error: result.error });
    }

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
      skipped: skipped.length,
      failed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
