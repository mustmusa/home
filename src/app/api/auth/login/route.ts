import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyPin } from "@/lib/password";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { errorMessage } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = String(body.phone ?? "").trim();
    const pin = String(body.pin ?? "").trim();

    if (!phone || !pin) {
      return NextResponse.json({ error: "أدخل رقم الجوال والرمز السري" }, { status: 400 });
    }

    const { data: user, error } = await supabaseServer()
      .from("users")
      .select("id, name, pin_hash, role, house_id")
      .eq("phone", phone)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return NextResponse.json({ error: "رقم الجوال أو الرمز السري غير صحيح" }, { status: 401 });
    }

    const valid = await verifyPin(pin, user.pin_hash as string);
    if (!valid) {
      return NextResponse.json({ error: "رقم الجوال أو الرمز السري غير صحيح" }, { status: 401 });
    }

    const token = await signSession({
      uid: user.id as string,
      name: user.name as string,
      role: user.role as Role,
      houseId: (user.house_id as string | null) ?? null,
    });

    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
