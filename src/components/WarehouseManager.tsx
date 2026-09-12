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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [minStockLevels, setMinStockLevels] = useState<Record<string, number>>({});

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

  const totalItems = items.filter((it) => it.quantity > 0).length;
  const totalValue = items.reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.unit_cost || 0)), 0);
  const lowStockItems = items.filter((it) => {
    const minLevel = minStockLevels[it.id] ?? 20;
    return it.quantity > 0 && it.quantity < minLevel;
  });
  const outOfStockItems = items.filter((it) => it.quantity === 0 || it.quantity < 0).length;

  useEffect(() => {
    console.log("🔍 WarehouseManager Debug:", {
      itemsCount: items.length,
      totalItems,
      lowStockItems: lowStockItems.length,
      outOfStockItems,
      tab,
      itemsData: items.slice(0, 3).map(it => ({ name: it.name, qty: it.quantity }))
    });
  }, [items, tab]);

  const filteredItems = items.filter((it) => {
    const matchesSearch = it.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !filterCategory || it.category === filterCategory;
    return matchesSearch && matchesCategory && it.quantity > 0;
  });

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
        {/* DEBUG */}
        <div style={{ fontSize: "10px", color: "red", marginBottom: "10px" }}>
          DEBUG: total={items.length}, outOfStock={outOfStockItems}, lowStock={lowStockItems.length}
        </div>

        {/* إحصائيات سريعة */}
        <section className="card">
          <h2 className="font-bold mb-3">📊 ملخص المخزن</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-gray-600">إجمالي العناصر</p>
              <p className="text-2xl font-bold text-blue-600">{totalItems}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-gray-600">القيمة الإجمالية</p>
              <p className="text-lg font-bold text-green-600">{totalValue.toFixed(0)}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs text-gray-600">عناصر منخفضة</p>
              <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-xs text-gray-600">عناصر نفذت</p>
              <p className="text-2xl font-bold text-orange-600">{outOfStockItems}</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-xs text-gray-600">الأصناف</p>
              <p className="text-2xl font-bold text-purple-600">{new Set(items.map(it => it.category)).size}</p>
            </div>
          </div>
        </section>

        {/* البحث والفلترة */}
        <section className="card">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="🔍 ابحثي عن عنصر..."
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="input"
              value={filterCategory || ""}
              onChange={(e) => setFilterCategory(e.target.value || null)}
            >
              <option value="">📂 جميع الأصناف</option>
              {Array.from(new Set(items.map(it => it.category).filter((c): c is string => c !== null))).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </section>

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">المخزون الحالي</h2>
          <span className="text-xs text-gray-500">{filteredItems.length} عنصر</span>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد عناصر متطابقة.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((it) => {
              const minLevel = minStockLevels[it.id] ?? 20;
              const percentage = Math.min(100, (Number(it.quantity) / minLevel) * 100);
              const stockColor = percentage < 25 ? "bg-red-500" : percentage < 50 ? "bg-yellow-500" : "bg-green-500";
              const stockLabel = percentage < 25 ? "🔴 حرج" : percentage < 50 ? "🟡 منخفض" : "🟢 جيد";

              return editingId === it.id ? (
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
                  <input
                    className="input"
                    type="number"
                    placeholder="الحد الأدنى للطلب"
                    value={minStockLevels[it.id] ?? 20}
                    onChange={(e) => setMinStockLevels({...minStockLevels, [it.id]: Number(e.target.value)})}
                  />
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
                <div key={it.id} className={`border rounded-lg p-3 flex flex-col gap-2 ${percentage < 25 ? "border-red-200 bg-red-50" : percentage < 50 ? "border-yellow-200 bg-yellow-50" : "border-gray-100"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{it.name}</p>
                      <p className="text-xs text-gray-500">{it.category ?? "بدون تصنيف"}</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-white">{stockLabel}</span>
                  </div>

                  {/* مؤشر المخزون */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className={`${stockColor} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 w-12 text-right">{percentage.toFixed(0)}%</span>
                  </div>

                  <p className="text-xs text-gray-600">
                    <span className="font-semibold">{it.quantity}</span> {it.unit} / الحد الأدنى: <span className="font-semibold">{minLevel}</span>
                  </p>

                  {it.unit_cost && (
                    <p className="text-xs text-gray-500">
                      {it.unit_cost} ريال/وحدة • القيمة: <span className="font-semibold">{(Number(it.quantity) * Number(it.unit_cost)).toFixed(0)} ريال</span>
                    </p>
                  )}

                  <div className="flex gap-2 shrink-0 justify-end">
                    <button onClick={() => startEdit(it)} className="text-primary text-xs font-semibold px-2 py-1 rounded border border-primary/30 hover:bg-blue-50">
                      ✏️ تعديل
                    </button>
                    <button onClick={() => deleteItem(it.id)} className="text-red-500 text-xs font-semibold px-2 py-1 rounded border border-red-200 hover:bg-red-50">
                      🗑️ حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
