"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest } from "@/lib/types";

export default function RequestHistoryTab() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, housesRes] = await Promise.all([
        fetch("/api/requests").then((r) => r.json()),
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "معلّق",
      purchased: "تم شراؤه",
      cancelled: "ملغى",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-50 border-yellow-200 text-yellow-700",
      purchased: "bg-green-50 border-green-200 text-green-700",
      cancelled: "bg-red-50 border-red-200 text-red-700",
    };
    return colors[status] || "bg-gray-50 border-gray-200 text-gray-700";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) return <p className="text-gray-400 text-sm">جارٍ التحميل...</p>;

  return (
    <div className="flex flex-col gap-4">
      {houses.map((h) => {
        const houseRequests = requests.filter((r) => r.house_id === h.id);
        if (houseRequests.length === 0) return null;

        const grouped = {
          pending: houseRequests.filter((r) => r.status === "pending"),
          purchased: houseRequests.filter((r) => r.status === "purchased"),
          cancelled: houseRequests.filter((r) => r.status === "cancelled"),
        };

        return (
          <section key={h.id} className="card">
            <h2 className="font-bold mb-4">{h.name}</h2>

            {/* Purchased requests */}
            {grouped.purchased.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-green-700 mb-2">✓ تم شراؤه ({grouped.purchased.length})</h3>
                <ul className="flex flex-col gap-2 mb-3">
                  {grouped.purchased.map((r) => (
                    <li key={r.id} className="border border-green-200 bg-green-50 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{r.item_name}</p>
                          {r.quantity_text && <p className="text-xs text-green-600 mt-1">الكمية: {r.quantity_text}</p>}
                          <p className="text-xs text-green-600 mt-1">{formatDate(r.requested_at)}</p>
                        </div>
                        <span className="text-xs font-semibold text-green-700 bg-white px-2 py-1 rounded ml-2">
                          تم
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pending requests */}
            {grouped.pending.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-yellow-700 mb-2">⏳ معلّق ({grouped.pending.length})</h3>
                <ul className="flex flex-col gap-2 mb-3">
                  {grouped.pending.map((r) => (
                    <li key={r.id} className="border border-yellow-200 bg-yellow-50 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{r.item_name}</p>
                          {r.quantity_text && <p className="text-xs text-yellow-600 mt-1">الكمية: {r.quantity_text}</p>}
                          <p className="text-xs text-yellow-600 mt-1">{formatDate(r.requested_at)}</p>
                        </div>
                        <span className="text-xs font-semibold text-yellow-700 bg-white px-2 py-1 rounded ml-2">
                          بانتظار
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cancelled requests */}
            {grouped.cancelled.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-700 mb-2">✗ ملغى ({grouped.cancelled.length})</h3>
                <ul className="flex flex-col gap-2">
                  {grouped.cancelled.map((r) => (
                    <li key={r.id} className="border border-red-200 bg-red-50 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm line-through">{r.item_name}</p>
                          {r.quantity_text && <p className="text-xs text-red-600 mt-1">الكمية: {r.quantity_text}</p>}
                          <p className="text-xs text-red-600 mt-1">{formatDate(r.requested_at)}</p>
                        </div>
                        <span className="text-xs font-semibold text-red-700 bg-white px-2 py-1 rounded ml-2">
                          ملغى
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {requests.length === 0 && <p className="text-gray-400 text-sm text-center">لا يوجد أي طلبات حتى الآن</p>}
    </div>
  );
}
