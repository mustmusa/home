export type InvoiceLine = {
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  category: string | null;
  suggested_request_id: string | null;
};

function key(l: InvoiceLine) {
  return [
    String(l.item_name ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    l.quantity ?? "",
    l.unit_price ?? "",
    l.line_total ?? "",
  ].join("|");
}

/**
 * Joins the batches of one invoice, each batch being the lines read from one
 * photo of it.
 *
 * The only duplicates a long receipt produces are the rows caught by two
 * photos at once: the bottom of one picture is the top of the next. So the
 * overlap is matched where it physically happens — the tail of what we have
 * against the head of what comes next — and nothing else is touched.
 *
 * An item printed twice on the same receipt is two units actually bought. It
 * sits inside one batch, never across the seam, and is kept.
 */
export function mergeInvoiceBatches(batches: InvoiceLine[][]): {
  lines: InvoiceLine[];
  overlapRemoved: number;
} {
  let lines: InvoiceLine[] = [];
  let overlapRemoved = 0;

  for (const batch of batches) {
    if (lines.length === 0) {
      lines = [...batch];
      continue;
    }

    const max = Math.min(lines.length, batch.length);
    let overlap = 0;
    for (let k = max; k >= 1; k--) {
      const tail = lines.slice(lines.length - k).map(key).join("\n");
      const head = batch.slice(0, k).map(key).join("\n");
      if (tail === head) {
        overlap = k;
        break;
      }
    }

    overlapRemoved += overlap;
    lines = lines.concat(batch.slice(overlap));
  }

  return { lines, overlapRemoved };
}
