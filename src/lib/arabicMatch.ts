/** أدوات مطابقة أسماء المنتجات العربية بين النشرات والطلبات والمخزن */

// Units, packaging and connectives carry no identity and would match anything.
const NOISE = new Set([
  "او", "أو", "مع", "من", "على", "في", "الى", "إلى", "و",
  "حبة", "حبه", "حبات", "قطعة", "قطعه", "قطع", "طقم", "علبة", "علبه",
  "عبوة", "عبوه", "كرتون", "كيس", "باكيت", "زجاجة", "زجاجه",
  "كيلو", "كجم", "جرام", "جم", "غرام", "غ", "لتر", "مل", "سم", "مم",
  "مجانا", "مجاناً", "عرض", "خصم", "ريال", "سعر", "اصناف", "أصناف",
  "متنوعة", "متنوعه", "منوعة", "منوعه", "مشكل", "مشكلة",
]);

export function normalizeArabic(input: string): string {
  return input
    .replace(/[ً-ْٰـ]/g, "")   // التشكيل والتطويل
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-يa-zA-Z\s]/g, " ")      // أرقام ورموز ووحدات
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokens(input: string): string[] {
  return normalizeArabic(input)
    .split(" ")
    .map((t) => (t.startsWith("ال") && t.length > 4 ? t.slice(2) : t))
    .filter((t) => t.length >= 3 && !NOISE.has(t));
}

/**
 * 0 لا تطابق، 1 تطابق تام. يعتمد على نسبة كلمات الحاجة الموجودة في اسم العرض،
 * لأن اسم العرض أطول دائماً ("رز" مقابل "ارز بسمتي ابو سنبلتين").
 */
export function matchScore(need: string, offerName: string): number {
  const needTokens = tokens(need);
  if (needTokens.length === 0) return 0;

  const offerText = " " + normalizeArabic(offerName) + " ";
  let hits = 0;
  for (const t of needTokens) {
    if (offerText.includes(t)) hits++;
  }
  return hits / needTokens.length;
}
