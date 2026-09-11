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

  // حذف التكرار باستخدام Claude
  let dedupedLines = allLines;
  try {
    const linesList = allLines
      .map((l, i) => `${i + 1}. "${l.item_name}" - السعر: ${l.unit_price}, الكمية: ${l.quantity}, المجموع: ${l.line_total}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `عندي قائمة عناصر من فاتورة. بعض العناصر قد تكون مكررة (نفس الاسم والسعر).
أرجع JSON فقط بصيغة: {"toRemoveIndices": [1, 3, 5]} (الفهارس التي يجب حذفها)
استخدم الفهرسة من 1.

القائمة:
${linesList}`,
        },
      ],
    });

    const result = response.content[0];
    if (result.type === "text") {
      try {
        const parsed = JSON.parse(result.text);
        if (Array.isArray(parsed.toRemoveIndices)) {
          dedupedLines = allLines.filter((_, i) => !parsed.toRemoveIndices.includes(i + 1));
        }
      } catch {
        // استخدم القائمة الكاملة إذا فشل parsing
      }
    }
  } catch {
    // استخدم القائمة الكاملة إذا فشلت إزالة التكرار
  }

  // احسب المجموع الكلي والتحقق من الخصومات
  const total = dedupedLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
  const itemCount = dedupedLines.length;

  // احذف البيانات المؤقتة
  await db.from("temp_invoice_batches").delete().eq("session_id", sessionId);

  return NextResponse.json({
    success: true,
    lines: dedupedLines,
    imagePaths: allImagePaths,
    summary: {
      totalItems: itemCount,
      originalItems: allLines.length,
      removedDuplicates: allLines.length - itemCount,
      totalAmount: total,
    },
  });
}
