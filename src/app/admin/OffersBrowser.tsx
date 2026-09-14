"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";

type Row = {
  id: string;
  mall: string;
  item_name: string;
  description: string | null;
  original_price: number | null;
  offer_price: number;
  discount_pct: number | null;
  category: string | null;
};

const BANDS = [
  { label: "كل الخصومات", min: "", max: "" },
  { label: "10٪ – 20٪", min: "10", max: "20" },
  { label: "20٪ – 30٪", min: "20", max: "30" },
  { label: "30٪ – 40٪", min: "30", max: "40" },
  { label: "40٪ – 50٪", min: "40", max: "50" },
  { label: "50٪ فأكثر", min: "50", max: "" },
];

const MALLS = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];

export default function OffersBrowser({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [band, setBand] = useState(0);
  const [mall, setMall] = useState("");
  const [labelling, setLabelling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [category, band, mall]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (category) p.set("category", category);
      if (mall) p.set("mall", mall);
      if (BANDS[band].min) p.set("minDiscount", BANDS[band].min);
      if (BANDS[band].max) p.set("maxDiscount", BANDS[band].max);

      const res = await fetch(`/api/offers/browse?${p}`);
      const data = await res.json();
      setRows(data.offers ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  async function categorizeAll() {
    setLabelling(true);
    setNote(null);
    let labelled = 0;
    try {
      for (;;) {
        const res = await fetch("/api/offers/categorize", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل التصنيف");
        labelled += data.updated ?? 0;
        setNote(`صُنّف ${labelled} عرض...`);
        if (data.done || !data.updated) break;
      }
      setNote(`اكتمل التصنيف: ${labelled} عرض.`);
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setLabelling(false);
    }
  }

  const uncategorised = rows.filter((r) => !r.category).length;

  return (
    <section className="card">
      <h2 className="font-bold mb-3">🔎 تصفّح العروض</h2>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input text-xs"
        >
          <option value="">كل التصنيفات</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={band}
          onChange={(e) => setBand(Number(e.target.value))}
          className="input text-xs"
        >
          {BANDS.map((b, i) => (
            <option key={b.label} value={i}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <select
        value={mall}
        onChange={(e) => setMall(e.target.value)}
        className="input text-xs w-full mb-3"
      >
        <option value="">كل المولات</option>
        {MALLS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {isAdmin && uncategorised > 0 && (
        <button
          onClick={categorizeAll}
          disabled={labelling}
          className="w-full mb-3 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
        >
          {labelling ? "جارٍ التصنيف..." : "🏷️ صنّف العروض غير المصنّفة (بالأسماء فقط، بلا قراءة صور)"}
        </button>
      )}
      {note && <p className="text-xs text-gray-600 mb-2">{note}</p>}

      <p className="text-xs text-gray-500 mb-2">
        {loading ? "جارٍ التحميل..." : `${total} عرض مطابق${rows.length < total ? ` — يُعرض أعلى ${rows.length} خصماً` : ""}`}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="text-right py-2 font-medium">المنتج</th>
              <th className="text-right py-2 font-medium">المول</th>
              <th className="text-left py-2 font-medium">قبل</th>
              <th className="text-left py-2 font-medium">بعد</th>
              <th className="text-left py-2 font-medium">الخصم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-2 pl-2">
                  <p className="font-medium">{r.item_name}</p>
                  {r.description && <p className="text-gray-500">{r.description}</p>}
                </td>
                <td className="py-2 text-gray-600 whitespace-nowrap">{r.mall}</td>
                <td className="py-2 text-gray-400 line-through text-left whitespace-nowrap">
                  {r.original_price ?? "—"}
                </td>
                <td className="py-2 font-bold text-green-600 text-left whitespace-nowrap">
                  {r.offer_price}
                </td>
                <td className="py-2 text-left">
                  {r.discount_pct != null && (
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {r.discount_pct}٪
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && (
        <p className="text-center text-gray-400 py-6">لا توجد عروض بهذه المواصفات</p>
      )}
    </section>
  );
}
