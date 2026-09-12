"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";
import type { House } from "@/lib/types";

type LineData = {
  id: string;
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  destination: "house" | "warehouse";
  house_id: string | null;
  house_name?: string;
  category: string | null;
};

type PurchaseWithLines = {
  id: string;
  store_name: string;
  created_at: string;
  total_amount: number;
  total_with_tax: number;
  lines: LineData[];
};

export default function AdvancedDailyOrdersTab({ houses = [] }: { houses: House[] }) {
  const [purchases, setPurchases] = useState<PurchaseWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "warehouse" | string>("all");
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState<Partial<LineData>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

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

  function startEdit(line: LineData) {
    setEditingLine(line.id);
    setEditForm({ ...line });
  }

  async function saveEdit() {
    if (!editingLine) return;

    setUpdating(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId: editingLine,
          ...editForm,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setEditingLine(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في التعديل");
    } finally {
      setUpdating(false);
    }
  }

  async function deletePurchase(purchaseId: string) {
    if (!confirm("⚠️ هل أنت متأكد من حذف هذه الفاتورة؟\nسيتم حذف الفاتورة وجميع عناصرها بشكل نهائي.")) {
      return;
    }

    setDeleting(purchaseId);
    try {
      const res = await fetch(`/api/purchases?id=${purchaseId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setError(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في الحذف");
    } finally {
      setDeleting(null);
    }
  }

  const filteredPurchases = purchases
    .map((p) => {
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
    })
    .filter((p) => p.lines.length > 0);

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

      <section className="card">
        {filteredPurchases.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد مشتريات</p>
        ) : (
          <div className="space-y-3">
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="border border-gray-200 rounded-lg overflow-hidden">
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

                {expandedPurchase === purchase.id && (
                  <div className="bg-gray-50 border-t border-gray-200 p-3 space-y-3">
                    {purchase.lines.map((line) => (
                      <div key={line.id} className="border border-gray-100 rounded-lg bg-white p-3">
                        {editingLine === line.id ? (
                          // نموذج التعديل
                          <div className="space-y-3">
                            <input
                              type="text"
                              className="input"
                              value={editForm.item_name || ""}
                              onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                              placeholder="اسم العنصر"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="number"
                                step="any"
                                className="input"
                                value={editForm.quantity || ""}
                                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value ? Number(e.target.value) : null })}
                                placeholder="الكمية"
                              />
                              <input
                                type="number"
                                step="any"
                                className="input"
                                value={editForm.unit_price || ""}
                                onChange={(e) => setEditForm({ ...editForm, unit_price: e.target.value ? Number(e.target.value) : null })}
                                placeholder="السعر"
                              />
                              <input
                                type="number"
                                step="any"
                                className="input"
                                value={editForm.line_total || ""}
                                onChange={(e) => setEditForm({ ...editForm, line_total: Number(e.target.value) })}
                                placeholder="الإجمالي"
                              />
                            </div>
                            <select
                              className="input"
                              value={editForm.category || ""}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                className="input"
                                value={editForm.destination || ""}
                                onChange={(e) => {
                                  setEditForm({
                                    ...editForm,
                                    destination: e.target.value as "house" | "warehouse",
                                    house_id: e.target.value === "warehouse" ? null : editForm.house_id,
                                  });
                                }}
                              >
                                <option value="warehouse">📦 المخزن</option>
                                <option value="house">🏠 البيت</option>
                              </select>
                              {editForm.destination === "house" && (
                                <select
                                  className="input"
                                  value={editForm.house_id || ""}
                                  onChange={(e) => setEditForm({ ...editForm, house_id: e.target.value })}
                                >
                                  <option value="">اختر البيت</option>
                                  {houses.map((h) => (
                                    <option key={h.id} value={h.id}>
                                      {h.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={saveEdit}
                                disabled={updating}
                                className="btn-primary flex-1 text-xs"
                              >
                                {updating ? "جارٍ الحفظ..." : "✓ حفظ"}
                              </button>
                              <button
                                onClick={() => setEditingLine(null)}
                                className="btn-secondary flex-1 text-xs"
                              >
                                ✕ إلغاء
                              </button>
                            </div>
                          </div>
                        ) : (
                          // عرض العنصر
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{line.item_name}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {line.quantity} × {line.unit_price} ريال
                                </p>
                                {line.category && (
                                  <p className="text-xs text-gray-400">📁 {line.category}</p>
                                )}
                              </div>
                              <div className="text-right ml-2 shrink-0">
                                <p className="font-semibold text-sm">{line.line_total.toFixed(2)}</p>
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
                            <button
                              onClick={() => startEdit(line)}
                              className="text-xs text-primary hover:underline"
                            >
                              ✏️ تعديل
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                      <div className="flex justify-between font-semibold text-sm">
                        <span>الإجمالي:</span>
                        <span>{purchase.total_amount.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => deletePurchase(purchase.id)}
                        disabled={deleting === purchase.id}
                        className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded border border-red-200"
                      >
                        {deleting === purchase.id ? "جارٍ الحذف..." : "🗑️ حذف الفاتورة"}
                      </button>
                    </div>
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
