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

type MallBlock = {
  mall: string;
  items: { need: string; quantity: string | null; offer: Offer }[];
  covered: number;
  total: number;
};

type Data = {
  totalRequests: number;
  matchedRequests: number;
  unmatched: string[];
  malls: MallBlock[];
};

export default function MallBasket() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/offers/basket")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          if (d.malls?.length) setOpen(d.malls[0].mall);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="card">
        <p className="text-gray-400 text-sm">جارٍ مقارنة الطلبية بالمولات...</p>
      </section>
    );
  }
  if (!data || data.malls.length === 0) return null;

  return (
    <section className="card">
      <h2 className="font-bold mb-1">🛍️ أين أشتري الطلبية</h2>
      <p className="text-xs text-gray-500 mb-3">
        غُطّي {data.matchedRequests} من {data.totalRequests} طلباً بعروض حالية — أرخص سعر لكل
        صنف داخل كل مول
      </p>

      <div className="space-y-2">
        {data.malls.map((m) => (
          <div key={m.mall} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen(open === m.mall ? null : m.mall)}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-50 text-right"
            >
              <div>
                <p className="font-semibold text-sm">{m.mall}</p>
                <p className="text-xs text-gray-500">
                  يغطي {m.covered} من {data.totalRequests} صنفاً
                </p>
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-green-600">{m.total} ر.س</p>
                <p className="text-xs text-gray-400">{open === m.mall ? "▼" : "◀"}</p>
              </div>
            </button>

            {open === m.mall && (
              <table className="w-full text-xs border-t border-gray-200">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-right p-2 font-medium">المطلوب</th>
                    <th className="text-right p-2 font-medium">المتوفر في المول</th>
                    <th className="text-left p-2 font-medium">أرخص سعر</th>
                  </tr>
                </thead>
                <tbody>
                  {m.items.map((it, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="p-2 font-medium align-top">
                        {it.need}
                        {it.quantity && (
                          <span className="text-gray-400"> ({it.quantity})</span>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <p>{it.offer.item_name}</p>
                        {it.offer.description && (
                          <p className="text-gray-400">{it.offer.description}</p>
                        )}
                      </td>
                      <td className="p-2 text-left align-top whitespace-nowrap">
                        {it.offer.original_price && (
                          <span className="text-gray-400 line-through ml-1">
                            {it.offer.original_price}
                          </span>
                        )}
                        <span className="font-bold text-green-600">
                          {it.offer.offer_price}
                        </span>
                        {it.offer.discount_pct != null && (
                          <span className="bg-red-100 text-red-700 px-1 rounded mr-1">
                            {it.offer.discount_pct}٪
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {data.unmatched.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          بلا عرض حالياً: {data.unmatched.join("، ")}
        </p>
      )}
    </section>
  );
}
