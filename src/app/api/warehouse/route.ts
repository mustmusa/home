import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

function canManageWarehouse(role: string) {
  return role === "warehouse" || role === "admin";
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { data, error } = await supabaseServer()
    .from("warehouse_items")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageWarehouse(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const quantity = Number(body.quantity ?? 0);
  const unit = body.unit ? String(body.unit).trim() : null;
  const unit_cost = body.unit_cost != null ? Number(body.unit_cost) : null;
  const notes = body.notes ? String(body.notes).trim() : null;
  const category = body.category ? String(body.category).trim() : null;

  if (!name || quantity < 0) {
    return NextResponse.json({ error: "اسم العنصر والكمية مطلوبان" }, { status: 400 });
  }

  const db = supabaseServer();

  // لو العنصر موجود بنفس الاسم، أضف للكمية بدل إنشاء صف جديد
  const { data: existing } = await db
    .from("warehouse_items")
    .select("*")
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    const newQty = Number(existing.quantity) + quantity;
    const { data, error } = await db
      .from("warehouse_items")
      .update({
        quantity: newQty,
        unit: unit ?? existing.unit,
        unit_cost: unit_cost ?? existing.unit_cost,
        notes: notes ?? existing.notes,
        category: category ?? existing.category,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id as string)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from("warehouse_movements").insert({
      warehouse_item_id: existing.id as string,
      change_qty: quantity,
      reason: "purchase_in",
      note: "إضافة يدوية للمخزون",
      created_by: session.uid,
    });

    return NextResponse.json({ item: data });
  }

  const { data, error } = await db
    .from("warehouse_items")
    .insert({ name, quantity, unit, unit_cost, notes, category })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("warehouse_movements").insert({
    warehouse_item_id: data.id as string,
    change_qty: quantity,
    reason: "purchase_in",
    note: "عنصر جديد بالمخزون",
    created_by: session.uid,
  });

  return NextResponse.json({ item: data });
}
