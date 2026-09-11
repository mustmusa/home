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

const MAX_IMAGES_PER_BATCH = 3;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const form = await req.formData();
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  const sessionId = form.get("sessionId") as string;
  const batchNumber = parseInt(form.get("batchNumber") as string) || 1;

  if (!sessionId) {
    return NextResponse.json({ error: "معرّف الجلسة مفقود" }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "لم يتم إرفاق أي صورة" }, { status: 400 });
  }

  if (files.length > MAX_IMAGES_PER_BATCH) {
    return NextResponse.json(
      { error: `الحد الأقصى ${MAX_IMAGES_PER_BATCH} صور لكل دفعة` },
      { status: 400 },
    );
  }

  const prepared: { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" }[] = [];
  for (const file of files) {
    const mediaType = ALLOWED_TYPES[file.type];
    if (!mediaType) {
      return NextResponse.json({ error: "صيغة الصورة غير مدعومة (JPEG/PNG/WebP فقط)" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم إحدى الصور كبير جدًا (الحد 15 ميجابايت)" }, { status: 400 });
    }
    prepared.push({ bytes, mediaType });
  }

  const db = supabaseServer();

  // احصل على الطلبات المعلقة لمطابقة الأسماء
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

  // استخرج البيانات من الصور
  let lines;
  try {
    lines = await extractInvoiceLines(
      prepared.map((p) => ({ base64: Buffer.from(p.bytes).toString("base64"), mediaType: p.mediaType })),
      pendingForMatch,
    );
  } catch (e) {
    return NextResponse.json({ error: "تعذّر قراءة الفاتورة: " + errorMessage(e) }, { status: 502 });
  }

  // رفع الصور إلى التخزين
  const bucket = process.env.SUPABASE_INVOICES_BUCKET ?? "invoices";
  const datePrefix = new Date().toISOString().slice(0, 10);
  const batchId = crypto.randomUUID();

  const imagePaths: string[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const { bytes, mediaType } = prepared[i];
    const path = `${datePrefix}/${sessionId}/${batchId}-${i + 1}.${mediaType.split("/")[1]}`;
    const { error: uploadErr } = await db.storage.from(bucket).upload(path, bytes, {
      contentType: mediaType,
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json({ error: "تعذّر رفع الصورة: " + uploadErr.message }, { status: 500 });
    }
    imagePaths.push(path);
  }

  // احفظ البيانات المؤقتة
  const { error: saveErr } = await db.from("temp_invoice_batches").insert({
    session_id: sessionId,
    batch_number: batchNumber,
    image_paths: imagePaths,
    extracted_lines: JSON.parse(JSON.stringify(lines)),
  });

  if (saveErr) {
    return NextResponse.json({ error: "تعذّر حفظ البيانات المؤقتة: " + saveErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    batchNumber,
    lineCount: (lines ?? []).length,
    imagePaths,
  });
}
