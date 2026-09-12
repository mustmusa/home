"use client";

import { useEffect, useState } from "react";

type StoreGroup = {
  store_name: string;
  total: number;
  item_count: number;
  items: Array<{
    name: string;
    qty: number | null;
    price: number | null;
    total: number;
  }>;
};

type DateGroup = {
  date: string;
  stores: StoreGroup[];
  totalAmount: number;
  totalItems: number;
};

export default function PurchasedOrdersTab() {
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases?limit=200");
      const data = await res.json();
      const purchases = data.purchases || [];

      // Group by date and store
      const grouped: Record<string, DateGroup> = {};

      purchases.forEach((p: any) => {
        const date = p.created_at.slice(0, 10);
        if (!grouped[date]) {
          grouped[date] = {
            date,
            stores: [],
            totalAmount: 0,
            totalItems: 0,
          };
        }

        const storeGroup = grouped[date].stores.find(
          (s) => s.store_name === (p.store_name || "متجر")
        );

        const items = (p.purchase_lines || []).map((l: any) => ({
          name: l.item_name,
          qty: l.quantity,
          price: l.unit_price,
          total: l.line_total,
        }));

        if (storeGroup) {
          storeGroup.items.push(...items);
          storeGroup.total += p.total_amount;
          storeGroup.item_count += items.length;
        } else {
          grouped[date].stores.push({
            store_name: p.store_name || "متجر",
            total: p.total_amount,
            item_count: items.length,
            items,
          });
        }

        grouped[date].totalAmount += p.total_amount;
        grouped[date].totalItems += items.length;
      });

      const sorted = Object.values(grouped).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setDateGroups(sorted);
      if (sorted.length > 0) {
        setExpandedDates(new Set([sorted[0].date]));
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(date: string) {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) newExpanded.delete(date);
    else newExpanded.add(date);
    setExpandedDates(newExpanded);
  }

  const stats = {
    totalDays: dateGroups.length,
    totalPurchases: dateGroups.reduce((sum, d) => sum + d.stores.length, 0),
    totalSpent: dateGroups.reduce((sum, d) => sum + d.totalAmount, 0),
  };

  if (loading) return <p className="text-gray-400 text-sm">جارٍ التحميل...</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Cards */}
      <section className="card">
        <h2 className="font-bold mb-4">📊 ملخص السجلات</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-gray-600">عدد الأيام</p>
            <p className="text-2xl font-bold text-purple-600">{stats.totalDays}</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <p className="text-xs text-gray-600">المشتريات</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.totalPurchases}</p>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg">
            <p className="text-xs text-gray-600">الإجمالي المصروف</p>
            <p className="text-2xl font-bold text-orange-600">{stats.totalSpent.toFixed(2)}</p>
          </div>
        </div>
      </section>

      {/* History by Date */}
      <section className="card">
        {dateGroups.length === 0 ? (
          <p className="text-gray-400 text-sm text-center">لا توجد مشتريات مسجلة</p>
        ) : (
          <div className="space-y-2">
            {dateGroups.map((dateGroup) => (
              <div key={dateGroup.date} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Date Header */}
                <button
                  onClick={() => toggleExpand(dateGroup.date)}
                  className="w-full p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-200"
                >
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">
                      📅{" "}
                      {new Date(dateGroup.date).toLocaleDateString("ar-SA", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {dateGroup.stores.length} متاجر • {dateGroup.totalItems} عنصر
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-sm text-green-600">
                      {dateGroup.totalAmount.toFixed(2)} ريال
                    </p>
                    <p className="text-xs text-gray-400">
                      {expandedDates.has(dateGroup.date) ? "▼" : "◀"}
                    </p>
                  </div>
                </button>

                {/* Stores Details */}
                {expandedDates.has(dateGroup.date) && (
                  <div className="bg-gray-50 p-3 space-y-3 border-t border-gray-200">
                    {dateGroup.stores.map((store, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-gray-100 rounded-lg p-3 space-y-2"
                      >
                        {/* Store Header */}
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-sm">🛒 {store.store_name}</h4>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {store.total.toFixed(2)} ريال
                          </span>
                        </div>

                        {/* Items List */}
                        <div className="space-y-1">
                          {store.items.map((item, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-center text-xs text-gray-600 py-1 border-t border-gray-100"
                            >
                              <span>{item.name}</span>
                              <span className="text-right">
                                {item.qty && `${item.qty}×`} {item.price} ريال ={" "}
                                <span className="font-semibold">{item.total.toFixed(2)}</span>
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Store Total */}
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                          <span className="text-xs font-semibold">الإجمالي:</span>
                          <span className="text-xs font-bold text-green-600">
                            {store.total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
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
