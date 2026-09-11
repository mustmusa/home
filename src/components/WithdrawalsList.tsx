"use client";

import { useCallback, useEffect, useState } from "react";
import type { House } from "@/lib/types";

type Withdrawal = {
  id: string;
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  category: string | null;
  created_at: string;
  house_id: string | null;
  house_name: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
}

export default function WithdrawalsList() {
  const [houses, setHouses] = useState<House[]>([]);
  const [houseFilter, setHouseFilter] = useState("");
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (houseId: string) => {
    setLoading(true);
    try {
      const qs = houseId ? `?house_id=${houseId}` : "";
      const [wRes, hRes] = await Promise.all([
        fetch(`/api/warehouse/withdrawals${qs}`).then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
      ]);
      setWithdrawals(wRes.withdrawals ?? []);
      setHouses(hRes.houses ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(houseFilter);
  }, [houseFilter, load]);

  const total = withdrawals.reduce((s, w) => s + Number(w.line_total || 0), 0);

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">سجل السحوبات من المخزن</h2>
        <select className="input w-auto" value={houseFilter} onChange={(e) => setHouseFilter(e.target.value)}>
          <option value="">كل البيوت</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : withdrawals.length === 0 ? (
        <p className="text-gray-400 text-sm">لا توجد سحوبات مسجّلة بعد.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            إجمالي القيمة: <span className="font-bold text-gray-800">{total.toFixed(2)}</span>
          </p>
          <ul className="flex flex-col gap-2">
            {withdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <p className="font-medium text-sm">{w.item_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(w.created_at)} · {w.house_name} · {w.quantity ?? "—"} وحدة
                    {w.category ? ` · ${w.category}` : ""}
                  </p>
                </div>
                <span className="font-semibold text-sm">{w.line_total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
