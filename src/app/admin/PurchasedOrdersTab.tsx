"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type House } from "@/lib/types";

type StoreGroup = {
  store_name: string;
  purchase_ids: string[];
  total: number;
  item_count: number;
  items: Array<{
    id: string;
    name: string;
    qty: number | null;
    price: number | null;
    total: number;
    destination: "house" | "warehouse";
    house_id: string | null;
    category: string | null;
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
  const [houses, setHouses] = useState<House[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", qty: "", price: "", category: "" });
  const [rowError, setRowError] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [storeDraft, setStoreDraft] = useState("");

  useEffect(() => {
    loadHouses();
    load();
  }, []);

  async function loadHouses() {
    try {
      const res = await fetch("/api/houses");
      const data = await res.json();
      setHouses(data.houses || []);
    } catch (e) {
      console.error("خطأ في تحميل البيوت:", e);
    }
  }

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
          id: l.id,
          name: l.item_name,
          qty: l.quantity,
          price: l.unit_price,
          total: l.line_total,
          destination: l.destination || "warehouse",
          house_id: l.house_id,
          category: l.category ?? null,
        }));

        if (storeGroup) {
          storeGroup.purchase_ids.push(p.id);
          storeGroup.items.push(...items);
          storeGroup.total += p.total_amount;
          storeGroup.item_count += items.length;
        } else {
          grouped[date].stores.push({
            purchase_ids: [p.id],
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

  async function updateItemDestination(lineId: string, destination: "house" | "warehouse", houseId?: string) {
    setUpdating(lineId);
    try {
      const res = await fetch("/api/purchases/line", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId,
          destination,
          houseId: destination === "house" ? houseId : null,
        }),
      });
      if (res.ok) {
        load();
      } else {
        const err = await res.json();
        alert("خطأ: " + (err.error || "فشل التحديث"));
      }
    } catch (e) {
      alert("خطأ في الاتصال بالخادم");
    } finally {
      setUpdating(null);
    }
  }

  function startEdit(item: {
    id: string;
    name: string;
    qty: number | null;
    price: number | null;
    category: string | null;
  }) {
    setRowError(null);
    setEditingId(item.id);
    setForm({
      name: item.name,
      qty: String(item.qty ?? 1),
      price: String(item.price ?? 0),
      category: item.category ?? "",
    });
  }

  async function saveStoreName(ids: string[]) {
    const key = ids.join(",");
    setUpdating(key);
    try {
      const [first, ...rest] = ids;
      const res = await fetch(`/api/purchases/${first}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName: storeDraft, alsoIds: rest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التعديل");
      setEditingStore(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setUpdating(null);
    }
  }

  async function saveLine(lineId: string) {
    setUpdating(lineId);
    setRowError(null);
    try {
      const res = await fetch("/api/purchases/line", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId,
          itemName: form.name,
          quantity: Number(form.qty),
          unitPrice: Number(form.price),
          category: form.category || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التعديل");
      setEditingId(null);
      load();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setUpdating(null);
    }
  }

  async function removeLine(lineId: string, name: string) {
    if (!confirm(`حذف «${name}» من الفاتورة؟ سيُعاد حساب الإجمالي.`)) return;
    setUpdating(lineId);
    try {
      const res = await fetch("/api/purchases/line", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setUpdating(null);
    }
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
                        <div className="flex justify-between items-start gap-2">
                          {editingStore === store.purchase_ids.join(",") ? (
                            <div className="flex-1 flex gap-1">
                              <input
                                value={storeDraft}
                                onChange={(e) => setStoreDraft(e.target.value)}
                                className="input flex-1 text-sm"
                                placeholder="اسم المتجر"
                                autoFocus
                              />
                              <button
                                onClick={() => saveStoreName(store.purchase_ids)}
                                disabled={updating === store.purchase_ids.join(",")}
                                className="text-xs btn-primary px-3"
                              >
                                حفظ
                              </button>
                              <button
                                onClick={() => setEditingStore(null)}
                                className="text-xs bg-gray-100 border border-gray-300 rounded px-3"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingStore(store.purchase_ids.join(","));
                                setStoreDraft(store.store_name);
                              }}
                              className="font-semibold text-sm text-right hover:text-primary"
                              title="اضغط لتعديل اسم المتجر"
                            >
                              🛒 {store.store_name} <span className="text-gray-400 text-xs">✏️</span>
                            </button>
                          )}
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded whitespace-nowrap">
                            {store.total.toFixed(2)} ريال
                          </span>
                        </div>

                        {/* Items List */}
                        <div className="space-y-2">
                          {store.items.map((item, i) => (
                            <div
                              key={i}
                              className="text-xs text-gray-600 py-2 px-2 border border-gray-100 rounded bg-gray-50"
                            >
                              {editingId === item.id ? (
                                <div className="space-y-2">
                                  <input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="input w-full text-xs"
                                    placeholder="اسم العنصر"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-gray-500 mb-0.5">الكمية</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={form.qty}
                                        onChange={(e) => setForm({ ...form, qty: e.target.value })}
                                        className="input w-full text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-gray-500 mb-0.5">سعر الوحدة</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        inputMode="decimal"
                                        value={form.price}
                                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                                        className="input w-full text-xs"
                                      />
                                    </div>
                                  </div>
                                  <select
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                    className="input w-full text-xs"
                                  >
                                    <option value="">بدون تصنيف</option>
                                    {CATEGORIES.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="text-xs font-bold text-green-600">
                                    الإجمالي الجديد:{" "}
                                    {((Number(form.qty) || 0) * (Number(form.price) || 0)).toFixed(2)} ريال
                                  </p>
                                  {rowError && <p className="text-red-600 text-xs">{rowError}</p>}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditingId(null)}
                                      disabled={updating === item.id}
                                      className="flex-1 text-xs bg-gray-100 border border-gray-300 rounded p-1.5"
                                    >
                                      إلغاء
                                    </button>
                                    <button
                                      onClick={() => saveLine(item.id)}
                                      disabled={updating === item.id}
                                      className="flex-1 text-xs btn-primary"
                                    >
                                      {updating === item.id ? "جارٍ الحفظ..." : "حفظ"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-700">{item.name}</p>
                                    <p className="text-gray-500">
                                      {item.qty && `${item.qty}×`} {item.price} ريال ={" "}
                                      {item.total.toFixed(2)}
                                      {item.category && (
                                        <span className="text-gray-400"> • {item.category}</span>
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <select
                                      disabled={updating === item.id}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === "warehouse") {
                                          updateItemDestination(item.id, "warehouse");
                                        } else {
                                          updateItemDestination(item.id, "house", value);
                                        }
                                      }}
                                      value={
                                        item.destination === "house" ? item.house_id || "" : "warehouse"
                                      }
                                      className="input text-xs py-1"
                                    >
                                      <option value="warehouse">📦 المخزن</option>
                                      {houses.map((h) => (
                                        <option key={h.id} value={h.id}>
                                          🏠 {h.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => startEdit(item)}
                                      className="text-blue-600 border border-blue-200 rounded px-2 py-1 text-xs"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => removeLine(item.id, item.name)}
                                      disabled={updating === item.id}
                                      className="text-red-500 border border-red-200 rounded px-2 py-1 text-xs"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              )}
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
