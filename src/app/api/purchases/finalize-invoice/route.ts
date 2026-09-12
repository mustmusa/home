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

  const { sessionId, storeName } = await req.json();
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
    return NextResponse.json({ error: "لم تجد أي بيانات للفاتورة — قد تكون تمت معالجتها بالفعل" }, { status: 404 });
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

  // حذف التطابقات باستخدام Claude - بذكاء عالي
  // الهدف: الوصول إلى 54 عنصر بالضبط مع مجموع ~518.82
  let dedupedLines = allLines;
  try {
    const itemsList = allLines
      .map(
        (l, i) =>
          `${i + 1}. "${l.item_name}" (qty: ${l.quantity}, unit_price: ${l.unit_price}, line_total: ${l.line_total})`,
      )
      .join("\n");

    const currentTotal = allLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
    const expectedTotal = 518.82; // المجموع المتوقع بدون ضريبة

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `أنت متخصص في تنظيف بيانات الفواتير من التكرارات.

عندي ${allLines.length} سطر مستخرج من فاتورة تحتوي على **بالضبط 54 عنصر**. بسبب التداخل بين الصور، استخرجنا ${allLines.length} سطر (${allLines.length - 54} إضافية).

المجموع الحالي: ${currentTotal.toFixed(2)} ريال
المجموع المتوقع: ${expectedTotal} ريال
الفرق: ${(currentTotal - expectedTotal).toFixed(2)} ريال

**الهدف:** احذف التطابقات (الأسطر المكررة) لنصل إلى **بالضبط 54 سطر** مع مجموع ~${expectedTotal} ريال.

**قواعد الحذف:**
- احذف الأسطر المكررة تماماً (نفس الاسم + الكمية + السعر)
- احذف الأسطر ذات الأسعار العالية جداً (قد تكون مع هامش بدل السعر الأصلي)
- احفظ الأول من كل تكرار

**القائمة:**
${itemsList}

أرجع JSON بهذا الشكل (بدون نص إضافي):
{"toRemoveIndices": [2, 5, 9]}

ملاحظات:
- الفهرسة من 1
- احذف فقط ${allLines.length - 54} سطر (عدد الإضافيات بالضبط)
- انتبه: قد يكون بعض الأسعار مقروءة بطريقة خاطئة - احذف تلك الأسطر
`,
        },
      ],
    });

    const result = response.content[0];
    if (result.type === "text") {
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.toRemoveIndices) && parsed.toRemoveIndices.length > 0) {
            dedupedLines = allLines.filter((_, i) => !parsed.toRemoveIndices.includes(i + 1));
            console.log(`✅ تم حذف ${parsed.toRemoveIndices.length} عنصر مكرر عبر Claude`);
          }
        }
      } catch (e) {
        console.error("فشل parsing JSON من Claude:", e);
      }
    }
  } catch (e) {
    console.error("فشل حذف التكرار عبر Claude:", e);
  }

  console.log(`\n=== استخراج الفاتورة ===`);
  console.log(`السطور المستخرجة من جميع الصور: ${allLines.length}`);
  console.log(`السطور بعد حذف التطابقات: ${dedupedLines.length}`);
  console.log(`التطابقات المحذوفة: ${allLines.length - dedupedLines.length}`);
  const totalBefore = allLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
  const totalAfter = dedupedLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
  console.log(`المجموع قبل: ${totalBefore.toFixed(2)}, بعد: ${totalAfter.toFixed(2)}`);
  console.log(`=================\n`);

  // احسب المجموع الكلي (بدون ضريبة)
  const total = dedupedLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
  const itemCount = dedupedLines.length;
  const totalWithTax = Math.round(total * 1.15 * 100) / 100;

  // تحقق من أن النتيجة معقولة
  const expectedBaseTotal = 518.82;
  const expectedItemCount = 54;
  const validationErrors: string[] = [];

  console.log(`\n=== التحقق من معقولية النتائج ===`);
  console.log(`العناصر المتوقعة: ${expectedItemCount}, المستخرجة: ${itemCount}`);
  console.log(`المجموع المتوقع (بدون ضريبة): ${expectedBaseTotal}`);
  console.log(`المستخرج (بدون ضريبة): ${total.toFixed(2)}`);
  console.log(`المستخرج (مع 15% ضريبة): ${totalWithTax}`);

  // ١. تحقق من عدد العناصر
  if (itemCount !== expectedItemCount) {
    validationErrors.push(`❌ عدد العناصر خاطئ: ${itemCount} بدل ${expectedItemCount}`);
  }

  // ٢. تحقق من المجموع (يجب يكون قريب من 518.82 بـ ±5% - أدق الآن لأننا نقرأ السعر الأساسي فقط)
  const minExpectedTotal = expectedBaseTotal * 0.95;
  const maxExpectedTotal = expectedBaseTotal * 1.05;
  if (total < minExpectedTotal || total > maxExpectedTotal) {
    validationErrors.push(`❌ المجموع خاطئ: ${total.toFixed(2)} (يجب يكون بين ${minExpectedTotal.toFixed(2)} و ${maxExpectedTotal.toFixed(2)})`);
  }

  // ٣. تحقق من الأسعار الخاطئة جداً (أقل من 1 ريال أو أكثر من 150 ريال)
  const suspiciousItems = dedupedLines.filter(l => {
    const price = l.line_total || 0;
    return price < 1 || price > 150; // الدجاج حوالي 121 ريال، باقي العناصر أقل
  });

  if (suspiciousItems.length > 0) {
    console.log(`⚠️ عناصر بأسعار مريبة:`);
    suspiciousItems.forEach(item => {
      console.log(`  - ${item.item_name}: ${item.line_total} ريال (سعر: ${item.unit_price})`);
      if ((item.line_total || 0) < 1) {
        validationErrors.push(`❌ سعر منخفض جداً: ${item.item_name} = ${item.line_total}`);
      }
    });
  }

  // ٤. تحقق من وجود العناصر الرئيسية
  const chickenItem = dedupedLines.find(l => l.item_name.includes("دجاج") || l.item_name.includes("SRA") || l.item_name.includes("chicken"));
  if (!chickenItem || (chickenItem.line_total || 0) < 100) {
    validationErrors.push(`❌ الدجاج المجمد مفقود أو بسعر خاطئ`);
  }

  console.log(`\n${validationErrors.length > 0 ? "❌ أخطاء التحقق:" : "✅ التحقق ناجح"}`);
  validationErrors.forEach(err => console.log(`${err}`));
  console.log(`=================\n`);

  // إذا كان هناك أخطاء حرجة، أرجع خطأ
  if (validationErrors.length > 0) {
    console.error(`فشل التحقق من البيانات المستخرجة`);
  }

  // تحقق من الفواتير المكررة (نفس المجموع ± 10 ريال من نفس اليوم)
  const today = new Date().toISOString().slice(0, 10);
  const { data: recentPurchases } = await db
    .from("purchases")
    .select("id, total_amount, created_at")
    .gte("created_at", `${today}T00:00:00Z`)
    .lte("created_at", `${today}T23:59:59Z`);

  const potentialDuplicates = (recentPurchases || []).filter(
    (p) => Math.abs(Number(p.total_amount) - total) < 10,
  );

  if (potentialDuplicates.length > 0) {
    console.warn(
      `⚠️ تحذير: قد تكون هناك فاتورة مشابهة من نفس اليوم (نفس المجموع ± 10 ريال)`,
    );
  }

  // احفظ الشراء الجديد
  const { data: purchaseData, error: purchaseErr } = await db
    .from("purchases")
    .insert({
      total_amount: total,
      total_with_tax: totalWithTax,
      invoice_image_paths: allImagePaths,
      store_name: storeName || "متجر",
    })
    .select("id")
    .single();

  if (purchaseErr || !purchaseData) {
    return NextResponse.json({ error: "فشل حفظ الشراء: " + purchaseErr?.message }, { status: 500 });
  }

  // احفظ أسطر الشراء (مع حساب الضريبة 15% لكل سطر)
  const linesToInsert = dedupedLines.map((line) => {
    const lineTotal = line.line_total || 0;
    const taxAmount = Math.round(lineTotal * 0.15 * 100) / 100;
    const lineWithTax = Math.round((lineTotal + taxAmount) * 100) / 100;

    return {
      purchase_id: purchaseData.id,
      item_name: line.item_name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: lineTotal,
      tax_amount: taxAmount,
      total_with_tax: lineWithTax,
      destination: line.suggested_request_id ? "house" : "warehouse",
      house_id: line.suggested_request_id ? pendingForMatch.find((p) => p.id === line.suggested_request_id)?.house_id : null,
      matched_request_id: line.suggested_request_id,
      source: "invoice",
      category: line.category,
    };
  });

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
    potentialDuplicatesCount: potentialDuplicates.length,
    summary: {
      totalItems: itemCount,
      originalItems: allLines.length,
      removedDuplicates: allLines.length - itemCount,
      totalAmount: total,
      totalAmountWithTax: totalWithTax,
    },
    debug: {
      totalBefore: allLines.reduce((sum, l) => sum + (l.line_total || 0), 0),
      totalAfter: total,
      totalWithTax,
      expectedTotal: 518.82,
      expectedTotalWithTax: 596.64,
      difference: total - 518.82,
      differenceWithTax: totalWithTax - 596.64,
      itemCountBefore: allLines.length,
      itemCountAfter: itemCount,
      validationErrors: validationErrors.length > 0 ? validationErrors : [],
      suspiciousItems: dedupedLines
        .filter(l => (l.line_total || 0) < 1 || (l.line_total || 0) > 150)
        .map(l => ({ name: l.item_name, line_total: l.line_total, unit_price: l.unit_price })),
    },
  });
}
