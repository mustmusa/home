import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { requestIds } = await req.json();

  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return NextResponse.json({ error: "لا توجد طلبات للشراء" }, { status: 400 });
  }

  const db = supabaseServer();

  try {
    // احصل على بيانات الطلبات
    const { data: requests, error: reqErr } = await db
      .from("requests")
      .select("*")
      .in("id", requestIds);

    if (reqErr || !requests) {
      return NextResponse.json({ error: "فشل جلب الطلبات" }, { status: 500 });
    }

    // احسب الإجمالي
    const totalAmount = requests.reduce(
      (sum, r) => sum + (Number(r.quantity_requested || 0) * 10), // تقدير مؤقت
      0
    );

    // أنشئ شراء جديد
    const { data: purchase, error: purchaseErr } = await db
      .from("purchases")
      .insert({
        total_amount: totalAmount,
        total_with_tax: totalAmount * 1.15,
        store_name: "من الطلبات",
        purchased_by: session.uid,
      })
      .select()
      .single();

    if (purchaseErr || !purchase) {
      return NextResponse.json({ error: "فشل إنشاء الشراء" }, { status: 500 });
    }

    // أنشئ أسطر الشراء من الطلبات
    const lineRows = requests.map((r) => ({
      purchase_id: purchase.id,
      item_name: r.item_name,
      quantity: r.quantity_requested,
      line_total: Number(r.quantity_requested || 0) * 10,
      destination: "warehouse" as const,
      house_id: r.house_id,
      matched_request_id: r.id,
      source: "request" as const,
      category: null,
    }));

    const { error: linesErr } = await db.from("purchase_lines").insert(lineRows);

    if (linesErr) {
      return NextResponse.json({ error: "فشل حفظ الأسطر" }, { status: 500 });
    }

    // حدّث حالة الطلبات إلى "purchased"
    const { error: updateErr } = await db
      .from("requests")
      .update({ status: "purchased" })
      .in("id", requestIds);

    if (updateErr) {
      console.error("تحذير: فشل تحديث حالة الطلبات", updateErr);
    }

    return NextResponse.json({
      ok: true,
      purchaseId: purchase.id,
      requestsCount: requests.length,
      totalAmount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطأ غير متوقع" },
      { status: 500 }
    );
  }
}
