"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest } from "@/lib/types";

export default function PendingRequestsTab() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, housesRes] = await Promise.all([
        fetch("/api/requests?status=pending").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
      ]);
      setRequests(reqRes.requests ?? []);
      setHouses(housesRes.houses ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(id: string) {
    if (!confirm("إلغاء هذا الطلب؟")) return;
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    load();
  }

  if (loading) return <p className="text-gray-400 text-sm">جارٍ التحميل...</p>;

  return (
    <div className="flex flex-col gap-4">
      {houses.map((h) => {
        const list = requests.filter((r) => r.house_id === h.id);
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
        );
      })}
      {requests.length === 0 && <p className="text-gray-400 text-sm text-center">لا يوجد أي طلبات معلّقة حاليًا 🎉</p>}
    </div>
  );
}
