"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest, WarehouseItem } from "@/lib/types";

export default function WarehouseManager() {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [pending, setPending] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [pullItem, setPullItem] = useState("");
  const [pullHouse, setPullHouse] = useState("");
  const [pullRequest, setPullRequest] = useState("");
  const [pullQty, setPullQty] = useState("");
  const [pullError, setPullError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, housesRes, pendingRes] = await Promise.all([
        fetch("/api/warehouse").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
        fetch("/api/requests?status=pending").then((r) => r.json()),
      ]);
      setItems(itemsRes.items ?? []);
      setHouses(housesRes.houses ?? []);
      setPending(pendingRes.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          quantity: Number(qty || 0),
          unit: unit || null,
          unit_cost: cost ? Number(cost) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "حدث خطأ");
        return;
      }
      setName("");
      setQty("");
      setUnit("");
      setCost("");
      load();
    } finally {
      setAdding(false);
    }
  }

  async function pull(e: React.FormEvent) {
    e.preventDefault();
    setPullError(null);
    if (!pullItem || !pullHouse || !pullQty) {
      setPullError("اختر العنصر والبيت والكمية");
      return;
    }
    setPulling(true);
    try {
      const res = await fetch("/api/warehouse/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_item_id: pullItem,
          house_id: pullHouse,
          quantity: Number(pullQty),
          matched_request_id: pullRequest || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPullError(data.error ?? "حدث خطأ");
        return;
      }
      setPullItem("");
      setPullHouse("");
      setPullRequest("");
      setPullQty("");
      load();
    } finally {
      setPulling(false);
    }
  }

  const requestsForHouse = pending.filter((r) => r.house_id === pullHouse);

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="font-bold mb-3">إضافة للمخزون</h2>
        <form onSubmit={addItem} className="grid grid-cols-2 gap-3">
          <input
            className="input col-span-2"
            placeholder="اسم العنصر"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="الكمية"
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
          <input className="input" placeholder="الوحدة (كيلو، علبة..)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <input
            className="input col-span-2"
            placeholder="تكلفة الوحدة (اختياري)"
            type="number"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          {addError && <p className="text-red-600 text-sm col-span-2">{addError}</p>}
          <button className="btn-primary col-span-2" disabled={adding}>
            {adding ? "جارٍ الإضافة..." : "إضافة"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-bold mb-3">سحب لأحد البيوت</h2>
        <form onSubmit={pull} className="grid grid-cols-2 gap-3">
          <select className="input col-span-2" value={pullItem} onChange={(e) => setPullItem(e.target.value)} required>
            <option value="">اختر العنصر من المخزن</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} (متوفر: {it.quantity} {it.unit ?? ""})
              </option>
            ))}
          </select>
          <select
            className="input"
            value={pullHouse}
            onChange={(e) => {
              setPullHouse(e.target.value);
              setPullRequest("");
            }}
            required
          >
            <option value="">اختر البيت</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="الكمية"
            type="number"
            step="any"
            value={pullQty}
            onChange={(e) => setPullQty(e.target.value)}
            required
          />
          {pullHouse && requestsForHouse.length > 0 && (
            <select className="input col-span-2" value={pullRequest} onChange={(e) => setPullRequest(e.target.value)}>
              <option value="">(اختياري) اربطه بطلب معلّق</option>
              {requestsForHouse.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.item_name} {r.quantity_text ? `— ${r.quantity_text}` : ""}
                </option>
              ))}
            </select>
          )}
          {pullError && <p className="text-red-600 text-sm col-span-2">{pullError}</p>}
          <button className="btn-primary col-span-2" disabled={pulling}>
            {pulling ? "جارٍ السحب..." : "سحب وتسليم"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-bold mb-3">المخزون الحالي</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400 text-sm">المخزن فارغ حاليًا.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-right">
                  <th className="pb-2">العنصر</th>
                  <th className="pb-2">الكمية</th>
                  <th className="pb-2">تكلفة الوحدة</th>
                  <th className="pb-2">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-gray-100">
                    <td className="py-2">{it.name}</td>
                    <td className="py-2">
                      {it.quantity} {it.unit ?? ""}
                    </td>
                    <td className="py-2">{it.unit_cost ?? "—"}</td>
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
    </div>
  );
}
