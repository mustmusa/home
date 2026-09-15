import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

function canManageWarehouse(role: string) {
  return role === "warehouse" || role === "admin";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageWarehouse(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name != null) patch.name = String(body.name).trim();
  // These are tested against undefined, not null, so emptying a field saves the
  // clearance instead of silently keeping the old value. Each still guards its
  // own conversion: Number(null) is 0 and String(null) is "null", either of
  // which would store a wrong value rather than an empty one.
  if (body.unit !== undefined) {
    patch.unit = body.unit ? String(body.unit).trim() || null : null;
  }
  if (body.unit_cost !== undefined) {
    const cost = Number(body.unit_cost);
    patch.unit_cost =
      body.unit_cost === null || body.unit_cost === "" || Number.isNaN(cost) ? null : cost;
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes ? String(body.notes).trim() || null : null;
  }
  if (body.category !== undefined) {
    patch.category = body.category ? String(body.category).trim() || null : null;
  }

  const db = supabaseServer();

  if (body.quantity != null) {
    const { data: existing } = await db
      .from("warehouse_items")
      .select("quantity")
      .eq("id", id)
      .maybeSingle();
    const newQty = Number(body.quantity);
    patch.quantity = newQty;
    if (existing) {
      const diff = newQty - Number(existing.quantity);
      if (diff !== 0) {
        await db.from("warehouse_movements").insert({
          warehouse_item_id: id,
          change_qty: diff,
          reason: "adjustment",
          note: "تعديل يدوي للكمية",
          created_by: session.uid,
        });
      }
    }
  }

  const { data, error } = await db.from("warehouse_items").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageWarehouse(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await supabaseServer().from("warehouse_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
