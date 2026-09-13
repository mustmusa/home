import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Anthropic } from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

const client = new Anthropic();

type ExtractedOffer = {
  item_name: string;
  original_price?: number;
  offer_price: number;
  discount_percent?: number;
  description?: string;
};

const SCRAPING_SITES = {
  d4donline: {
    url: "https://d4donline.com/en/saudi-arabia/riyadh/offers",
    selector: "[data-testid='merchant-offer-card']", // Need to inspect the actual site
  },
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { source = "d4donline", mall } = await req.json();

    if (!mall) {
      return NextResponse.json({ error: "المول غير محدد" }, { status: 400 });
    }

    const siteConfig = SCRAPING_SITES[source as keyof typeof SCRAPING_SITES];
    if (!siteConfig) {
      return NextResponse.json({ error: "المصدر غير معروف" }, { status: 400 });
    }

    // Fetch the webpage
    const response = await axios.get(siteConfig.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // Extract HTML content for Claude to analyze
    const htmlContent = $.html();

    // Use Claude to extract structured offer data from the HTML
    const claudeResponse = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `أنت متخصص في استخراج بيانات العروض من صفحات الويب.

استخرج جميع العروض من هذا المحتوى HTML:

\`\`\`html
${htmlContent.slice(0, 5000)}
\`\`\`

استخرج جميع العروض والمنتجات المعروضة على الصفحة.

لكل عرض، استخرج:
- اسم المنتج/العنصر
- السعر الأصلي (إن وجد)
- سعر العرض الحالي
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
    });

    // Parse Claude's response
    const content = claudeResponse.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "فشل في استخراج البيانات" }, { status: 500 });
    }

    let offers: ExtractedOffer[] = [];
    try {
      offers = JSON.parse(content.text);
    } catch (e) {
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

    // Save offers to database
    const db = supabaseServer();
    const offersToInsert = offers.map((offer) => ({
      mall,
      item_name: offer.item_name,
      original_price: offer.original_price || null,
      offer_price: offer.offer_price,
      discount_percent: offer.discount_percent || null,
      description: offer.description || null,
      source: "scrape",
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
      source,
      mall,
      extracted: offers.length,
      inserted: inserted?.length || 0,
      offers: inserted,
    });
  } catch (e: any) {
    console.error("خطأ في الكشط:", e);
    return NextResponse.json(
      { error: "خطأ في معالجة الطلب: " + (e.message || String(e)) },
      { status: 500 }
    );
  }
}
