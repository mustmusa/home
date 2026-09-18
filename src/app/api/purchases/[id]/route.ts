import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { deletePurchase } from "@/lib/deletePurchase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (body.storeName !== undefined) {
      const name = String(body.storeName).trim();
      if (!name) return NextResponse.json({ error: "اسم المتجر مطلوب" }, { status: 400 });
      patch.store_name = name;
    }
    if (body.purchasedAt !== undefined) patch.purchased_at = body.purchasedAt;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا يوجد تغيير" }, { status: 400 });
    }

    const ids: string[] = Array.isArray(body.alsoIds) ? [id, ...body.alsoIds] : [id];
    const { error } = await supabaseServer().from("purchases").update(patch).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await deletePurchase(supabaseServer(), id, session.uid ?? null);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      restoredRequests: result.restoredRequests,
      stockReversed: result.stockReversed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
