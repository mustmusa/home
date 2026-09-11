import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { hashPin } from "@/lib/password";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.phone != null) patch.phone = String(body.phone).trim();
  if (body.house_id !== undefined) patch.house_id = body.house_id ? String(body.house_id) : null;
  if (body.pin) {
    if (String(body.pin).length < 4) {
      return NextResponse.json({ error: "الرمز السري 4 أرقام على الأقل" }, { status: 400 });
    }
    patch.pin_hash = await hashPin(String(body.pin));
  }

  const { data, error } = await supabaseServer()
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("id, name, phone, role, house_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.uid) {
    return NextResponse.json({ error: "لا يمكنك حذف حسابك الحالي" }, { status: 400 });
  }
  const { error } = await supabaseServer().from("users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
