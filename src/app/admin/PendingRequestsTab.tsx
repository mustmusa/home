"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest } from "@/lib/types";

type InvoiceLine = {
  id: string;
  item_name: string;
  quantity: number | null;
  line_total: number;
};

type Invoice = {
  id: string;
  store_name: string;
  created_at: string;
  total: number;
  lines: InvoiceLine[];
};

export default function PendingRequestsTab() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pickedInvoice, setPickedInvoice] = useState<string | null>(null);
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

      // الربط يبدأ من الفاتورة لا من قائمة كل ما اشتُري: الفواتير أولاً
      // بتاريخها ومتجرها، ثم عناصر الفاتورة المختارة.
      setInvoices(
        (purchasesRes.purchases ?? []).map((p: any) => ({
          id: p.id,
          store_name: p.store_name || "متجر",
          created_at: p.created_at,
          total: Number(p.total_amount ?? 0),
          lines: (p.purchase_lines ?? []).map((l: any) => ({
            id: l.id,
            item_name: l.item_name,
            quantity: l.quantity,
            line_total: Number(l.line_total ?? 0),
          })),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function linkToPurchase(requestId: string, lineId: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "purchased", lineId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الربط");
      setLinkingRequestId(null);
      setPickedInvoice(null);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل التعديل");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الإلغاء");
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
                        {(() => {
                          const invoice = invoices.find((i) => i.id === pickedInvoice);
                          if (!invoice) {
                            return (
                              <>
                                <p className="text-sm font-semibold mb-2">اختر الفاتورة:</p>
                                <div className="space-y-1 max-h-60 overflow-y-auto">
                                  {invoices.length === 0 ? (
                                    <p className="text-gray-500 text-xs p-2">لا توجد فواتير</p>
                                  ) : (
                                    invoices.map((inv) => (
                                      <button
                                        key={inv.id}
                                        onClick={() => setPickedInvoice(inv.id)}
                                        className="w-full text-right text-xs p-2 rounded border border-blue-200 hover:bg-blue-50"
                                      >
                                        <div className="flex justify-between gap-2">
                                          <span className="font-semibold">🧾 {inv.store_name}</span>
                                          <span className="text-green-700 whitespace-nowrap">
                                            {inv.total.toFixed(2)} ر.س
                                          </span>
                                        </div>
                                        <div className="text-gray-500">
                                          {new Date(inv.created_at).toLocaleDateString("ar-SA")} •{" "}
                                          {inv.lines.length} عنصر
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </>
                            );
                          }
                          return (
                            <>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-sm font-semibold">
                                  🧾 {invoice.store_name} —{" "}
                                  {new Date(invoice.created_at).toLocaleDateString("ar-SA")}
                                </p>
                                <button
                                  onClick={() => setPickedInvoice(null)}
                                  className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1"
                                >
                                  ↩ الفواتير
                                </button>
                              </div>
                              <div className="space-y-1 max-h-60 overflow-y-auto">
                                {invoice.lines.length === 0 ? (
                                  <p className="text-gray-500 text-xs p-2">لا عناصر في هذه الفاتورة</p>
                                ) : (
                                  invoice.lines.map((line) => (
                                    <button
                                      key={line.id}
                                      onClick={() => linkToPurchase(r.id, line.id)}
                                      disabled={updating}
                                      className="w-full text-right text-xs p-2 rounded border border-blue-200 hover:bg-blue-50"
                                    >
                                      <div className="font-semibold">{line.item_name}</div>
                                      <div className="text-gray-600">
                                        {line.quantity ? `الكمية: ${line.quantity} • ` : ""}
                                        {line.line_total.toFixed(2)} ريال
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </>
                          );
                        })()}
                        <button
                          onClick={() => {
                            setLinkingRequestId(null);
                            setPickedInvoice(null);
                          }}
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
                            onClick={() => {
                              setLinkingRequestId(r.id);
                              setPickedInvoice(null);
                            }}
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
