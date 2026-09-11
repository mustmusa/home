import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { hashPin } from "@/lib/password";
import { signSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth";

// يسمح بإنشاء أول حساب أدمن فقط إذا كان جدول المستخدمين فارغًا تمامًا
async function isSetupOpen() {
  const { count, error } = await supabaseServer()
    .from("users")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

export async function GET() {
  try {
    const ready = await isSetupOpen();
    return NextResponse.json({ open: ready });
  } catch (e) {
    return NextResponse.json({ open: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const open = await isSetupOpen();
    if (!open) {
      return NextResponse.json({ error: "تم إنشاء الحسابات مسبقًا" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const pin = String(body.pin ?? "").trim();

    if (!name || !phone || pin.length < 4) {
      return NextResponse.json(
        { error: "الاسم ورقم الجوال مطلوبان، والرمز السري 4 أرقام على الأقل" },
        { status: 400 },
      );
    }

    const pin_hash = await hashPin(pin);
    const { data, error } = await supabaseServer()
      .from("users")
      .insert({ name, phone, pin_hash, role: "admin", house_id: null })
      .select()
      .single();

    if (error) throw error;

    const token = await signSession({
      uid: data.id as string,
      name: data.name as string,
      role: "admin",
      houseId: null,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
