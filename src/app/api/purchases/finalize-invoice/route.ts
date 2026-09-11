import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";
import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

type ExtractedLine = {
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  category: string | null;
  suggested_request_id: string | null;
};

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "معرّف الجلسة مفقود" }, { status: 400 });
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

  // احصل على جميع الدفعات
  const { data: batches, error: batchesErr } = await db
    .from("temp_invoice_batches")
    .select("*")
    .eq("session_id", sessionId)
    .order("batch_number", { ascending: true });

  if (batchesErr || !batches || batches.length === 0) {
    return NextResponse.json({ error: "لم تجد أي بيانات للفاتورة" }, { status: 404 });
  }

  // اجمع جميع السطور من جميع الدفعات
  let allLines: ExtractedLine[] = [];
  let allImagePaths: string[] = [];

  for (const batch of batches) {
    allLines = allLines.concat(batch.extracted_lines || []);
    allImagePaths = allImagePaths.concat(batch.image_paths || []);
  }

  if (allLines.length === 0) {
    return NextResponse.json({ error: "لا توجد عناصر في الفاتورة" }, { status: 400 });
  }

  // حذف التكرار باستخدام Claude مع تحسينات أفضل
  let dedupedLines = allLines;
  try {
    const linesList = allLines
      .map(
        (l, i) =>
          `${i + 1}. [${l.item_name}] الكمية:${l.quantity} السعر:${l.unit_price} المجموع:${l.line_total}`,
      )
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `أنت متخصص في كشف العناصر المكررة في الفواتير.

عندي قائمة عناصر من فاتورة واحدة. البعض قد يكون مكرراً (نفس الاسم والسعر والكمية تماماً).

أرجع JSON فقط بهذه الصيغة (بدون نص إضافي):
{"toRemoveIndices": [1, 3, 5]}

ملاحظات:
- استخدم فهرسة من 1 (الرقم الأول = 1)
- حذف فقط النسخ المكررة الإضافية (احفظ أول ظهور)
- نفس الاسم والسعر والكمية = مكرر 100%
- إذا لم يوجد تكرار، ارجع: {"toRemoveIndices": []}

القائمة:
${linesList}`,
        },
      ],
    });

    const result = response.content[0];
    if (result.type === "text") {
      try {
        // حاول استخراج JSON من النص
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.toRemoveIndices) && parsed.toRemoveIndices.length > 0) {
            dedupedLines = allLines.filter((_, i) => !parsed.toRemoveIndices.includes(i + 1));
          }
        }
      } catch (e) {
        console.error("فشل parsing JSON:", e);
        // استخدم القائمة الكاملة إذا فشل parsing
      }
    }
  } catch (e) {
    console.error("فشل حذف التكرار:", e);
    // استخدم القائمة الكاملة إذا فشلت إزالة التكرار
  }

  // احسب المجموع الكلي والتحقق من الخصومات
  const total = dedupedLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
  const itemCount = dedupedLines.length;

  // احفظ الشراء الجديد
  const { data: purchaseData, error: purchaseErr } = await db
    .from("purchases")
    .insert({
      total_amount: total,
      status: "pending_approval",
      invoice_images: allImagePaths,
      notes: `استخرج من ${allLines.length} عنصر، تم حذف ${allLines.length - itemCount} مكررة`,
    })
    .select("id")
    .single();

  if (purchaseErr || !purchaseData) {
    return NextResponse.json({ error: "فشل حفظ الشراء: " + purchaseErr?.message }, { status: 500 });
  }

  // احفظ أسطر الشراء
  const linesToInsert = dedupedLines.map((line) => ({
    purchase_id: purchaseData.id,
    item_name: line.item_name,
    quantity: line.quantity,
    unit_price: line.unit_price,
    line_total: line.line_total,
    destination: line.suggested_request_id ? "house" : "warehouse",
    house_id: line.suggested_request_id ? pendingForMatch.find((p) => p.id === line.suggested_request_id)?.house_id : null,
    matched_request_id: line.suggested_request_id,
    source: "invoice",
    category: line.category,
  }));

  const { error: linesErr } = await db.from("purchase_lines").insert(linesToInsert);
  if (linesErr) {
    return NextResponse.json({ error: "فشل حفظ الأسطر: " + linesErr.message }, { status: 500 });
  }

  // احذف البيانات المؤقتة
  await db.from("temp_invoice_batches").delete().eq("session_id", sessionId);

  return NextResponse.json({
    success: true,
    purchaseId: purchaseData.id,
    lines: dedupedLines,
    imagePaths: allImagePaths,
    pendingRequests: pendingForMatch,
    summary: {
      totalItems: itemCount,
      originalItems: allLines.length,
      removedDuplicates: allLines.length - itemCount,
      totalAmount: total,
    },
  });
}
