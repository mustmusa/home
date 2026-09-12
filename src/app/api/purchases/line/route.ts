import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { lineId, destination, houseId } = await req.json();
  if (!lineId || !destination) {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  }

  if (destination !== "house" && destination !== "warehouse") {
    return NextResponse.json({ error: "الوجهة يجب أن تكون بيت أو مخزن" }, { status: 400 });
  }

  if (destination === "house" && !houseId) {
    return NextResponse.json({ error: "يجب تحديد البيت" }, { status: 400 });
  }

  const db = supabaseServer();
  const { error } = await db
    .from("purchase_lines")
    .update({
      destination,
      house_id: destination === "house" ? houseId : null,
    })
    .eq("id", lineId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
