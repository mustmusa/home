import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

type IncomingLine = {
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  destination: "house" | "warehouse";
  house_id: string | null;
  category: string | null;
  matched_request_id: string | null;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 30);

  const db = supabaseServer();

  // The house check here used to read the house row and then drop it, leaving
  // the query unfiltered — every household received every other household's
  // purchases. An inner join on the lines constrains both the purchases
  // returned and the lines embedded in them.
  const isAdmin = session.role === "admin";

  if (!isAdmin && !session.houseId) {
    return NextResponse.json({ purchases: [] });
  }

  const query = isAdmin
    ? db
        .from("purchases")
        .select("*, purchase_lines(*)")
        .order("created_at", { ascending: false })
        .limit(limit)
    : db
        .from("purchases")
        .select("*, purchase_lines!inner(*)")
        .eq("purchase_lines.destination", "house")
        .eq("purchase_lines.house_id", session.houseId)
        .order("created_at", { ascending: false })
        .limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const imagePaths: string[] = Array.isArray(body.imagePaths) ? body.imagePaths.map(String) : [];
  const storeName: string = body.storeName || "متجر";
  const lines = body.lines as IncomingLine[];

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "لا توجد أسطر لحفظها" }, { status: 400 });
  }

  for (const l of lines) {
    if (!l.item_name || !["house", "warehouse"].includes(l.destination)) {
      return NextResponse.json({ error: "بيانات سطر غير صالحة" }, { status: 400 });
    }
    if (l.destination === "house" && !l.house_id) {
      return NextResponse.json({ error: "يجب تحديد البيت لكل سطر وجهته بيت" }, { status: 400 });
    }
  }

  const db = supabaseServer();

  const totalAmount = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);
  const warehouseTotal = lines
    .filter((l) => l.destination === "warehouse")
    .reduce((s, l) => s + Number(l.line_total || 0), 0);

  const { data: purchase, error: purchaseErr } = await db
    .from("purchases")
    .insert({
      invoice_image_paths: imagePaths.length > 0 ? imagePaths : null,
      purchased_by: session.uid,
      total_amount: totalAmount,
      warehouse_total: warehouseTotal,
      store_name: storeName,
    })
    .select()
    .single();
  if (purchaseErr) return NextResponse.json({ error: purchaseErr.message }, { status: 500 });

  const lineRows = lines.map((l) => ({
    purchase_id: purchase.id as string,
    item_name: l.item_name.trim(),
    quantity: l.quantity,
    unit_price: l.unit_price,
    line_total: Number(l.line_total || 0),
    destination: l.destination,
    house_id: l.destination === "house" ? l.house_id : null,
    category: l.category ?? null,
    matched_request_id: l.matched_request_id,
    source: "invoice" as const,
  }));

  const { error: linesErr } = await db.from("purchase_lines").insert(lineRows);
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  // حدّث حالة الطلبات المطابقة إلى "تم الشراء"
  const matchedIds = lines.map((l) => l.matched_request_id).filter((id): id is string => !!id);
  if (matchedIds.length > 0) {
    await db.from("requests").update({ status: "purchased" }).in("id", matchedIds);
  }

  // أضف عناصر المخزون (وجهتها "warehouse") إلى جدول warehouse_items
  for (const l of lines) {
    if (l.destination !== "warehouse") continue;
    const qty = Number(l.quantity ?? 0);
    if (qty <= 0) continue;

    const { data: existing } = await db
      .from("warehouse_items")
      .select("*")
      .ilike("name", l.item_name.trim())
      .maybeSingle();

    if (existing) {
      await db
        .from("warehouse_items")
        .update({
          quantity: Number(existing.quantity) + qty,
          unit_cost: l.unit_price ?? existing.unit_cost,
          category: l.category ?? existing.category,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id as string);
      await db.from("warehouse_movements").insert({
        warehouse_item_id: existing.id as string,
        change_qty: qty,
        reason: "purchase_in",
        note: "من فاتورة",
        created_by: session.uid,
      });
    } else {
      const { data: created } = await db
        .from("warehouse_items")
        .insert({ name: l.item_name.trim(), quantity: qty, unit_cost: l.unit_price, category: l.category ?? null })
        .select()
        .single();
      if (created) {
        await db.from("warehouse_movements").insert({
          warehouse_item_id: created.id as string,
          change_qty: qty,
          reason: "purchase_in",
          note: "من فاتورة",
          created_by: session.uid,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, purchase });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const { lineId, item_name, quantity, unit_price, line_total, category, destination, house_id } = body;

  if (!lineId) {
    return NextResponse.json({ error: "معرّف السطر مفقود" }, { status: 400 });
  }

  const db = supabaseServer();

  const updateData: any = {};
  if (item_name !== undefined) updateData.item_name = item_name;
  if (quantity !== undefined) updateData.quantity = quantity;
  if (unit_price !== undefined) updateData.unit_price = unit_price;
  if (line_total !== undefined) updateData.line_total = line_total;
  if (category !== undefined) updateData.category = category;
  if (destination !== undefined) updateData.destination = destination;
  if (house_id !== undefined) updateData.house_id = house_id;

  const { error } = await db
    .from("purchase_lines")
    .update(updateData)
    .eq("id", lineId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const purchaseId = searchParams.get("id");

  if (!purchaseId) {
    return NextResponse.json({ error: "معرّف الفاتورة مفقود" }, { status: 400 });
  }

  const db = supabaseServer();

  // حذف جميع أسطر الفاتورة أولاً (من خلال الحذف المتسلسل)
  const { error: linesErr } = await db
    .from("purchase_lines")
    .delete()
    .eq("purchase_id", purchaseId);

  if (linesErr) {
    return NextResponse.json({ error: "فشل حذف أسطر الفاتورة: " + linesErr.message }, { status: 500 });
  }

  // حذف الفاتورة نفسها
  const { error: purchaseErr } = await db
    .from("purchases")
    .delete()
    .eq("id", purchaseId);

  if (purchaseErr) {
    return NextResponse.json({ error: "فشل حذف الفاتورة: " + purchaseErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
