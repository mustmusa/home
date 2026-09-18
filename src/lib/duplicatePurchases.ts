export type PurchaseRow = {
  id: string;
  store: string;
  total: number;
  items: number;
  created_at: string;
  has_image: boolean;
};

export type DuplicateCandidate = {
  id: string;
  store_name: string;
  total: number;
  items: number;
  created_at: string;
  has_image: boolean;
  reason: string;
  keeps: { id: string; total: number; items: number; created_at: string } | null;
};

/**
 * Two things end up in the ledger as duplicates:
 *
 *  1. Purchases with no lines at all — an invoice that carries nothing is not
 *     a record of anything, whatever its total says.
 *  2. Same store, same day, same total. finalize-invoice used to write a
 *     purchase of its own before the admin confirmed the review screen, and
 *     saving then wrote the real one, so the scanned copy sits right next to
 *     it. The surviving row is the newest, which is the confirmed one.
 *
 * Invoices that merely share a store and a day are left alone: two trips to
 * the same shop in one day is ordinary.
 */
export function classifyDuplicates(rows: PurchaseRow[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const flagged = new Set<string>();

  for (const r of rows) {
    if (r.items === 0) {
      flagged.add(r.id);
      candidates.push({
        id: r.id,
        store_name: r.store,
        total: r.total,
        items: 0,
        created_at: r.created_at,
        has_image: r.has_image,
        reason: "فاتورة بلا عناصر",
        keeps: null,
      });
    }
  }

  const groups = new Map<string, PurchaseRow[]>();
  for (const r of rows) {
    if (flagged.has(r.id)) continue;
    const key = `${r.created_at.slice(0, 10)}|${r.store}|${r.total.toFixed(2)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const [keep, ...rest] = sorted;
    for (const r of rest) {
      flagged.add(r.id);
      candidates.push({
        id: r.id,
        store_name: r.store,
        total: r.total,
        items: r.items,
        created_at: r.created_at,
        has_image: r.has_image,
        reason: "نسخة مكررة (نفس المتجر واليوم والمبلغ)",
        keeps: {
          id: keep.id,
          total: keep.total,
          items: keep.items,
          created_at: keep.created_at,
        },
      });
    }
  }

  candidates.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return candidates;
}
