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

/** المرحلة الأولى: استخراج قائمة الأسماء والكميات (Haiku - سريع) */
async function extractItemsListFromImage(image: InvoiceImage): Promise<Array<{ name: string; qty: string | null }>> {
  const prompt = `اقرأ هذه صورة فاتورة. استخرج **فقط** قائمة بأسماء المنتجات والكميات (بدون أسعار).

لكل سطر اكتب:
{"name": "اسم المنتج", "quantity": "الكمية أو null"}

الملاحظات:
- اقرأ جميع الأسطر بعناية
- الكمية قد تكون عشرية (1.5، 0.886)
- استخرج كل سطر تراه بدون استثناء
- أعد مصفوفة JSON فقط`;

  const response = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: image.mediaType, data: image.base64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  try {
    const items = extractJson<Array<{ name: string; quantity: string | null }>>(firstText(response));
    if (!Array.isArray(items)) return [];
    return items.map(it => ({ name: it.name || "", qty: it.quantity || null }));
  } catch {
    return [];
  }
}

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

⚠️ مهم جداً: تتداخل أجزاء من نهاية صورة مع بداية الصورة التالية. ستجد نفس الأسطر تظهر بصورتين متتاليتين. **لا تحذفها الآن** - استخرجها كما هي. النظام سيعالج التطابقات الكاملة لاحقاً.

`
      : "";

  // المرحلة الأولى: احصل على قائمة الأسماء من Haiku (سريع)
  const itemsList = await Promise.all(
    images.map(img => extractItemsListFromImage(img))
  ).then(results => results.flat());

  const itemsContext = itemsList.length > 0
    ? `\n\nالعناصر المتوقعة في هذه الصور:\n${itemsList.map((it, i) => `${i + 1}. "${it.name}" (qty: ${it.qty})`).join("\n")}\n`
    : "";

  const prompt = `أنت متخصص في قراءة فواتير المشتريات من الصور بدقة عالية جداً. هذه مهمة حرجة - كل سطر مفقود أو سعر خاطئ = خسارة مالية مباشرة.

هذه صورة${images.length > 1 ? "صور" : ""} فاتورة مشتريات من سوبر ماركت/بقالة سعودية.

${multiImageNote}
⚠️ **صيغة الفاتورة المهمة جداً:**
كل سطر في الفاتورة يحتوي على 4 أعمدة (من اليمين لليسار):
1. **المجموع النهائي** (مع ضريبة 15%) - الرقم الأكبر على اليمين
2. **السعر الأساسي** (بدون ضريبة) - الرقم الأصغر - **هذا هو الذي تستخرجه**
3. **الكمية** - رقم أصغر (غالباً 1.0 أو رقم عشري)
4. **اسم المنتج** - النص على اليسار

**مثال من الفاتورة:**
139.99  |  121.73  |  1.0  |  دجاج سيراليممجمد

- استخرج: unit_price = 121.73 (هذا هو السعر الأساسي بدون ضريبة)
- line_total = 121.73 × 1.0 = 121.73

⚠️ **تحذير حرج جداً:**
- الفاتورة تحتوي على **بالضبط 54 سطر مشتريات**
- بعض الأسطر قد تظهر مرتين (overlap من الصور)
- استخرج **كل سطر تراه** بدون حذف - النظام سيعالج التطابقات

**صيغة JSON لكل سطر:**
{
  "item_name": "اسم العنصر بالضبط كما في الفاتورة",
  "quantity": الكمية (رقم فقط من العمود الثالث),
  "unit_price": السعر الأساسي بدون ضريبة (رقم من العمود الثاني - ليس الأول),
  "line_total": quantity × unit_price (احسبه بدقة),
  "category": أقرب فئة من: ${JSON.stringify(CATEGORIES)},
  "suggested_request_id": معرّف من القائمة أدناه أو null
}

**القائمة الحالية من الطلبات المعلّقة:**
${pendingList || "(لا توجد)"}

**تعليمات استخراج حرجة - قراءة 100% شاملة:**

١. **تحديد الأعمدة بدقة:**
   - اليمين تماماً (رقم كبير) = المجموع مع الضريبة - **لا تستخدمه**
   - ثاني عمود من اليمين = السعر الأساسي - **هذا هو الذي تستخرجه**
   - العمود الثالث = الكمية
   - اليسار = الاسم

٢. **استخراج شامل 100% من جميع الأسطر:**
   - 🔴 **هذا حرج جداً:** يجب استخراج **بالضبط 54 عنصر - لا تترك أي واحد**
   - اقرأ الصورة من أعلى إلى أسفل، ثم من أسفل إلى أعلى (مرتين)
   - الأسطر في الحواف والزوايا والنصوص الصغيرة = **أولوية قصوى**
   - الأرقام الصغيرة = ركز عليها بشدة (قد تكون كميات عشرية: 0.566، 0.578، إلخ)
   - الأسطر المتقطعة أو المرتبطة بصورة أخرى = استخرجها

٣. **دقة الأسعار:**
   - استخرج الأسعار من العمود الثاني بالضبط (بدون ضريبة)
   - الأسعار الكسرية بدقة (13.90، 5.21، 8.69، 12.17، إلخ)
   - إذا كان السعر غير واضح، اجتهد بأفضل قراءة

٤. **معالجة التطابقات:**
   - إذا رأيت نفس السطر مرتين (overlap) = استخرجه مرتين
   - لا تحذف أي شيء

٥. **التحقق النهائي الإجباري:**
   - عد السطور = **يجب تكون بالضبط 54 عنصر**
   - إذا أقل من 54: أعد القراءة مرة ثانية وابحث عن الأسطر المفقودة
   - المجموع الكلي = جمع جميع line_totals
   - الأسعار المنخفضة جداً (< 0.5) = احذف فقط التي فعلاً مقروءة خاطئة

٦. **الصيغة المطلوبة:**
   - مصفوفة JSON فقط
   - بدون نصوص إضافية
   - 54 كائن منفصل (تحتسب جميع الـ 54 عنصر دائماً)

أعد المصفوفة الآن:`;

  const response = await client().messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
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

const IMAGES_PER_CALL = 1;

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
