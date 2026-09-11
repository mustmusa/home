"use client";

import { useCallback, useEffect, useState } from "react";

type ReportItem = {
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  category: string | null;
  created_at: string;
};

type ReportData = {
  month: string;
  total: number;
  categories: { category: string; total: number }[];
  items: ReportItem[];
};

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
}

export default function HouseReport() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/house?month=${m}`);
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex items-center justify-between">
        <h2 className="font-bold">تقرير المصاريف</h2>
        <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
      </section>

      {loading || !data ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : (
        <>
          <section className="card text-center">
            <p className="text-sm text-gray-500">إجمالي المصروف هذا الشهر</p>
            <p className="text-3xl font-bold text-primary-dark mt-1">{data.total.toFixed(2)}</p>
          </section>

          <section className="card">
            <h3 className="font-bold mb-3">حسب النوع</h3>
            {data.categories.length === 0 ? (
              <p className="text-gray-400 text-sm">لا توجد مصاريف هذا الشهر بعد.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.categories.map((c) => {
                  const pct = data.total ? Math.round((c.total / data.total) * 100) : 0;
                  return (
                    <div key={c.category} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0">{c.category}</span>
                      <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <span className="block h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-16 text-left font-semibold shrink-0">{c.total.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="font-bold mb-3">تفاصيل المشتريات</h3>
            {data.items.length === 0 ? (
              <p className="text-gray-400 text-sm">لا توجد عناصر هذا الشهر بعد.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                    <div>
                      <p className="font-medium text-sm">{it.item_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(it.created_at)} · {it.category ?? "أخرى"}
                      </p>
                    </div>
                    <span className="font-semibold text-sm">{it.line_total.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
