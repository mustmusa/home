import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { extractInvoiceLines } from "@/lib/anthropic";
import { errorMessage } from "@/lib/errors";

const ALLOWED_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق صورة" }, { status: 400 });
  }

  const mediaType = ALLOWED_TYPES[file.type];
  if (!mediaType) {
    return NextResponse.json({ error: "صيغة الصورة غير مدعومة (JPEG/PNG/WebP فقط)" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "حجم الصورة كبير جدًا (الحد 15 ميجابايت)" }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: pending, error: pendingErr } = await db
    .from("requests")
    .select("id, item_name, quantity_text, house_id, houses(name)")
    .eq("status", "pending");
  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 });

  const pendingForMatch = (pending ?? []).map((r) => ({
    id: r.id as string,
    item_name: r.item_name as string,
    quantity_text: r.quantity_text as string | null,
    house_id: r.house_id as string,
    house_name: ((r as unknown as { houses: { name: string } | null }).houses?.name) ?? "بيت",
  }));

  const base64 = Buffer.from(bytes).toString("base64");

  let lines;
  try {
    lines = await extractInvoiceLines(base64, mediaType, pendingForMatch);
  } catch (e) {
    return NextResponse.json({ error: "تعذّر قراءة الفاتورة: " + errorMessage(e) }, { status: 502 });
  }

  const bucket = process.env.SUPABASE_INVOICES_BUCKET ?? "invoices";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${mediaType.split("/")[1]}`;

  const { error: uploadErr } = await db.storage.from(bucket).upload(path, bytes, {
    contentType: mediaType,
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: "تعذّر رفع الصورة: " + uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({ lines, imagePath: path, pendingRequests: pendingForMatch });
}
