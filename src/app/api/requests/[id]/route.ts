import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const status = String(body.status ?? "");
  const item_name = body.item_name ? String(body.item_name) : undefined;
  const quantity_text = body.quantity_text ? String(body.quantity_text) : undefined;

  if (status && !["pending", "purchased", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
  }

  // الزوجة تقدر تلغي طلبها الخاص فقط، والأدمن يقدر يعدّل أي طلب
  const db = supabaseServer();
  const { data: existing, error: fetchErr } = await db
    .from("requests")
    .select("house_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  if (session.role === "wife" && existing.house_id !== session.houseId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (session.role === "warehouse") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const updateData: any = {};
  if (status) updateData.status = status;
  if (item_name) updateData.item_name = item_name;
  if (quantity_text) updateData.quantity_text = quantity_text;

  const { error } = await db.from("requests").update(updateData).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
