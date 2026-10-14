import type { ParsedRequestItem } from "./types";

const UNITS =
  "كيلو|كجم|كغ|جرام|غرام|جم|لتر|مل|حبة|حبات|حبه|علبة|علب|عبوة|كرتون|كيس|أكياس|ربطة|ربطه|دزينة|صحن|باكيت|شوال|قارورة";

/**
 * Splits a request message into items without calling the model.
 *
 * It is the fallback for when the API key is rejected or the service is down:
 * a household's list is written one item per line, and losing it because the
 * parser is unavailable is worse than splitting it plainly. The admin can edit
 * any line afterwards.
 */
export function splitRequestText(rawText: string): ParsedRequestItem[] {
  const parts = rawText
    .split(/[\n\r،,؛;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const items: ParsedRequestItem[] = [];

  for (const part of parts) {
    // A leading "2 كيلو" or trailing "٣ حبات" is the quantity, not the name.
    const leading = part.match(
      new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?\\s*(?:${UNITS})?)\\s+(.{2,})$`)
    );
    // A unit is optional at the end: "طماطم ٢" means two of them.
    const trailing = part.match(
      new RegExp(`^(.{2,}?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?(?:\\s*(?:${UNITS}))?)$`)
    );

    let name = part;
    let qty: string | null = null;
    if (leading) {
      qty = leading[1].trim();
      name = leading[2].trim();
    } else if (trailing) {
      name = trailing[1].trim();
      qty = trailing[2].trim();
    }

    name = name.replace(/^(و|ثم|كمان|أيضا|أيضاً)\s+/, "").trim();
    if (!name) continue;

    const key = `${name}|${qty ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ item_name: name, quantity_text: qty });
  }

  return items;
}
