import { NextRequest, NextResponse } from "next/server";
import { Anthropic } from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("متغير البيئة ANTHROPIC_API_KEY غير مضبوط على الخادم");
  cached = new Anthropic({ apiKey });
  return cached;
}

type ExtractedOffer = {
  item_name: string;
  original_price?: number;
  offer_price: number;
  discount_percent?: number;
  description?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mall = formData.get("mall") as string;

    if (!file || !mall) {
      return NextResponse.json({ error: "الملف أو المول غير محدد" }, { status: 400 });
    }

    const malls = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];
    if (!malls.includes(mall)) {
      return NextResponse.json({ error: "المول غير صحيح" }, { status: 400 });
    }

    // تحويل الملف إلى base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // تحديد نوع الملف - فقط الصور معتمدة للرؤية
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    if (file.type.includes("pdf")) {
      return NextResponse.json({ error: "صيغة PDF غير مدعومة حالياً. الرجاء استخدام صور (JPG, PNG, GIF, WebP)" }, { status: 400 });
    } else if (file.type.includes("png")) {
      mediaType = "image/png";
    } else if (file.type.includes("gif")) {
      mediaType = "image/gif";
    } else if (file.type.includes("webp")) {
      mediaType = "image/webp";
    } else {
      mediaType = "image/jpeg";
    }

    // استخدام Claude لاستخراج العروض من الصورة
    const response = await getClient().messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image" as const,
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `أنت متخصص في استخراج بيانات العروض من الصور الإعلانات.

استخرج جميع العروض من هذه الصورة/الملف الخاص بمتجر "${mall}".

لكل عرض، استخرج:
- اسم العنصر/المنتج
- السعر الأصلي (إن وجد)
- سعر العرض
- نسبة الخصم (إن وجدت)
- وصف قصير (اختياري)

أرجع النتيجة كـ JSON array بالصيغة التالية:
[
  {
    "item_name": "اسم المنتج",
    "original_price": 100,
    "offer_price": 75,
    "discount_percent": 25,
    "description": "وصف قصير"
  }
]

تأكد من:
1. استخراج جميع العروض الموجودة
2. الأسعار يجب أن تكون أرقام (بدون عملة)
3. إذا لم يكن هناك سعر أصلي، اتركه فارغاً
4. يجب أن تكون النتيجة JSON صحيحة

أرجع JSON فقط بدون تفسيرات إضافية.`,
            },
          ],
        },
      ],
    });

    // استخراج النص من الرد
    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "فشل استخراج البيانات" }, { status: 500 });
    }

    // محاولة تحليل JSON
    let offers: ExtractedOffer[] = [];
    try {
      offers = JSON.parse(content.text);
    } catch (e) {
      // إذا فشل التحليل، محاولة استخراج JSON من النص
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        offers = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json(
          { error: "لم يتمكن من استخراج البيانات بصيغة صحيحة" },
          { status: 400 }
        );
      }
    }

    // حفظ العروض في قاعدة البيانات
    const db = supabaseServer();
    const offersToInsert = offers.map((offer) => ({
      mall,
      item_name: offer.item_name,
      original_price: offer.original_price || null,
      offer_price: offer.offer_price,
      discount_percent: offer.discount_percent || null,
      description: offer.description || null,
      source: "pdf",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data: inserted, error: insertError } = await db
      .from("offers")
      .insert(offersToInsert)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mall,
      extracted: offers.length,
      inserted: inserted?.length || 0,
      offers: inserted,
    });
  } catch (e) {
    console.error("خطأ في الاستخراج:", e);
    return NextResponse.json(
      { error: "خطأ في معالجة الملف: " + String(e) },
      { status: 500 }
    );
  }
}
