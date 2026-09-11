import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { hashPin } from "@/lib/password";
import type { Role } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { data, error } = await supabaseServer()
    .from("users")
    .select("id, name, phone, role, house_id")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  const role = String(body.role ?? "") as Role;
  const houseId = body.house_id ? String(body.house_id) : null;

  if (!name || !phone || pin.length < 4 || !["wife", "warehouse", "admin"].includes(role)) {
    return NextResponse.json({ error: "بيانات ناقصة أو غير صالحة" }, { status: 400 });
  }
  if (role === "wife" && !houseId) {
    return NextResponse.json({ error: "يجب تحديد البيت لحساب الزوجة" }, { status: 400 });
  }

  const pin_hash = await hashPin(pin);
  const { data, error } = await supabaseServer()
    .from("users")
    .insert({ name, phone, pin_hash, role, house_id: role === "wife" ? houseId : null })
    .select("id, name, phone, role, house_id")
    .single();

  if (error) {
    const msg = error.message.includes("duplicate") ? "رقم الجوال مستخدم مسبقًا" : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
