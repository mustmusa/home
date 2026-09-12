"use client";

import { useEffect, useState } from "react";
import type { House } from "@/lib/types";

type Request = {
  id: string;
  item_name: string;
  quantity_text: string | null;
  quantity_requested: number | null;
  notes: string | null;
  house_id: string;
  house_name: string;
  requested_at: string;
};

export default function ActiveOrdersTab() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [reqRes, housesRes] = await Promise.all([
        fetch("/api/requests?status=pending").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
      ]);
      setRequests(
        (reqRes.requests || []).map((r: any) => ({
          id: r.id,
          item_name: r.item_name,
          quantity_text: r.quantity_text,
          quantity_requested: r.quantity_requested,
          notes: r.notes,
          house_id: r.house_id,
          house_name: (housesRes.houses || []).find((h: any) => h.id === r.house_id)?.name || "بيت",
          requested_at: r.requested_at,
        }))
      );
      setHouses(housesRes.houses || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في التحميل");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedRequests);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedRequests(newSelected);
  }

  function toggleSelectAll() {
    if (selectedRequests.size === filteredRequests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(filteredRequests.map((r) => r.id)));
    }
  }

  async function purchaseSelected() {
    if (selectedRequests.size === 0) {
      alert("اختر طلبات للشراء");
      return;
    }

    if (!confirm(`شراء ${selectedRequests.size} طلب?`)) return;

    setPurchasing(true);
    try {
      const res = await fetch("/api/purchases/create-from-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIds: Array.from(selectedRequests),
        }),
      });

      if (!res.ok) throw new Error("فشل الشراء");

      setSelectedRequests(new Set());
      load();
      alert("✅ تم شراء الطلبات بنجاح");
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ في الشراء");
    } finally {
      setPurchasing(false);
    }
  }

  const filteredRequests =
    filter === "all" ? requests : requests.filter((r) => r.house_id === filter);

  const stats = {
    total: filteredRequests.length,
    selected: selectedRequests.size,
  };

  if (loading) return <p className="text-gray-400 text-sm">جارٍ التحميل...</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* Header Stats */}
      <section className="card">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-600">إجمالي الطلبات</p>
            <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-gray-600">المختار</p>
            <p className="text-2xl font-bold text-green-600">{stats.selected}</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-gray-600">البيوت النشطة</p>
            <p className="text-2xl font-bold text-amber-600">
              {new Set(filteredRequests.map((r) => r.house_id)).size}
            </p>
          </div>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Filter & Actions */}
      <section className="card space-y-3">
        <div>
          <label className="block text-sm font-semibold mb-2">تصفية حسب:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input w-full"
          >
            <option value="all">🔍 الجميع</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                🏠 {h.name}
              </option>
            ))}
          </select>
        </div>

        {filteredRequests.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={toggleSelectAll}
              className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 p-2 rounded border border-gray-300"
            >
              {selectedRequests.size === filteredRequests.length ? "✕ إلغاء التحديد" : "✓ اختر الكل"}
            </button>
            {selectedRequests.size > 0 && (
              <button
                onClick={purchaseSelected}
                disabled={purchasing}
                className="flex-1 text-xs btn-primary"
              >
                {purchasing ? "جارٍ الشراء..." : `🛒 شراء (${selectedRequests.size})`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Requests List */}
      <section className="card">
        {filteredRequests.length === 0 ? (
          <p className="text-gray-400 text-sm text-center">لا توجد طلبات معلّقة 🎉</p>
        ) : (
          <div className="space-y-2">
            {filteredRequests.map((req) => (
              <div
                key={req.id}
                className={`p-3 border rounded-lg cursor-pointer transition ${
                  selectedRequests.has(req.id)
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => toggleSelect(req.id)}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRequests.has(req.id)}
                    onChange={() => toggleSelect(req.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{req.item_name}</p>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded whitespace-nowrap">
                        {req.house_name}
                      </span>
                    </div>
                    {req.quantity_text && (
                      <p className="text-xs text-gray-600 mt-1">📦 {req.quantity_text}</p>
                    )}
                    {req.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">💬 {req.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(req.requested_at).toLocaleString("ar-SA")}
                    </p>
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
