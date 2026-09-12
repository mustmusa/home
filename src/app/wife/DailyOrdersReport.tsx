"use client";

import { useEffect, useState, useCallback } from "react";

type DailyOrderItem = {
  id: string;
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  destination: "house" | "warehouse";
  house_id: string | null;
  house_name: string;
  category: string | null;
  created_at: string;
  purchase_id: string;
};

type DailyOrdersData = {
  today: string;
  total: number;
  count: number;
  items: DailyOrderItem[];
};

export default function DailyOrdersReport() {
  const [data, setData] = useState<DailyOrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/daily");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "خطأ في التحميل");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // أعد التحميل كل 30 ثانية
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <section className="card">
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card">
        <p className="text-gray-400 text-sm">لا توجد بيانات</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">مشتريات اليوم</h2>
          <span className="text-xs text-gray-500">{data.today}</span>
        </div>

        <div className="border border-gray-100 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
          <p className="text-2xl font-bold text-blue-600">{data.total.toFixed(2)} ريال</p>
          <p className="text-xs text-gray-400 mt-1">{data.count} عنصر</p>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className="card">
        <h3 className="font-bold mb-3">قائمة المشتريات</h3>
        {data.items.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد مشتريات لهذا اليوم</p>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <div key={item.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{item.item_name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.quantity} × {item.unit_price} = {item.line_total.toFixed(2)} ريال
                    </p>
                    {item.category && (
                      <p className="text-xs text-gray-400">📁 {item.category}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
