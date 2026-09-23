import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { data, error } = await supabaseServer()
    .from("card_excluded_categories")
    .select("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: (data ?? []).map((r) => r.name as string) });
}

/** { name, excluded } — يضيف التصنيف إلى قائمة المستثنى أو يزيله منها. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "اسم التصنيف مطلوب" }, { status: 400 });

    const db = supabaseServer();
    if (body.excluded) {
      const { error } = await db
        .from("card_excluded_categories")
        .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await db.from("card_excluded_categories").delete().eq("name", name);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, name, excluded: Boolean(body.excluded) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
