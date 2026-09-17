"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";

type Suggestion = { id: string; store_name: string; total_amount: number; purchased_at: string };

type Txn = {
  id: string;
  txn_date: string;
  merchant: string;
  amount: number;
  foreign_amount: number | null;
  foreign_currency: string | null;
  status: "pending" | "posted";
  category: string | null;
  note: string | null;
  purchase_id: string | null;
  suggestions: Suggestion[];
};

type Summary = {
  count: number;
  totalSpend: number;
  unlinkedCount: number;
  unlinkedTotal: number;
  byCategory: Record<string, number>;
};

const EXTRA_CATEGORIES = ["مواصلات", "وقود", "مطاعم", "اشتراكات", "فواتير", "صحة", "تسوق عام"];
const ALL_CATEGORIES = [...CATEGORIES.filter((c) => c !== "أخرى"), ...EXTRA_CATEGORIES, "أخرى"];

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function CardStatementTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/card?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر التحميل");
      setTxns(data.transactions ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/card/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاستيراد");
      setMsg(
        `قرأ ${data.read} عملية — أضاف ${data.added}، و${data.alreadyKnown} كانت موجودة` +
          (data.staleRemoved ? `، وأزال ${data.staleRemoved} تفويضاً معلّقاً انتهى` : "")
      );
      e.target.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setUploading(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setTxns((list) =>
      list.map((t) =>
        t.id === id
          ? {
              ...t,
              category: (body.category as string) ?? t.category,
              note: body.note !== undefined ? (body.note as string) : t.note,
              purchase_id:
                body.purchaseId !== undefined ? (body.purchaseId as string) : t.purchase_id,
            }
          : t
      )
    );
    const res = await fetch("/api/card", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "فشل الحفظ");
      load();
    } else if (body.purchaseId) {
      load();
    }
  }

  const visible = onlyUnlinked ? txns.filter((t) => !t.purchase_id && t.amount < 0) : txns;

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="font-bold mb-1">💳 كشف البطاقة</h2>
        <p className="text-xs text-gray-500 mb-3">
          ارفع الكشف كلما تحدّث. تُقرأ العمليات وتُربط بالفواتير، وما لا فاتورة له تصنّفه بنفسك.
        </p>

        <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-primary rounded-lg cursor-pointer hover:bg-blue-50 mb-2">
          <span className="text-sm font-medium text-primary">
            {uploading ? "جارٍ قراءة الكشف..." : "📄 ارفع كشف الحساب (PDF)"}
          </span>
          <input type="file" accept="application/pdf" onChange={upload} disabled={uploading} className="hidden" />
        </label>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input w-full text-sm"
        />

        {msg && <p className="text-green-700 text-xs mt-2">{msg}</p>}
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
      </section>

      {summary && summary.count > 0 && (
        <section className="card">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-xs text-gray-600">مصروف الشهر</p>
              <p className="text-xl font-bold text-orange-600">{summary.totalSpend.toFixed(2)}</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-600">العمليات</p>
              <p className="text-xl font-bold text-blue-600">{summary.count}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-gray-600">بلا تفاصيل</p>
              <p className="text-xl font-bold text-red-600">{summary.unlinkedCount}</p>
            </div>
          </div>

          {Object.keys(summary.byCategory).length > 0 && (
            <div className="space-y-1">
              {Object.entries(summary.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate">{cat}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={cat === "غير مصنّف" ? "h-full bg-gray-400" : "h-full bg-primary"}
                        style={{ width: `${(amount / summary.totalSpend) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-left font-semibold">{amount.toFixed(2)}</span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">العمليات</h2>
          <button
            onClick={() => setOnlyUnlinked(!onlyUnlinked)}
            className={`text-xs px-3 py-1.5 rounded border ${
              onlyUnlinked ? "bg-primary text-white border-primary" : "border-gray-300 text-gray-600"
            }`}
          >
            {onlyUnlinked ? "عرض الكل" : "بلا تفاصيل فقط"}
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">
            لا عمليات لهذا الشهر — ارفع الكشف أولاً
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((t) => (
              <div
                key={t.id}
                className={`border rounded-lg p-3 space-y-2 ${
                  t.purchase_id
                    ? "border-green-200 bg-green-50/40"
                    : t.category
                      ? "border-gray-200"
                      : "border-amber-200 bg-amber-50/30"
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{t.merchant}</p>
                    <p className="text-xs text-gray-500">
                      {t.txn_date}
                      {t.status === "pending" && (
                        <span className="mr-1 bg-amber-100 text-amber-700 px-1.5 rounded">معلّقة</span>
                      )}
                      {t.purchase_id && (
                        <span className="mr-1 bg-green-100 text-green-700 px-1.5 rounded">مرتبطة بفاتورة</span>
                      )}
                    </p>
                  </div>
                  <div className="text-left whitespace-nowrap">
                    <p className={`font-bold text-sm ${t.amount < 0 ? "text-gray-800" : "text-green-600"}`}>
                      {Math.abs(t.amount).toFixed(2)} ر.س
                    </p>
                    {t.foreign_amount && (
                      <p className="text-[10px] text-gray-400">
                        {Math.abs(t.foreign_amount)} {t.foreign_currency}
                      </p>
                    )}
                  </div>
                </div>

                {!t.purchase_id && t.suggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-500">فاتورة بنفس المبلغ والتاريخ:</p>
                    {t.suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => patch(t.id, { purchaseId: s.id })}
                        className="w-full text-xs border border-green-300 text-green-800 bg-green-50 rounded p-1.5 text-right"
                      >
                        اربط بـ {s.store_name} — {Number(s.total_amount).toFixed(2)} ر.س
                      </button>
                    ))}
                  </div>
                )}

                {!t.purchase_id && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={t.category ?? ""}
                      onChange={(e) => patch(t.id, { category: e.target.value || null })}
                      className="input text-xs"
                    >
                      <option value="">اختر تصنيفاً</option>
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      defaultValue={t.note ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (t.note ?? "")) patch(t.id, { note: e.target.value });
                      }}
                      placeholder="ملاحظة"
                      className="input text-xs"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
