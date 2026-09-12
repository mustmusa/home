"use client";

import { useEffect, useState } from "react";

type InvoiceNeedingPrices = {
  purchaseId: string;
  storeName: string;
  date: string;
  items: Array<{
    lineId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

export default function FixPricesTab() {
  const [invoices, setInvoices] = useState<InvoiceNeedingPrices[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingPrices, setEditingPrices] = useState<Record<string, { unitPrice: string; lineTotal: string }>>({});

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases/fix-prices");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      setInvoices(data.invoicesNeedingPrices ?? []);
    } catch (e) {
      setError("تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }

  function updatePrice(lineId: string, field: "unitPrice" | "lineTotal", value: string) {
    setEditingPrices((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
  }

  async function fixPrices() {
    const updates = Object.entries(editingPrices)
      .filter(([, prices]) => prices.unitPrice || prices.lineTotal)
      .map(([lineId, prices]) => ({
        lineId,
        unitPrice: Number(prices.unitPrice) || 0,
        lineTotal: Number(prices.lineTotal) || 0,
      }));

    if (updates.length === 0) {
      setError("لم تقم بتعديل أي أسعار");
      return;
    }

    setFixing(true);
    setError(null);
    try {
      const res = await fetch("/api/purchases/fix-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      setSuccess(`تم تحديث ${data.updated} عنصر بنجاح ✅`);
      setEditingPrices({});
      loadInvoices();
    } catch (e) {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setFixing(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-center text-gray-400">جارٍ التحميل...</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="font-bold mb-3">🔧 إصلاح الأسعار الناقصة</h2>

      {invoices.length === 0 ? (
        <p className="text-center text-gray-400">لا توجد فواتير بأسعار ناقصة 🎉</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">
            عدد الفواتير التي تحتاج إصلاح: <span className="font-bold">{invoices.length}</span>
          </p>

          <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
            {invoices.map((invoice) => (
              <div key={invoice.purchaseId} className="border border-yellow-200 bg-yellow-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">{invoice.storeName}</p>
                    <p className="text-xs text-gray-500">📅 {invoice.date}</p>
                  </div>
                  <span className="text-xs bg-yellow-200 text-yellow-700 px-2 py-1 rounded">
                    {invoice.items.length} عناصر
                  </span>
                </div>

                <div className="space-y-2">
                  {invoice.items.map((item) => {
                    const prices = editingPrices[item.lineId] || { unitPrice: "", lineTotal: "" };
                    return (
                      <div key={item.lineId} className="bg-white border border-yellow-100 rounded p-2 text-sm">
                        <p className="font-medium mb-2">{item.itemName}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-600">الكمية</label>
                            <input
                              type="number"
                              className="input mt-1"
                              value={item.quantity}
                              disabled
                              step="any"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">السعر/وحدة</label>
                            <input
                              type="number"
                              className="input mt-1"
                              placeholder="0"
                              value={prices.unitPrice}
                              onChange={(e) => updatePrice(item.lineId, "unitPrice", e.target.value)}
                              step="any"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">الإجمالي</label>
                            <input
                              type="number"
                              className="input mt-1"
                              placeholder="0"
                              value={prices.lineTotal}
                              onChange={(e) => updatePrice(item.lineId, "lineTotal", e.target.value)}
                              step="any"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {success && <p className="text-green-600 text-sm mb-3">{success}</p>}

          <button
            className="btn-primary w-full"
            onClick={fixPrices}
            disabled={fixing || Object.keys(editingPrices).length === 0}
          >
            {fixing ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </button>
        </>
      )}
    </section>
  );
}
