"use client";

import { useEffect, useState, useCallback } from "react";
import StatusBadge from "@/components/StatusBadge";
import type { PurchaseRequest } from "@/lib/types";

export default function WifeDashboard() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<PurchaseRequest[] | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/requests");
      const data = await res.json();
      setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    setLastParsed(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      setLastParsed(data.requests);
      setText("");
      load();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setSending(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("إلغاء هذا الطلب؟")) return;
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    load();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const rest = requests.filter((r) => r.status !== "pending");

  return (
    <div className="px-4 -mt-6 flex flex-col gap-4 max-w-lg mx-auto">
      <section className="card">
        <h2 className="font-bold mb-3">اطلبي أغراض</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            className="input min-h-[100px]"
            placeholder="مثال: محتاجين رز، زيت، وكيلوين دجاج"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="btn-primary" disabled={sending}>
            {sending ? "جارٍ التفسير والإرسال..." : "أرسل الطلب"}
          </button>
        </form>
        {lastParsed && lastParsed.length > 0 && (
          <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="font-semibold text-emerald-800 mb-1">تم استلام {lastParsed.length} عنصر:</p>
            <ul className="list-disc pr-5 text-emerald-700">
              {lastParsed.map((r) => (
                <li key={r.id}>
                  {r.item_name} {r.quantity_text ? `— ${r.quantity_text}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-bold mb-3">بانتظار الشراء ({pending.length})</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : pending.length === 0 ? (
          <p className="text-gray-400 text-sm">لا يوجد طلبات معلّقة حاليًا.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="font-medium">{r.item_name}</p>
                  {r.quantity_text && <p className="text-xs text-gray-500">{r.quantity_text}</p>}
                </div>
                <button onClick={() => cancel(r.id)} className="text-red-500 text-xs">
                  إلغاء
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-3">السجل</h2>
          <ul className="flex flex-col gap-2">
            {rest.map((r) => (
              <li key={r.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="font-medium">{r.item_name}</p>
                  {r.quantity_text && <p className="text-xs text-gray-500">{r.quantity_text}</p>}
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
