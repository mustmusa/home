"use client";

import { useEffect, useState } from "react";
import type { House } from "@/lib/types";

type PurchaseWithLines = {
  id: string;
  store_name: string;
  created_at: string;
  total_amount: number;
  total_with_tax: number;
  lines: {
    id: string;
    item_name: string;
    quantity: number | null;
    unit_price: number | null;
    line_total: number;
    destination: "house" | "warehouse";
    house_id: string | null;
    house_name?: string;
    category: string | null;
  }[];
};

export default function AdvancedDailyOrdersTab({ houses = [] }: { houses: House[] }) {
  const [purchases, setPurchases] = useState<PurchaseWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "warehouse" | string>("all"); // "all", "warehouse", or house id
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases?limit=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const today = new Date().toISOString().slice(0, 10);
      const todayPurchases = (data.purchases || []).filter(
        (p: any) => p.created_at.slice(0, 10) === today
      );

      // تنسيق البيانات
      const formatted = todayPurchases.map((p: any) => ({
        id: p.id,
        store_name: p.store_name || "متجر",
        created_at: p.created_at,
        total_amount: p.total_amount,
        total_with_tax: p.total_with_tax,
        lines: (p.purchase_lines || []).map((l: any) => ({
          id: l.id,
          item_name: l.item_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
          destination: l.destination,
          house_id: l.house_id,
          category: l.category,
        })),
      }));

      setPurchases(formatted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }

  // تصفية الفواتير حسب الاختيار
  const filteredPurchases = purchases.map((p) => {
    if (filter === "all") {
      return p;
    } else if (filter === "warehouse") {
      return {
        ...p,
        lines: p.lines.filter((l) => l.destination === "warehouse"),
      };
    } else {
      return {
        ...p,
        lines: p.lines.filter((l) => l.destination === "house" && l.house_id === filter),
      };
    }
  }).filter((p) => p.lines.length > 0);

  // حساب الإجماليات حسب التصفية
  const totalsData = filteredPurchases.reduce(
    (acc, p) => ({
      count: acc.count + p.lines.length,
      total: acc.total + p.lines.reduce((s, l) => s + l.line_total, 0),
    }),
    { count: 0, total: 0 }
  );

  if (loading) {
    return <section className="card"><p className="text-gray-400 text-sm">جارٍ التحميل...</p></section>;
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="font-bold mb-4">🛒 مشتريات اليوم</h2>

        {/* التصفية */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-600 mb-2">تصفية حسب:</label>
          <select
            className="input w-full"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">🔍 الجميع (فاتورة شاملة)</option>
            <option value="warehouse">📦 المخزن</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                🏠 {h.name}
              </option>
            ))}
          </select>
        </div>

        {/* الإحصائيات */}
        <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-gray-200">
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">العناصر</p>
            <p className="text-xl font-bold">{totalsData.count}</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">الإجمالي</p>
            <p className="text-xl font-bold text-blue-600">{totalsData.total.toFixed(2)}</p>
          </div>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* قائمة الفواتير */}
      <section className="card">
        {filteredPurchases.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد مشتريات</p>
        ) : (
          <div className="space-y-3">
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* رأس الفاتورة */}
                <button
                  onClick={() =>
                    setExpandedPurchase(expandedPurchase === purchase.id ? null : purchase.id)
                  }
                  className="w-full text-right p-3 hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      🛒 {purchase.store_name}
                      <span className="text-xs text-gray-500 ml-2">
                        ({purchase.lines.length} عنصر)
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(purchase.created_at).toLocaleTimeString("ar-SA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-sm">{purchase.total_amount.toFixed(2)}</p>
                    {expandedPurchase === purchase.id ? "▼" : "◀"}
                  </div>
                </button>

                {/* تفاصيل الفاتورة */}
                {expandedPurchase === purchase.id && (
                  <div className="bg-gray-50 border-t border-gray-200 p-3 space-y-2">
                    {purchase.lines.map((line) => (
                      <div key={line.id} className="flex justify-between items-start text-xs">
                        <div className="flex-1">
                          <p className="font-medium">{line.item_name}</p>
                          <p className="text-gray-500">
                            {line.quantity} × {line.unit_price} ريال
                          </p>
                          {line.category && (
                            <p className="text-gray-400">📁 {line.category}</p>
                          )}
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <p className="font-semibold">{line.line_total.toFixed(2)}</p>
                          <span
                            className={`text-xs px-2 py-1 rounded mt-1 inline-block ${
                              line.destination === "warehouse"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {line.destination === "warehouse" ? "📦" : "🏠"}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold text-sm">
                      <span>الإجمالي:</span>
                      <span>{purchase.total_amount.toFixed(2)}</span>
                    </div>
                    {purchase.total_with_tax > 0 && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>مع الضريبة:</span>
                        <span>{purchase.total_with_tax.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
