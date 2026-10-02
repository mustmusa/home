"use client";

import { useEffect, useState, useCallback } from "react";

type ReportData = {
  month: string;
  year: number;
  houseTotals: {
    house_id: string;
    name: string;
    total: number;
    count: number;
    lines: {
      item_name: string;
      quantity: number | null;
      unit_price: number | null;
      line_total: number;
      created_at: string;
      source: string;
    }[];
  }[];
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
  const [openHouse, setOpenHouse] = useState<string | null>(null);
  const [showWarehouse, setShowWarehouse] = useState(false);

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
                <button
                  key={h.house_id}
                  onClick={() => setOpenHouse(openHouse === h.house_id ? null : h.house_id)}
                  className={`border rounded-lg p-3 text-center ${
                    openHouse === h.house_id
                      ? "border-primary bg-primary/5"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm text-gray-500">{h.name}</p>
                  <p className="text-xl font-bold text-primary-dark">{h.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">
                    {h.count} عنصر {openHouse === h.house_id ? "▲" : "▼"}
                  </p>
                </button>
              ))}
            </div>

            {/* The lines that make up the figure above */}
            {openHouse && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                {(() => {
                  const house = data.houseTotals.find((h) => h.house_id === openHouse);
                  if (!house) return null;
                  if (house.lines.length === 0) {
                    return <p className="text-gray-400 text-sm text-center">لا مشتريات هذا الشهر</p>;
                  }
                  return (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        مشتريات {house.name} المحسوبة في {month}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-500 text-right">
                              <th className="pb-2">العنصر</th>
                              <th className="pb-2">التاريخ</th>
                              <th className="pb-2">المبلغ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {house.lines.map((l, i) => (
                              <tr key={i} className="border-t border-gray-100">
                                <td className="py-2">
                                  {l.item_name}
                                  {l.quantity ? (
                                    <span className="text-gray-400 text-xs"> ×{l.quantity}</span>
                                  ) : null}
                                  {l.source === "warehouse_pull" && (
                                    <span className="text-gray-400 text-xs"> • من المخزن</span>
                                  )}
                                </td>
                                <td className="py-2 text-gray-500 text-xs whitespace-nowrap">
                                  {l.created_at.slice(0, 10)}
                                </td>
                                <td className="py-2 font-semibold whitespace-nowrap">
                                  {l.line_total.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </section>

          {/* Warehouse Inventory — the table stays folded until asked for */}
          <section className="card">
            <button
              onClick={() => setShowWarehouse((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="font-bold">📦 المخزن</h3>
              <span className="text-sm text-gray-400">
                {data.warehouse.items.length} عنصر {showWarehouse ? "▲" : "▼"}
              </span>
            </button>
            <div className="border border-gray-100 rounded-lg p-3 text-center mt-3">
              <p className="text-sm text-gray-500">قيمة المخزون الحالي</p>
              <p className="text-xl font-bold text-warehouse">{data.warehouse.totalValue.toFixed(2)}</p>
            </div>

            {showWarehouse && (
              <div className="overflow-x-auto mt-3">
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
            )}
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
