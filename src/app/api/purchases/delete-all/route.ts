import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const db = supabaseServer();

  try {
    // حذف جميع أسطر الفواتير أولاً
    const { error: linesErr } = await db.from("purchase_lines").delete().neq("id", "");

    if (linesErr) {
      return NextResponse.json({ error: "فشل حذف أسطر الفواتير: " + linesErr.message }, { status: 500 });
    }

    // حذف جميع الفواتير
    const { error: purchasesErr } = await db.from("purchases").delete().neq("id", "");

    if (purchasesErr) {
      return NextResponse.json({ error: "فشل حذف الفواتير: " + purchasesErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "تم حذف جميع الفواتير والأسطر بنجاح" });
  } catch (e) {
    return NextResponse.json(
      { error: "خطأ: " + (e instanceof Error ? e.message : "خطأ غير معروف") },
      { status: 500 },
    );
  }
}
