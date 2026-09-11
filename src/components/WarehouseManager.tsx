"use client";

import { useEffect, useState, useCallback } from "react";
import { CATEGORIES, type House, type PurchaseRequest, type WarehouseItem } from "@/lib/types";
import WithdrawalsList from "./WithdrawalsList";

export default function WarehouseManager() {
  const [tab, setTab] = useState<"items" | "withdrawals">("items");
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [pending, setPending] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [pullItem, setPullItem] = useState("");
  const [pullHouse, setPullHouse] = useState("");
  const [pullRequest, setPullRequest] = useState("");
  const [pullQty, setPullQty] = useState("");
  const [pullError, setPullError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
          category: category || null,
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
      setCategory("");
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

  function startEdit(it: WarehouseItem) {
    setEditingId(it.id);
    setEditName(it.name);
    setEditQty(String(it.quantity));
    setEditUnit(it.unit ?? "");
    setEditCost(it.unit_cost != null ? String(it.unit_cost) : "");
    setEditCategory(it.category ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/warehouse/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          quantity: Number(editQty || 0),
          unit: editUnit || null,
          unit_cost: editCost ? Number(editCost) : null,
          category: editCategory || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "حدث خطأ");
        return;
      }
      setEditingId(null);
      load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("حذف هذا العنصر نهائيًا من المخزن؟")) return;
    const res = await fetch(`/api/warehouse/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "تعذّر الحذف (قد يكون مسموح للأدمن فقط)");
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="card !p-2 flex gap-1">
        <button
          onClick={() => setTab("items")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
            tab === "items" ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          عناصر المخزن
        </button>
        <button
          onClick={() => setTab("withdrawals")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
            tab === "withdrawals" ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          المسحوبات
        </button>
      </nav>

      {tab === "withdrawals" && <WithdrawalsList />}

      {tab === "items" && (
        <>
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
            className="input"
            placeholder="تكلفة الوحدة (اختياري)"
            type="number"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <select className="input col-span-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">التصنيف (اختياري)</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
            {items.filter((it) => it.quantity > 0).map((it) => (
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
        ) : items.filter((it) => it.quantity > 0).length === 0 ? (
          <p className="text-gray-400 text-sm">المخزن فارغ حاليًا.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.filter((it) => it.quantity > 0).map((it) =>
              editingId === it.id ? (
                <div key={it.id} className="border border-primary/30 bg-blue-50 rounded-lg p-3 flex flex-col gap-2">
                  <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم" />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="input"
                      type="number"
                      step="any"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      placeholder="الكمية"
                    />
                    <input className="input" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} placeholder="الوحدة" />
                    <input
                      className="input"
                      type="number"
                      step="any"
                      value={editCost}
                      onChange={(e) => setEditCost(e.target.value)}
                      placeholder="تكلفة الوحدة"
                    />
                  </div>
                  <select className="input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    <option value="">بدون تصنيف</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {editError && <p className="text-red-600 text-sm">{editError}</p>}
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={() => saveEdit(it.id)} disabled={savingEdit}>
                      {savingEdit ? "جارٍ الحفظ..." : "حفظ"}
                    </button>
                    <button className="btn-secondary flex-1" onClick={cancelEdit} type="button">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div key={it.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{it.name}</p>
                    <p className="text-xs text-gray-400">
                      {it.quantity} {it.unit ?? ""} · {it.category ?? "بدون تصنيف"} ·{" "}
                      {it.unit_cost != null
                        ? `${it.unit_cost} / وحدة — القيمة ${(Number(it.quantity) * Number(it.unit_cost)).toFixed(2)}`
                        : "بدون تكلفة"}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(it)} className="text-primary text-xs font-semibold">
                      تعديل
                    </button>
                    <button onClick={() => deleteItem(it.id)} className="text-red-500 text-xs font-semibold">
                      حذف
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
