"use client";

import { useEffect, useState } from "react";
import type { House } from "@/lib/types";
import { CATEGORIES, STORES } from "@/lib/types";

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

type DraftLine = {
  requestId: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
  destination: "house" | "warehouse";
  houseId: string;
  houseName: string;
  category: string;
};

export default function ActiveOrdersTab() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[] | null>(null);
  const [storeName, setStoreName] = useState("إدخال يدوي");

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

  function openDraft() {
    const chosen = requests.filter((r) => selectedRequests.has(r.id));
    if (chosen.length === 0) return;
    setError(null);
    setStoreName("");
    setDraft(
      chosen.map((r) => ({
        requestId: r.id,
        itemName: r.item_name,
        quantity: r.quantity_requested ?? 1,
        unitPrice: "",
        destination: "house",
        houseId: r.house_id,
        houseName: r.house_name,
        category: "",
      }))
    );
  }

  function editLine(i: number, patch: Partial<DraftLine>) {
    setDraft((d) => d && d.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
  }

  async function saveDraft() {
    if (!draft) return;
    const missing = draft.find((l) => l.unitPrice.trim() === "");
    if (missing) {
      setError(`أدخل سعر: ${missing.itemName}`);
      return;
    }

    setPurchasing(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases/create-from-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          items: draft.map((l) => ({
            requestId: l.requestId,
            itemName: l.itemName,
            quantity: l.quantity,
            unitPrice: Number(l.unitPrice),
            destination: l.destination,
            houseId: l.houseId,
            category: l.category || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");

      setDraft(null);
      setSelectedRequests(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
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
                onClick={openDraft}
                disabled={purchasing}
                className="flex-1 text-xs btn-primary"
              >
                {`🛒 شراء (${selectedRequests.size})`}
              </button>
            )}
          </div>
        )}
      </section>

      {draft && (
        <section className="card border-2 border-primary">
          <h2 className="font-bold mb-1">🧾 تسجيل شراء يدوي</h2>
          <p className="text-xs text-gray-500 mb-3">
            أدخل ما دفعته فعلاً. تُحفظ فاتورة بمصدر «إدخال يدوي» وتتحوّل الطلبات إلى «تم شراؤه».
          </p>

          <label className="block text-xs font-semibold text-gray-600 mb-1">
            المكان الذي اشتريت منه
          </label>
          <select
            id="manual-store"
            value={STORES.includes(storeName as never) ? storeName : "__other__"}
            onChange={(e) => setStoreName(e.target.value === "__other__" ? "" : e.target.value)}
            className="input w-full text-sm mb-2"
          >
            <option value="">اختر المتجر</option>
            {STORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__other__">متجر آخر…</option>
          </select>
          {!STORES.includes(storeName as never) && (
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="اكتب اسم المتجر"
              className="input w-full text-sm mb-3"
            />
          )}

          <div className="space-y-2">
            {draft.map((line, i) => {
              const lineTotal = (Number(line.unitPrice) || 0) * line.quantity;
              return (
                <div key={line.requestId} className="border border-gray-200 rounded-lg p-2 space-y-2">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="font-semibold text-sm flex-1">{line.itemName}</p>
                    <span className="text-xs font-bold text-green-600 whitespace-nowrap">
                      {lineTotal.toFixed(2)} ر.س
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">الكمية</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => editLine(i, { quantity: Number(e.target.value) || 0 })}
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
                        value={line.unitPrice}
                        onChange={(e) => editLine(i, { unitPrice: e.target.value })}
                        placeholder="0.00"
                        className="input w-full text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={line.destination}
                      onChange={(e) =>
                        editLine(i, { destination: e.target.value as "house" | "warehouse" })
                      }
                      className="input text-xs"
                    >
                      <option value="house">🏠 {line.houseName}</option>
                      <option value="warehouse">📦 المخزن</option>
                    </select>
                    <select
                      value={line.category}
                      onChange={(e) => editLine(i, { category: e.target.value })}
                      className="input text-xs"
                    >
                      <option value="">بدون تصنيف</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-gray-200">
            <span className="text-sm font-semibold">الإجمالي</span>
            <span className="text-lg font-bold text-green-600">
              {draft
                .reduce((s, l) => s + (Number(l.unitPrice) || 0) * l.quantity, 0)
                .toFixed(2)}{" "}
              ر.س
            </span>
          </div>

          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setDraft(null)}
              disabled={purchasing}
              className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 p-2 rounded border border-gray-300"
            >
              إلغاء
            </button>
            <button onClick={saveDraft} disabled={purchasing} className="flex-1 text-sm btn-primary">
              {purchasing ? "جارٍ الحفظ..." : "✓ حفظ الشراء"}
            </button>
          </div>
        </section>
      )}

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
