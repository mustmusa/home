import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyPin } from "@/lib/password";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { errorMessage } from "@/lib/errors";

type UserRow = {
  id: string;
  name: string;
  pin_hash: string;
  role: Role;
  house_id: string | null;
  houses: { name: string } | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = String(body.phone ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    const userId = body.userId ? String(body.userId) : null;

    if (!phone || !pin) {
      return NextResponse.json({ error: "أدخل رقم الجوال والرمز السري" }, { status: 400 });
    }

    const db = supabaseServer();

    // لو المستخدم اختار حساب معيّن (بعد ما شفنا له أكثر من دور)، تحقق من هذا الحساب فقط
    if (userId) {
      const { data: user, error } = await db
        .from("users")
        .select("id, name, pin_hash, role, house_id, houses(name)")
        .eq("id", userId)
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw error;
      if (!user || !(await verifyPin(pin, user.pin_hash as string))) {
        return NextResponse.json({ error: "رقم الجوال أو الرمز السري غير صحيح" }, { status: 401 });
      }
      return finalizeLogin(user as unknown as UserRow);
    }

    // ابحث عن كل الحسابات المرتبطة بهذا الجوال (ممكن يكون أكثر من دور)
    const { data: candidates, error } = await db
      .from("users")
      .select("id, name, pin_hash, role, house_id, houses(name)")
      .eq("phone", phone);
    if (error) throw error;

    const matches: UserRow[] = [];
    for (const c of candidates ?? []) {
      if (await verifyPin(pin, c.pin_hash as string)) matches.push(c as unknown as UserRow);
    }

    if (matches.length === 0) {
      return NextResponse.json({ error: "رقم الجوال أو الرمز السري غير صحيح" }, { status: 401 });
    }

    if (matches.length === 1) {
      return finalizeLogin(matches[0]);
    }

    // أكثر من حساب مطابق — اعرض قائمة اختيار بدون تسجيل دخول بعد
    return NextResponse.json({
      chooseAccount: true,
      accounts: matches.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        houseId: m.house_id,
        houseName: m.houses?.name ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

async function finalizeLogin(user: UserRow) {
  const token = await signSession({
    uid: user.id,
    name: user.name,
    role: user.role,
    houseId: user.house_id,
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
}
