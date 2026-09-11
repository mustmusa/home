import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { parseRequestText } from "@/lib/anthropic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const houseId = searchParams.get("house_id");

  let query = supabaseServer()
    .from("requests")
    .select("*")
    .order("requested_at", { ascending: false });

  // الزوجة ترى فقط طلبات بيتها
  if (session.role === "wife") {
    if (!session.houseId) return NextResponse.json({ requests: [] });
    query = query.eq("house_id", session.houseId);
  } else if (houseId) {
    query = query.eq("house_id", houseId);
  }

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "wife" && session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = await req.json();
  const rawText = String(body.text ?? "").trim();
  const houseId = session.role === "wife" ? session.houseId : String(body.house_id ?? "");

  if (!rawText) return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
  if (!houseId) return NextResponse.json({ error: "لا يوجد بيت مرتبط بحسابك" }, { status: 400 });

  let items;
  try {
    items = await parseRequestText(rawText);
  } catch (e) {
    return NextResponse.json({ error: "تعذّر تفسير الرسالة: " + String(e) }, { status: 502 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "لم أستطع استخراج أي عنصر من الرسالة" }, { status: 422 });
  }

  const rows = items.map((it) => ({
    house_id: houseId,
    raw_text: rawText,
    item_name: it.item_name,
    quantity_text: it.quantity_text,
    status: "pending" as const,
    requested_by: session.uid,
  }));

  const { data, error } = await supabaseServer().from("requests").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data });
}
