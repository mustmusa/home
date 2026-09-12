"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest } from "@/lib/types";

type PurchaseItem = {
  id: string;
  store_name: string;
  total_amount: number;
  created_at: string;
};

export default function PendingRequestsTab() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingRequestId, setLinkingRequestId] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [updating, setUpdating] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, housesRes, purchasesRes] = await Promise.all([
        fetch("/api/requests?status=pending").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
        fetch("/api/purchases?limit=100").then((r) => r.json()),
      ]);
      setRequests(reqRes.requests ?? []);
      setHouses(housesRes.houses ?? []);
      setPurchases(purchasesRes.purchases ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function linkToPurchase(requestId: string, purchaseId: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "purchased" }),
      });
      if (!res.ok) throw new Error("فشل الربط");
      setLinkingRequestId(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setUpdating(false);
    }
  }

  async function updateRequest(id: string, itemName: string) {
    if (!itemName.trim()) {
      alert("اسم العنصر مطلوب");
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: itemName.trim(),
          quantity_text: itemName.trim()
        }),
      });
      if (!res.ok) throw new Error("فشل التعديل");
      setEditingRequestId(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setUpdating(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("إلغاء هذا الطلب؟")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("فشل الإلغاء");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <p className="text-gray-400 text-sm">جارٍ التحميل...</p>;

  const totalRequests = requests.length;
  const requestsByHouse = houses.map(h => ({
    ...h,
    count: requests.filter(r => r.house_id === h.id).length
  }));

  const filteredRequests = selectedHouse
    ? requests.filter(r => r.house_id === selectedHouse)
    : requests;

  return (
    <div className="flex flex-col gap-4">
      {/* إحصائيات */}
      <section className="card">
        <h2 className="font-bold mb-3">📊 ملخص الطلبات المعلقة</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600">إجمالي الطلبات</p>
            <p className="text-2xl font-bold text-blue-600">{totalRequests}</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs text-gray-600">البيوت النشطة</p>
            <p className="text-2xl font-bold text-purple-600">{requestsByHouse.filter(h => h.count > 0).length}</p>
          </div>
        </div>

        {/* فلترة حسب البيت */}
        <select
          className="input w-full"
          value={selectedHouse || ""}
          onChange={(e) => setSelectedHouse(e.target.value || null)}
        >
          <option value="">🏠 جميع البيوت ({totalRequests})</option>
          {requestsByHouse.filter(h => h.count > 0).map((h) => (
            <option key={h.id} value={h.id}>{h.name} ({h.count})</option>
          ))}
        </select>
      </section>

      {/* قائمة الطلبات */}
      {filteredRequests.length === 0 ? (
        <p className="text-gray-400 text-sm text-center">لا توجد طلبات معلّقة 🎉</p>
      ) : (
        <section className="card">
          <h2 className="font-bold mb-3">⏳ الطلبات ({filteredRequests.length})</h2>
          <div className="flex flex-col gap-3">
            {houses.map((h) => {
              if (selectedHouse && h.id !== selectedHouse) return null;
              const list = filteredRequests.filter((r) => r.house_id === h.id);
              if (list.length === 0) return null;
              return (
          <section key={h.id} className="card">
            <h2 className="font-bold mb-3">
              {h.name} <span className="text-gray-400 text-sm">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="text-gray-400 text-sm">لا يوجد طلبات معلّقة.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((r) => (
                  <li key={r.id} className="border border-gray-100 rounded-lg p-3">
                    {linkingRequestId === r.id ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold mb-2">ربط مع شراء:</p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {purchases.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => linkToPurchase(r.id, p.id)}
                              disabled={updating}
                              className="w-full text-left text-xs p-2 rounded border border-blue-200 hover:bg-blue-50"
                            >
                              {p.store_name} • {p.total_amount.toFixed(2)} ريال •{" "}
                              {new Date(p.created_at).toLocaleString("ar-SA")}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setLinkingRequestId(null)}
                          className="w-full text-xs p-2 rounded border border-gray-200 text-gray-600"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : editingRequestId === r.id ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold mb-2">تعديل الطلب:</p>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full text-xs p-2 rounded border border-gray-200"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateRequest(r.id, editText)}
                            disabled={updating}
                            className="flex-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded border border-green-200 font-semibold"
                          >
                            ✓ حفظ
                          </button>
                          <button
                            onClick={() => setEditingRequestId(null)}
                            className="flex-1 text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded border border-gray-200"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{r.item_name}</p>
                          {r.quantity_text && <p className="text-xs text-gray-500">{r.quantity_text}</p>}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => {
                              setEditText(r.item_name);
                              setEditingRequestId(r.id);
                            }}
                            className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-1 rounded border border-purple-200"
                          >
                            ✎ تعديل
                          </button>
                          <button
                            onClick={() => setLinkingRequestId(r.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200"
                          >
                            ✓ ربط
                          </button>
                          <button
                            onClick={() => cancel(r.id)}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded border border-red-200"
                          >
                            ✕ إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
              </section>
            );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
