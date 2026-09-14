"use client";

import { useEffect, useState } from "react";

type Offer = {
  id: string;
  mall: string;
  item_name: string;
  description: string | null;
  original_price: number | null;
  offer_price: number;
  discount_pct: number | null;
};

type Data = {
  requested: { need: string; quantity: string | null; house: string | null; offers: Offer[] }[];
  depleted: { need: string; quantity: number; unit: string | null; offers: Offer[] }[];
  cheaper: { need: string; lastPaid: number; offer: Offer; savedPct: number }[];
  counts: { offersConsidered: number; pendingRequests: number; depletedItems: number };
};

function OfferLine({ o }: { o: Offer }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1 pr-3 text-xs">
      <div className="flex-1 min-w-0">
        <p className="truncate">{o.item_name}</p>
        <p className="text-gray-400">{o.mall}</p>
      </div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        {o.original_price && (
          <span className="text-gray-400 line-through">{o.original_price}</span>
        )}
        <span className="font-bold text-green-600">{o.offer_price} ر.س</span>
        {o.discount_pct != null && (
          <span className="bg-red-100 text-red-700 px-1 rounded">{o.discount_pct}٪</span>
        )}
      </div>
    </div>
  );
}

export default function ShoppingSuggestions() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/offers/suggestions")
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="card">
        <p className="text-gray-400 text-sm">جارٍ مطابقة العروض باحتياجك...</p>
      </section>
    );
  }
  if (!data) return null;

  const nothing =
    data.requested.length === 0 && data.depleted.length === 0 && data.cheaper.length === 0;

  return (
    <section className="card">
      <h2 className="font-bold mb-1">🛒 ماذا أشتري اليوم</h2>
      <p className="text-xs text-gray-500 mb-4">
        عروض تطابق ما طُلب فعلاً، وما نفد من المخزن، وما هو أرخص مما دفعته سابقاً
      </p>

      {nothing && (
        <p className="text-center text-gray-400 py-6 text-sm">
          لا يوجد تطابق حالياً بين العروض واحتياجك
        </p>
      )}

      {data.requested.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold mb-2 text-blue-700">
            📋 مطلوب من البيوت ({data.requested.length})
          </h3>
          <div className="space-y-2">
            {data.requested.map((r, i) => (
              <div key={i} className="border border-blue-100 bg-blue-50/40 rounded-lg p-2">
                <p className="text-xs font-semibold">
                  {r.need}
                  {r.quantity && <span className="text-gray-500"> — {r.quantity}</span>}
                  {r.house && <span className="text-gray-400"> · {r.house}</span>}
                </p>
                <div className="divide-y divide-blue-100 mt-1">
                  {r.offers.map((o) => (
                    <OfferLine key={o.id} o={o} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.depleted.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold mb-2 text-red-700">
            📦 نفد من المخزن ({data.depleted.length})
          </h3>
          <div className="space-y-2">
            {data.depleted.map((d, i) => (
              <div key={i} className="border border-red-100 bg-red-50/40 rounded-lg p-2">
                <p className="text-xs font-semibold">
                  {d.need}
                  <span className="text-gray-500">
                    {" "}
                    — الكمية {d.quantity} {d.unit ?? ""}
                  </span>
                </p>
                <div className="divide-y divide-red-100 mt-1">
                  {d.offers.map((o) => (
                    <OfferLine key={o.id} o={o} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.cheaper.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-emerald-700">
            💰 أرخص مما دفعت سابقاً ({data.cheaper.length})
          </h3>
          <div className="space-y-2">
            {data.cheaper.map((c, i) => (
              <div key={i} className="border border-emerald-100 bg-emerald-50/40 rounded-lg p-2">
                <p className="text-xs font-semibold">
                  {c.need}
                  <span className="text-gray-500"> — دفعت {c.lastPaid} ر.س</span>
                  <span className="text-emerald-700 font-bold"> ← وفّر {c.savedPct}٪</span>
                </p>
                <div className="mt-1">
                  <OfferLine o={c.offer} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-4">
        طُوبقت {data.counts.offersConsidered} عرضاً مع {data.counts.pendingRequests} طلباً معلّقاً
        و{data.counts.depletedItems} عنصراً نفد
      </p>
    </section>
  );
}
