import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, type ExtractedInvoiceLine, type ParsedRequestItem } from "./types";

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("متغير البيئة ANTHROPIC_API_KEY غير مضبوط");
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** يقرأ نص رد Claude ويحاول استخراج JSON منه بتسامح (مع أو بدون code fence) */
function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // جرّب استخراج أول [ أو { حتى آخر ] أو }
    const start = trimmed.search(/[[{]/);
    const endBracket = trimmed.lastIndexOf("]");
    const endBrace = trimmed.lastIndexOf("}");
    const end = Math.max(endBracket, endBrace);
    if (start !== -1 && end !== -1 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return JSON.parse(slice) as T;
    }
    throw new Error("تعذّر تفسير رد الذكاء الاصطناعي كـ JSON: " + raw.slice(0, 200));
  }
}

function firstText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  throw new Error(
    `لم يرجع الذكاء الاصطناعي أي نص (سبب التوقف: ${response.stop_reason ?? "غير معروف"}) — جرّب صور أقل بنفس الطلب`,
  );
}

/**
 * يفسّر رسالة نصية حرة من إحدى الزوجات (مثال: "محتاجين رز وزيت و٢ كيلو دجاج")
 * ويرجع قائمة عناصر منفصلة.
 */
export async function parseRequestText(rawText: string): Promise<ParsedRequestItem[]> {
  const prompt = `فيما يلي رسالة نصية بالعربية من أحد أفراد البيت يطلب فيها احتياجات المنزل. افصل كل عنصر مطلوب لوحده في قائمة JSON.

قواعد:
- كل عنصر: {"item_name": "اسم العنصر بصيغة واضحة ومختصرة", "quantity_text": "الكمية كما وردت أو null إذا لم تُذكر"}
- لا تدمج عنصرين مختلفين في سطر واحد، ولا تكرر نفس العنصر.
- تجاهل أي كلام لا علاقة له بطلب أغراض (تحيات، أسئلة، إلخ).
- أعد فقط مصفوفة JSON بدون أي نص أو شرح إضافي.

الرسالة:
"""
${rawText}
"""`;

  const response = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const items = extractJson<ParsedRequestItem[]>(firstText(response));
  if (!Array.isArray(items)) throw new Error("رد غير متوقع من الذكاء الاصطناعي");
  return items
    .filter((it) => it && typeof it.item_name === "string" && it.item_name.trim())
    .map((it) => ({
      item_name: it.item_name.trim(),
      quantity_text: it.quantity_text ? String(it.quantity_text).trim() : null,
    }));
}

type PendingRequestForMatch = {
  id: string;
  item_name: string;
  quantity_text: string | null;
  house_name: string;
};

type InvoiceImage = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

async function extractInvoiceLinesSingleCall(
  images: InvoiceImage[],
  pendingRequests: PendingRequestForMatch[],
): Promise<ExtractedInvoiceLine[]> {
  const pendingList = pendingRequests
    .map((r) => `- id="${r.id}" (${r.house_name}): ${r.item_name}${r.quantity_text ? " — " + r.quantity_text : ""}`)
    .join("\n");

  const multiImageNote =
    images.length > 1
      ? `هذه ${images.length} صور لنفس الفاتورة الواحدة (فاتورة طويلة صُوّرت على أجزاء متتالية، بنفس ترتيب الصور المعطاة). اقرأها كوحدة واحدة متصلة وليس كفواتير منفصلة.

⚠️ مهم جدًا: أحيانًا يتداخل جزء من نهاية صورة مع بداية الصورة التالية (نفس الأسطر تظهر بصورتين). قارن الأسطر بين الصور بعناية واستخرج كل سطر مرة واحدة فقط — لا تكرره حتى لو ظهر في أكثر من صورة.

`
      : "";

  const prompt = `أنت متخصص في قراءة فواتير المشتريات من الصور. قرائتك يجب أن تكون دقيقة وشاملة لجميع العناصر.

هذه صورة${images.length > 1 ? "صور" : ""} فاتورة مشتريات (سوبر ماركت أو بقالة). اقرأ كل سطر مشتريات فيها بعناية عالية جداً واستخرجه. عدم استخراج أي سطر = خسارة مالية.

${multiImageNote}لكل سطر أعد كائن JSON بالشكل:
{
  "item_name": "اسم العنصر كما في الفاتورة (أو اسم مبسّط مفهوم)",
  "quantity": رقم الكمية أو null إن لم تُقرأ,
  "unit_price": سعر الوحدة أو null,
  "line_total": إجمالي السطر (رقم فقط بدون رمز عملة)، احسبه من quantity*unit_price إذا لم يظهر صراحة،
  "category": صنّف العنصر لأقرب فئة من هذه القائمة بالضبط: ${JSON.stringify(CATEGORIES)},
  "suggested_request_id": معرّف الطلب المطابق من القائمة أدناه إن وجد تطابق واضح بالاسم، وإلا null
}

القائمة الحالية من الطلبات المعلّقة (طابق بالاسم قدر الإمكان، بغض النظر عن أي بيت):
${pendingList || "(لا توجد طلبات معلّقة حاليًا)"}

تعليمات حرجة:
- اقرأ كل سطر في الفاتورة، بما فيها:
  * الأسطر بنصوص صغيرة جداً أو قد تبدو مشوهة
  * الأسطر ذات الأسعار الكسرية (مثل 0.50 أو 1.25)
  * الأسطر في حواف الصور أو الزوايا
  * العناصر المكررة (إذا ظهرت نفس السلعة مرتين، استخرجها مرتين)
  * الخصومات أو الإضافات إذا كانت سطور منفصلة

- احرص على دقة الأسعار: استخرج الأرقام بعناية تامة
- استخرج الكمية بأي صيغة تظهر (كيلو، قطع، صندوق، وغيرها)
- لا تدمج سطرين مختلفين في سطر واحد، حتى لو كانا متشابهين
- إذا كان هناك عنصر بجودة عالية الغموض، حاول قراءته بأفضل ما تستطيع بدلاً من تجاهله

التحقق النهائي:
- أعد عدد السطور المستخرجة وقارنه بما تراه في الصور
- إذا بدا أنك فاتتك سطور، أعد القراءة بعناية أكثر
- تجاهل أي جزء ليس سطر شراء (تواقيع، تاريخ، رأس الفاتورة)

أعد فقط مصفوفة JSON من هذه الكائنات، بدون أي نص أو شرح إضافي.`;

  const response = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    // مهمة استخراج منظّمة (OCR + تنسيق) لا تحتاج تفكير موسّع، وتعطيله
    // يضمن كل ميزانية الرد تذهب للنص الفعلي بدل التفكير — خصوصًا مع
    // عدة صور دفعة وحدة حيث قد يستهلك التفكير التلقائي الميزانية كاملة
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: [
          ...images.map(
            (img): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.base64 },
            }),
          ),
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const lines = extractJson<ExtractedInvoiceLine[]>(firstText(response));
  if (!Array.isArray(lines)) throw new Error("رد غير متوقع من الذكاء الاصطناعي");

  return lines
    .filter((l) => l && typeof l.item_name === "string" && l.item_name.trim())
    .map((l) => ({
      item_name: l.item_name.trim(),
      quantity: typeof l.quantity === "number" ? l.quantity : null,
      unit_price: typeof l.unit_price === "number" ? l.unit_price : null,
      line_total:
        typeof l.line_total === "number"
          ? l.line_total
          : (typeof l.quantity === "number" && typeof l.unit_price === "number"
              ? l.quantity * l.unit_price
              : 0),
      category: (CATEGORIES as readonly string[]).includes(l.category ?? "") ? (l.category as string) : "أخرى",
      suggested_request_id: l.suggested_request_id ?? null,
    }));
}

/** يحذف الأسطر المكرّرة (نفس العنصر ظهر بأكثر من دفعة صور) عبر تمرير نصّي سريع، مع تراجع آمن لو فشل */
async function dedupeLines(lines: ExtractedInvoiceLine[]): Promise<ExtractedInvoiceLine[]> {
  if (lines.length <= 1) return lines;

  const prompt = `فيما يلي مصفوفة JSON من أسطر فاتورة استُخرجت من عدة صور لنفس الفاتورة الطويلة (صُوّرت على أجزاء منفصلة). بسبب ذلك، قد يتكرر نفس السطر (نفس اسم العنصر بنفس السعر) أكثر من مرة إذا ظهر في أكثر من صورة.

احذف التكرارات فقط (اترك نسخة واحدة من كل سطر مكرر)، وأعد باقي الأسطر كما هي تمامًا بدون أي تعديل على قيمها أو ترتيبها.

المصفوفة:
${JSON.stringify(lines)}

أعد فقط مصفوفة JSON نهائية بعد حذف التكرار، بنفس شكل الكائنات بالضبط، بدون أي نص أو شرح إضافي.`;

  try {
    const response = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });
    const deduped = extractJson<ExtractedInvoiceLine[]>(firstText(response));
    if (Array.isArray(deduped) && deduped.length > 0) return deduped;
  } catch {
    // لو فشل تفسير رد التنظيف لأي سبب، نرجع القائمة الأصلية بدل ما نفشل العملية كاملة —
    // الأدمن يقدر يحذف أي سطر مكرر يدويًا بخطوة المراجعة أصلاً
  }
  return lines;
}

const IMAGES_PER_CALL = 2;

/**
 * يقرأ صورة (أو عدة صور لنفس الفاتورة الطويلة) ويستخرج عناصرها كأسطر منفصلة،
 * مع تصنيف كل عنصر واقتراح مطابقته بأحد الطلبات المعلّقة إن أمكن
 * (السطر غير المطابق يُفترض أنه للمخزون).
 *
 * لتفادي انتهاء المهلة المسموحة بالخادم (60 ثانية)، نقسّم الصور لدفعات صغيرة (صورتين لكل دفعة)
 * ونقرأها بالتسلسل، ثم نمرّ تمريرة أخيرة سريعة لحذف أي تكرار بين الدفعات.
 */
export async function extractInvoiceLines(
  images: InvoiceImage[],
  pendingRequests: PendingRequestForMatch[],
): Promise<ExtractedInvoiceLine[]> {
  if (images.length <= IMAGES_PER_CALL) {
    return extractInvoiceLinesSingleCall(images, pendingRequests);
  }

  const batches: InvoiceImage[][] = [];
  for (let i = 0; i < images.length; i += IMAGES_PER_CALL) {
    batches.push(images.slice(i, i + IMAGES_PER_CALL));
  }

  // معالجة الدفعات بالتتابع (متسلسلة) بدل التوازي
  // التتابع: أبطأ لكن آمن من انقطاع الخادم
  const results: ExtractedInvoiceLine[][] = [];
  for (let i = 0; i < batches.length; i++) {
    try {
      const batchResult = await extractInvoiceLinesSingleCall(batches[i], pendingRequests);
      results.push(batchResult);
    } catch (error) {
      throw new Error(`فشلت قراءة الدفعة ${i + 1} من ${batches.length}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // حتى مع المعالجة المتسلسلة، كل دفعة معالجة مستقلة لا تعرف عن الدفعات الأخرى.
  // لذا قد يحدث تكرار بين الدفعات (مثلاً نفس السلعة في الصورة 2 والصورة 4).
  // لا نشغّل dedupeLines هنا لأنها قد تحذف عناصر صحيحة بالخطأ.
  // الـ deduplication الدقيق يحصل في finalize-invoice/route.ts
  const allLines = results.flat();
  return allLines;
}
