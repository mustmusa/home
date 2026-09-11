import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedInvoiceLine, ParsedRequestItem } from "./types";

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

function firstText(content: Anthropic.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  throw new Error("لم يرجع الذكاء الاصطناعي أي نص");
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

  const items = extractJson<ParsedRequestItem[]>(firstText(response.content));
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

/**
 * يقرأ صورة فاتورة ويستخرج عناصرها كأسطر منفصلة، مع اقتراح مطابقة كل سطر
 * بأحد الطلبات المعلّقة إن أمكن (السطر غير المطابق يُفترض أنه للمخزون).
 */
export async function extractInvoiceLines(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  pendingRequests: PendingRequestForMatch[],
): Promise<ExtractedInvoiceLine[]> {
  const pendingList = pendingRequests
    .map((r) => `- id="${r.id}" (${r.house_name}): ${r.item_name}${r.quantity_text ? " — " + r.quantity_text : ""}`)
    .join("\n");

  const prompt = `هذه صورة فاتورة مشتريات (سوبر ماركت أو بقالة). اقرأ كل سطر مشتريات فيها واستخرجه.

لكل سطر أعد كائن JSON بالشكل:
{
  "item_name": "اسم العنصر كما في الفاتورة (أو اسم مبسّط مفهوم)",
  "quantity": رقم الكمية أو null إن لم تُقرأ,
  "unit_price": سعر الوحدة أو null,
  "line_total": إجمالي السطر (رقم فقط بدون رمز عملة)، احسبه من quantity*unit_price إذا لم يظهر صراحة،
  "suggested_request_id": معرّف الطلب المطابق من القائمة أدناه إن وجد تطابق واضح بالاسم، وإلا null
}

القائمة الحالية من الطلبات المعلّقة (طابق بالاسم قدر الإمكان، بغض النظر عن أي بيت):
${pendingList || "(لا توجد طلبات معلّقة حاليًا)"}

قواعد:
- إذا طابق السطر أحد الطلبات المعلّقة أعلاه بوضوح، اجعل suggested_request_id = معرّف ذلك الطلب.
- إذا لم يطابق أي طلب، اجعل suggested_request_id = null (سيُفترض أنه اشتُري بعرض للتخزين في المخزن).
- لا تخترع أسطر غير موجودة في الصورة، ولا تتجاهل أي سطر ظاهر.

أعد فقط مصفوفة JSON من هذه الكائنات، بدون أي نص أو شرح إضافي.`;

  const response = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const lines = extractJson<ExtractedInvoiceLine[]>(firstText(response.content));
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
      suggested_request_id: l.suggested_request_id ?? null,
    }));
}
