"use client";

import { useEffect, useState, useCallback } from "react";

type ReportData = {
  month: string;
  year: number;
  houseTotals: { house_id: string; name: string; total: number; count: number }[];
  warehouse: {
    items: { id: string; name: string; quantity: number; unit: string | null; unit_cost: number | null }[];
    totalValue: number;
  };
  itemCosts: { item_name: string; monthTotal: number; yearTotal: number }[];
};

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ReportsTab() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const year = Number(m.slice(0, 4));
      const res = await fetch(`/api/reports?month=${m}&year=${year}`);
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
        <h2 className="font-bold">التقرير الشهري</h2>
        <input
          type="month"
          className="input w-auto"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </section>

      {loading || !data ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : (
        <>
          {/* Summary Card */}
          <section className="card">
            <h3 className="font-bold mb-4">📊 ملخص المصاريف والمخزن</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="border border-blue-200 rounded-lg p-3 text-center bg-blue-50">
                <p className="text-sm text-gray-600">مصاريف البيوت</p>
                <p className="text-2xl font-bold text-blue-600">
                  {data.houseTotals.reduce((sum, h) => sum + h.total, 0).toFixed(2)}
                </p>
              </div>
              <div className="border border-purple-200 rounded-lg p-3 text-center bg-purple-50">
                <p className="text-sm text-gray-600">قيمة المخزن الحالية</p>
                <p className="text-2xl font-bold text-purple-600">{data.warehouse.totalValue.toFixed(2)}</p>
              </div>
            </div>
            <div className="border border-green-200 rounded-lg p-3 text-center bg-green-50">
              <p className="text-sm text-gray-600">الإجمالي الكلي</p>
              <p className="text-3xl font-bold text-green-600">
                {(data.houseTotals.reduce((sum, h) => sum + h.total, 0) + data.warehouse.totalValue).toFixed(2)}
              </p>
            </div>
          </section>

          {/* House Expenses */}
          <section className="card">
            <h3 className="font-bold mb-3">🏠 مصاريف البيوت</h3>
            <div className="grid grid-cols-2 gap-3">
              {data.houseTotals.map((h) => (
                <div key={h.house_id} className="border border-gray-100 rounded-lg p-3 text-center">
                  <p className="text-sm text-gray-500">{h.name}</p>
                  <p className="text-xl font-bold text-primary-dark">{h.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{h.count} عنصر</p>
                </div>
              ))}
            </div>
          </section>

          {/* Warehouse Inventory */}
          <section className="card">
            <h3 className="font-bold mb-3">📦 المخزن</h3>
            <div className="grid grid-cols-1 gap-3 mb-3">
              <div className="border border-gray-100 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-500">قيمة المخزون الحالي</p>
                <p className="text-xl font-bold text-warehouse">{data.warehouse.totalValue.toFixed(2)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-right">
                    <th className="pb-2">العنصر</th>
                    <th className="pb-2">الكمية</th>
                    <th className="pb-2">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.warehouse.items.map((it) => (
                    <tr key={it.id} className="border-t border-gray-100">
                      <td className="py-2">{it.name}</td>
                      <td className="py-2">
                        {it.quantity} {it.unit ?? ""}
                      </td>
                      <td className="py-2">
                        {it.unit_cost ? (Number(it.quantity) * Number(it.unit_cost)).toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3 className="font-bold mb-3">تكلفة كل عنصر (شهريًا وسنويًا {data.year})</h3>
            <p className="text-xs text-gray-400 mb-2">
              يشمل المشتريات الفعلية فقط (لا يشمل السحب الداخلي من المخزن، لتفادي احتساب المبلغ مرتين)
            </p>
            {data.itemCosts.length === 0 ? (
              <p className="text-gray-400 text-sm">لا توجد بيانات بعد.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-right">
                      <th className="pb-2">العنصر</th>
                      <th className="pb-2">هذا الشهر</th>
                      <th className="pb-2">هذه السنة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.itemCosts.map((it) => (
                      <tr key={it.item_name} className="border-t border-gray-100">
                        <td className="py-2">{it.item_name}</td>
                        <td className="py-2">{it.monthTotal.toFixed(2)}</td>
                        <td className="py-2 font-semibold">{it.yearTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
