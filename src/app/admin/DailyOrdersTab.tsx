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
  houseTotal: number;
  warehouseTotal: number;
  byHouse: { [key: string]: { name: string; total: number; count: number } };
};

type HouseOption = {
  id: string;
  name: string;
};

export default function DailyOrdersTab({ houses = [] }: { houses?: HouseOption[] }) {
  const [data, setData] = useState<DailyOrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDest, setEditDest] = useState<"house" | "warehouse" | null>(null);
  const [editHouse, setEditHouse] = useState<string | null>(null);

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

  async function updateDestination(lineId: string, newDest: "house" | "warehouse", houseId: string | null) {
    if (newDest === "house" && !houseId) {
      setError("يجب تحديد البيت");
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch("/api/reports/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId,
          destination: newDest,
          house_id: houseId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "فشل التحديث");
      }
      setEditingId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في التحديث");
    } finally {
      setUpdating(false);
    }
  }

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
          <h2 className="font-bold">طلبيات اليوم</h2>
          <span className="text-xs text-gray-500">{data.today}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">الإجمالي</p>
            <p className="text-lg font-bold">{data.total.toFixed(2)}</p>
            <p className="text-xs text-gray-400">{data.count} عنصر</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">البيوت</p>
            <p className="text-lg font-bold text-blue-600">{data.houseTotal.toFixed(2)}</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">المخزن</p>
            <p className="text-lg font-bold text-amber-600">{data.warehouseTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* توزيع حسب البيت */}
        {Object.keys(data.byHouse).length > 0 && (
          <div className="mb-4 pb-4 border-b border-gray-200">
            <p className="text-xs font-bold text-gray-600 mb-2">توزيع البيوت:</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.byHouse).map(([houseId, houseData]) => (
                <div key={houseId} className="border border-gray-100 rounded p-2 text-center">
                  <p className="text-xs text-gray-600">{houseData.name}</p>
                  <p className="text-sm font-semibold">{houseData.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{houseData.count} عنصر</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className="card">
        <h3 className="font-bold mb-3">قائمة العناصر</h3>
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
                  <span
                    className={`text-xs px-2 py-1 rounded font-semibold shrink-0 ${
                      item.destination === "house"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {item.destination === "house" ? `🏠 ${item.house_name}` : "📦 مخزن"}
                  </span>
                </div>

                {/* تحرير الوجهة */}
                {editingId === item.id ? (
                  <div className="flex gap-2 mt-2">
                    <select
                      className="input flex-1 text-xs"
                      value={editDest || ""}
                      onChange={(e) => {
                        setEditDest(e.target.value as "house" | "warehouse");
                        if (e.target.value === "warehouse") {
                          setEditHouse(null);
                        }
                      }}
                    >
                      <option value="">اختر الوجهة</option>
                      <option value="warehouse">المخزن</option>
                      <option value="house">البيت</option>
                    </select>
                    {editDest === "house" && (
                      <select
                        className="input flex-1 text-xs"
                        value={editHouse || ""}
                        onChange={(e) => setEditHouse(e.target.value)}
                      >
                        <option value="">اختر البيت</option>
                        {houses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => updateDestination(item.id, editDest!, editHouse)}
                      disabled={!editDest || updating}
                      className="btn-primary !px-2 text-xs shrink-0"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-secondary !px-2 text-xs shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setEditDest(item.destination);
                      setEditHouse(item.house_id);
                    }}
                    className="text-xs text-primary mt-2"
                  >
                    تعديل الوجهة ✏️
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
