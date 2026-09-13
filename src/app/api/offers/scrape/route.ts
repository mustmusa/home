import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
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
    url: "https://d4donline.com/ar/saudi-arabia/riyadh/offers",
    name: "D4D Online",
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

    // Fetch the webpage with Puppeteer (for JavaScript-heavy sites)
    let htmlContent = "";
    try {
      console.log("محاولة جلب الصفحة باستخدام Puppeteer...");

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Set realistic viewport and user agent
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      );

      // Navigate to the page with a timeout
      await page.goto(siteConfig.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Get the full HTML after JavaScript rendering
      htmlContent = await page.content();

      await browser.close();
      console.log("تم جلب الصفحة بنجاح بـ Puppeteer");
    } catch (puppeteerError: any) {
      console.warn("فشل Puppeteer، محاولة axios البسيطة:", puppeteerError.message);

      // Fallback to axios if Puppeteer fails
      try {
        const response = await axios.get(siteConfig.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://d4donline.com",
          },
          timeout: 15000,
          maxRedirects: 5,
        });
        htmlContent = response.data;
      } catch (axiosError: any) {
        console.error("فشل كلا الطريقتين:", axiosError.message);
        return NextResponse.json(
          { error: `فشل جلب البيانات من الموقع: ${axiosError.message}` },
          { status: 500 }
        );
      }
    }

    // Use Claude to extract structured offer data from the HTML
    const claudeResponse = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `أنت متخصص في استخراج بيانات العروض الحقيقية فقط من صفحات المتاجر.

من HTML الصفحة التالية (من ${siteConfig.name || "متجر"})، استخرج العروض والصفقات الفعلية:

المحتوى:
\`\`\`html
${htmlContent.slice(0, 12000)}
\`\`\`

القواعد الحاسمة:
1. استخرج فقط المنتجات التي لديها سعر عرض واضح ومعروف
2. يجب أن يكون لكل عنصر "offer_price" قيمة رقمية صحيحة (مطلوب)
3. لا تستخرج عناصر بدون أسعار أو بأسعار غير واضحة
4. استخرج السعر الأصلي فقط إذا كان مختلف عن سعر العرض
5. الأسعار يجب أن تكون أرقام إيجابية فقط

صيغة الإخراج (JSON array فقط، بلا شرح):
[
  {
    "item_name": "اسم المنتج",
    "original_price": 100,
    "offer_price": 75,
    "discount_percent": 25,
    "description": "وصف"
  }
]

متطلبات JSON:
- offer_price: مطلوب وقيمة رقمية > 0
- item_name: مطلوب ودقيق
- original_price: اختياري (فقط إذا كان أعلى من offer_price)
- discount_percent: اختياري
- description: اختياري

انتبه: تجاهل أي عناصر ناقصة أو غير واضحة أو بدون أسعار حقيقية.`,
        },
      ],
    });

    // Parse Claude's response
    const content = claudeResponse.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "فشل في استخراج البيانات من الصفحة" }, { status: 500 });
    }

    let offers: ExtractedOffer[] = [];
    try {
      const trimmed = content.text.trim();
      offers = JSON.parse(trimmed);

      // Validate that it's an array
      if (!Array.isArray(offers)) {
        offers = [];
      }
    } catch (e) {
      // Try to extract JSON from the response
      const jsonMatch = content.text.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          offers = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(offers)) {
            offers = [];
          }
        } catch (parseError) {
          console.error("خطأ في تحليل JSON المستخرج:", parseError);
          offers = [];
        }
      }
    }

    // Validate offers - filter out invalid ones
    const validOffers = offers.filter(
      (offer) =>
        offer.item_name &&
        typeof offer.item_name === "string" &&
        offer.item_name.trim().length > 0 &&
        offer.offer_price &&
        typeof offer.offer_price === "number" &&
        offer.offer_price > 0
    );

    if (validOffers.length === 0) {
      return NextResponse.json(
        { error: "لم يتمكن من استخراج عروض صحيحة من الصفحة. تأكد من وجود أسعار واضحة" },
        { status: 400 }
      );
    }

    console.log(`تم العثور على ${validOffers.length} عرض صحيح من أصل ${offers.length} عرض`);

    // Save offers to database
    const db = supabaseServer();
    const offersToInsert = validOffers.map((offer) => ({
      mall,
      item_name: String(offer.item_name).trim(),
      original_price:
        offer.original_price && typeof offer.original_price === "number" && offer.original_price > 0
          ? offer.original_price
          : null,
      offer_price: Number(offer.offer_price) || 0,
      discount_percent:
        offer.discount_percent && typeof offer.discount_percent === "number" && offer.discount_percent > 0
          ? offer.discount_percent
          : null,
      description: offer.description ? String(offer.description).trim() : null,
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
