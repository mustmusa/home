"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";

type Purchase = {
  id: string;
  store_name: string;
  total_amount: number;
  purchased_at: string;
  purchase_lines?: { item_name: string }[];
};

/** "متجر" identifies nothing, so the invoice's own items name it instead. */
function itemsHint(pu: Purchase) {
  const items = (pu.purchase_lines ?? []).map((l) => l.item_name).filter(Boolean);
  if (items.length === 0) return "";
  return `${items.slice(0, 3).join("، ")}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
}

function purchaseLabel(pu: Purchase) {
  return `${pu.store_name} — ${Number(pu.total_amount).toFixed(2)} ر.س — ${pu.purchased_at.slice(0, 10)}`;
}

/**
 * A native <select> was unusable here: option text carries the store, the
 * amount, the date and a few item names, and the browser draws that popup as
 * wide as the longest line — off the side of the screen, unreadable. This
 * opens in place instead, one invoice per row over two lines, with a filter
 * because the list is every invoice on file.
 */
function InvoicePicker({
  value,
  purchases,
  onChange,
}: {
  value: string | null;
  purchases: Purchase[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = purchases.find((pu) => pu.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const shown = q
    ? purchases.filter((pu) =>
        `${pu.store_name} ${itemsHint(pu)} ${pu.total_amount} ${pu.purchased_at.slice(0, 10)}`
          .toLowerCase()
          .includes(q)
      )
    : purchases;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input text-xs w-full flex items-center justify-between gap-2 text-right"
      >
        <span className="truncate">
          {selected ? `🧾 ${purchaseLabel(selected)}` : "🧾 بلا فاتورة — اضغط للاختيار"}
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم المتجر أو المبلغ أو التاريخ"
            className="input text-xs w-full rounded-none border-0 border-b border-gray-200"
          />
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full text-right text-xs p-2 hover:bg-gray-50 border-b border-gray-100"
            >
              🧾 بلا فاتورة
            </button>
            {shown.length === 0 && (
              <p className="text-[11px] text-gray-400 p-3 text-center">لا فاتورة مطابقة</p>
            )}
            {shown.map((pu) => (
              <button
                type="button"
                key={pu.id}
                onClick={() => {
                  onChange(pu.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-right p-2 hover:bg-gray-50 border-b border-gray-100 ${
                  pu.id === value ? "bg-blue-50" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">🧾 {pu.store_name}</span>
                  <span className="text-xs text-green-700 whitespace-nowrap">
                    {Number(pu.total_amount).toFixed(2)} ر.س
                  </span>
                </span>
                <span className="block text-[10px] text-gray-500 truncate">
                  {pu.purchased_at.slice(0, 10)}
                  {itemsHint(pu) && ` • ${itemsHint(pu)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type House = { id: string; name: string };

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
  target_kind: "house" | "personal" | "warehouse" | "other" | null;
  target_house_id: string | null;
  target_label: string | null;
  excluded: boolean;
  suggestions: Purchase[];
};

type Summary = {
  count: number;
  totalSpend: number;
  unlinkedCount: number;
  unlinkedTotal: number;
  excludedCount: number;
  excludedTotal: number;
  byCategory: Record<string, number>;
  byTarget: Record<string, number>;
};

const EXTRA_CATEGORIES = ["مواصلات", "وقود", "مطاعم", "اشتراكات", "فواتير", "صحة", "تسوق عام"];
const BUILT_IN = [...CATEGORIES.filter((c) => c !== "أخرى"), ...EXTRA_CATEGORIES, "أخرى"];
const NEW_CATEGORY = "__new__";
const NEW_TARGET = "__new_target__";

type Draft = {
  purchase_id: string | null;
  category: string | null;
  target_kind: Txn["target_kind"];
  target_house_id: string | null;
  target_label: string | null;
  note: string | null;
  excluded: boolean;
};

/** مكتملة = مستبعدة من الحساب، أو مرتبطة بفاتورة، أو لها تصنيف وجهة صرف معاً */
function isSettled(t: Txn) {
  return (
    Boolean(t.excluded) || Boolean(t.purchase_id) || Boolean(t.category && t.target_kind)
  );
}

function Bars({
  title,
  data,
  total,
  tint,
}: {
  title: string;
  data: Record<string, number>;
  total: number;
  tint: string;
}) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{title}</p>
      <div className="space-y-1">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate">{label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
              <div
                className={`h-full ${label.startsWith("غير") || label.startsWith("بلا") ? "bg-gray-400" : tint}`}
                style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-20 text-left font-semibold tabular-nums">{amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * Defined at module scope on purpose. Nested inside the page component these
 * are a new function on every render, so React remounts them each keystroke
 * and the note field loses focus after one character.
 */
function TxnHead({ t }: { t: Txn }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {t.excluded && <span className="text-gray-400">🚫 </span>}
          {t.merchant}
        </p>
        <p className="text-xs text-gray-500">
          {t.txn_date}
          {t.status === "pending" && (
            <span
              className="mr-1 bg-amber-100 text-amber-700 px-1.5 rounded"
              title="البنك لم يقيّد العملية بعد"
            >
              لم يقيّدها البنك بعد
            </span>
          )}
        </p>
      </div>
      <div className="text-left whitespace-nowrap">
        <p
          className={`font-bold text-sm tabular-nums ${
            t.excluded ? "text-gray-400 line-through" : ""
          }`}
        >
          {Math.abs(t.amount).toFixed(2)} ر.س
        </p>
        {t.foreign_amount && (
          <p className="text-[10px] text-gray-400">
            {Math.abs(t.foreign_amount)} {t.foreign_currency}
          </p>
        )}
      </div>
    </div>
  );
}

function TxnEditor({
  t,
  draft,
  dirty,
  saving,
  houses,
  purchases,
  categoryOptions,
  usedTargets,
  onEdit,
  onSave,
  onReset,
}: {
  t: Txn;
  draft: Draft;
  dirty: boolean;
  saving: boolean;
  houses: House[];
  purchases: Purchase[];
  categoryOptions: string[];
  usedTargets: string[];
  onEdit: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const targetValue =
    draft.target_kind === "house"
      ? `house:${draft.target_house_id ?? ""}`
      : draft.target_kind === "other"
        ? `other:${draft.target_label ?? ""}`
        : (draft.target_kind ?? "");

  function pickTarget(v: string) {
    if (v === NEW_TARGET) {
      const label = prompt("اسم بند المصاريف الجديد:")?.trim();
      if (label) onEdit({ target_kind: "other", target_label: label, target_house_id: null });
      return;
    }
    if (v.startsWith("house:"))
      onEdit({ target_kind: "house", target_house_id: v.slice(6), target_label: null });
    else if (v.startsWith("other:"))
      onEdit({ target_kind: "other", target_label: v.slice(6), target_house_id: null });
    else
      onEdit({
        target_kind: (v || null) as Txn["target_kind"],
        target_house_id: null,
        target_label: null,
      });
  }

  const targetLabels = [
    ...new Set([
      ...usedTargets,
      ...(draft.target_kind === "other" && draft.target_label ? [draft.target_label] : []),
    ]),
  ];

  return (
    <div className="space-y-2">
      {t.suggestions.length > 0 && !draft.purchase_id && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500">فاتورة بنفس المبلغ والتاريخ:</p>
          {t.suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onEdit({ purchase_id: s.id })}
              className="w-full text-xs border border-green-300 text-green-800 bg-green-50 rounded p-1.5 text-right"
            >
              اختر {s.store_name} — {Number(s.total_amount).toFixed(2)} ر.س
            </button>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
        <input
          type="checkbox"
          checked={Boolean(draft.excluded)}
          onChange={(e) => onEdit({ excluded: e.target.checked })}
        />
        🚫 لا تُحتسب في مصاريف الشهر (سداد، حوالة، مبلغ مسترجع…)
      </label>

      <InvoicePicker
        value={draft.purchase_id ?? null}
        purchases={purchases}
        onChange={(id) => onEdit({ purchase_id: id })}
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.category ?? ""}
          onChange={(e) => {
            if (e.target.value === NEW_CATEGORY) {
              const name = prompt("اسم التصنيف الجديد:")?.trim();
              if (name) onEdit({ category: name });
              return;
            }
            onEdit({ category: e.target.value || null });
          }}
          className="input text-xs"
        >
          <option value="">اختر تصنيفاً</option>
          {[...new Set([...categoryOptions, ...(draft.category ? [draft.category] : [])])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_CATEGORY}>➕ تصنيف جديد…</option>
        </select>

        <select value={targetValue} onChange={(e) => pickTarget(e.target.value)} className="input text-xs">
          <option value="">جهة الصرف؟</option>
          {houses.map((h) => (
            <option key={h.id} value={`house:${h.id}`}>
              🏠 {h.name}
            </option>
          ))}
          <option value="personal">👤 مصاريف شخصية</option>
          <option value="warehouse">📦 المخزن</option>
          {targetLabels.map((lbl) => (
            <option key={lbl} value={`other:${lbl}`}>
              {lbl}
            </option>
          ))}
          <option value={NEW_TARGET}>➕ بند جديد…</option>
        </select>
      </div>

      <input
        value={draft.note ?? ""}
        onChange={(e) => onEdit({ note: e.target.value || null })}
        placeholder="ملاحظة"
        className="input text-xs w-full"
      />

      <div className="flex gap-2">
        {dirty && (
          <button onClick={onReset} className="text-xs bg-gray-100 border border-gray-300 rounded px-3 py-1.5">
            تراجع
          </button>
        )}
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="flex-1 text-xs btn-primary disabled:opacity-40"
        >
          {saving ? "جارٍ الحفظ..." : dirty ? "💾 حفظ" : "لا تغييرات"}
        </button>
      </div>
    </div>
  );
}

export default function CardStatementTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [usedTargets, setUsedTargets] = useState<string[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({});
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/card?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر التحميل");
      setTxns(data.transactions ?? []);
      setSummary(data.summary ?? null);
      setHouses(data.houses ?? []);
      setPurchases(data.purchases ?? []);
      setUsedCategories(data.usedCategories ?? []);
      setUsedTargets(data.usedTargets ?? []);
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
        `✅ كشف بطاقة ائتمانية${data.cardLast4 ? ` (••${data.cardLast4})` : ""} — ` +
          `قرأ ${data.read} عملية، أضاف ${data.added}، و${data.alreadyKnown} كانت موجودة` +
          (data.staleRemoved ? `، وأزال ${data.staleRemoved} تفويضاً انتهى` : "") +
          (data.unreadable ? `\n⚠️ تعذّرت قراءة ${data.unreadable} عملية` : "") +
          (data.truncated ? "\n⚠️ الكشف طويل وانقطعت قراءته قبل آخره — أعد الرفع لإكمال الباقي" : "")
      );
      e.target.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setUploading(false);
    }
  }

  // Edits are held locally so a run of 66 charges is not 66 round trips, and
  // nothing is written until the user asks for it.
  function stored(t: Txn): Draft {
    return {
      purchase_id: t.purchase_id,
      category: t.category,
      target_kind: t.target_kind,
      target_house_id: t.target_house_id,
      target_label: t.target_label,
      note: t.note,
      excluded: Boolean(t.excluded),
    };
  }

  function draftOf(t: Txn): Draft {
    return { ...stored(t), ...(drafts[t.id] ?? {}) };
  }

  function isDirty(t: Txn) {
    const base = stored(t);
    const d = draftOf(t);
    return (Object.keys(base) as (keyof Draft)[]).some((k) => d[k] !== base[k]);
  }

  function edit(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }

  async function save(t: Txn) {
    const d = draftOf(t);
    setSaving(t.id);
    try {
      const res = await fetch("/api/card", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: t.id,
          purchaseId: d.purchase_id,
          category: d.category,
          targetKind: d.target_kind,
          targetHouseId: d.target_house_id,
          targetLabel: d.target_label,
          note: d.note,
          excluded: d.excluded,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل الحفظ");
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next;
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setSaving(null);
    }
  }

  async function saveAll(list: Txn[]) {
    const dirty = list.filter(isDirty);
    if (dirty.length === 0) return;
    setSaving("all");
    try {
      for (const t of dirty) {
        const d = draftOf(t);
        await fetch("/api/card", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: t.id,
            purchaseId: d.purchase_id,
            category: d.category,
            targetKind: d.target_kind,
            targetHouseId: d.target_house_id,
            targetLabel: d.target_label,
            note: d.note,
            excluded: d.excluded,
          }),
        });
      }
      setDrafts({});
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function removeMany(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`حذف ${ids.length} عملية من السجل نهائياً؟`)) return;
    const res = await fetch("/api/card", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "فشل الحذف");
    } else {
      setMsg(`حُذفت ${data.deleted} عملية`);
      setPicked(new Set());
      setPicking(false);
    }
    load();
  }

  async function removeTxn(id: string, merchant: string) {
    if (!confirm(`حذف عملية «${merchant}» من السجل؟`)) return;
    const res = await fetch("/api/card", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "فشل الحذف");
    }
    load();
  }

  // An upload of the wrong statement leaves a batch of rows that belong to
  // nothing; picking them off one at a time is not an option, and they may sit
  // in either section depending on whether they were given details.
  function pickBar(list: Txn[]) {
    const allPicked = list.length > 0 && list.every((t) => picked.has(t.id));
    return (
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => {
            setPicking((v) => !v);
            setPicked(new Set());
          }}
          className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1"
        >
          {picking ? "إلغاء التحديد" : "🧹 تحديد للحذف"}
        </button>
        {picking && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = new Set(picked);
                for (const t of list) {
                  if (allPicked) next.delete(t.id);
                  else next.add(t.id);
                }
                setPicked(next);
              }}
              className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1"
            >
              {allPicked ? "إلغاء الكل" : "تحديد الكل"}
            </button>
            <button
              onClick={() => removeMany(Array.from(picked))}
              disabled={picked.size === 0}
              className="text-xs text-red-600 border border-red-300 rounded px-2 py-1"
            >
              🗑️ حذف المحدد ({picked.size})
            </button>
          </div>
        )}
      </div>
    );
  }

  function pickBox(t: Txn) {
    if (!picking) return null;
    return (
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={picked.has(t.id)}
          onChange={(e) => {
            const next = new Set(picked);
            if (e.target.checked) next.add(t.id);
            else next.delete(t.id);
            setPicked(next);
          }}
        />
        حدّد هذه العملية للحذف
      </label>
    );
  }

  const categoryOptions = [...new Set([...BUILT_IN, ...usedCategories])];
  const pending = txns.filter((t) => !isSettled(t));
  const settled = txns.filter(isSettled);


  function targetText(t: Txn) {
    if (t.target_kind === "house")
      return houses.find((h) => h.id === t.target_house_id)?.name ?? "بيت";
    if (t.target_kind === "personal") return "مصاريف شخصية";
    if (t.target_kind === "warehouse") return "المخزن";
    if (t.target_kind === "other") return t.target_label ?? "أخرى";
    return null;
  }


  return (
    <div className="flex flex-col gap-4">
      {/* ١ — التقرير */}
      <section className="card">
        <h2 className="font-bold mb-1">📊 تقرير الكشف</h2>
        <p className="text-xs text-gray-500 mb-3">
          ارفع الكشف كلما تحدّث خلال الشهر. تصنيفاتك وروابطك تبقى كما هي.
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
          className="input w-full text-sm mb-3"
        />

        {msg && <p className="text-green-700 text-xs mb-2">{msg}</p>}
        {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

        {summary && summary.count > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-gray-600">مصروف الشهر</p>
                <p className="text-lg font-bold text-orange-600 tabular-nums">
                  {summary.totalSpend.toFixed(2)}
                </p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-600">العمليات</p>
                <p className="text-lg font-bold text-blue-600">{summary.count}</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-gray-600">تنتظر تفاصيل</p>
                <p className="text-lg font-bold text-red-600">{pending.length}</p>
              </div>
            </div>

            {summary.excludedCount > 0 && (
              <p className="text-[11px] text-gray-500 mb-3">
                🚫 مستبعد من الحساب: {summary.excludedCount} عملية بقيمة{" "}
                {summary.excludedTotal.toFixed(2)} ر.س
              </p>
            )}

            <div className="space-y-4">
              <Bars title="حسب جهة الصرف" data={summary.byTarget} total={summary.totalSpend} tint="bg-emerald-500" />
              <Bars title="حسب التصنيف" data={summary.byCategory} total={summary.totalSpend} tint="bg-primary" />
            </div>
          </>
        )}
      </section>

      {/* ٢ — تنتظر تفاصيلك */}
      <section className="card">
        <h2 className="font-bold mb-1">
          ❓ عمليات تنتظر تفاصيلك{" "}
          <span className="text-gray-400 text-sm font-normal">({pending.length})</span>
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          عملية تُعدّ مكتملة إذا رُبطت بفاتورة، أو أُعطيت تصنيفاً وجهة صرف. لا يُحفظ شيء حتى تضغط حفظ.
        </p>

        {pickBar(pending)}

        {pending.some(isDirty) && (
          <button
            onClick={() => saveAll(pending)}
            disabled={saving === "all"}
            className="w-full mb-3 text-sm btn-primary"
          >
            {saving === "all"
              ? "جارٍ الحفظ..."
              : `💾 حفظ كل التغييرات (${pending.filter(isDirty).length})`}
          </button>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : pending.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">لا شيء ينتظر — كل العمليات مكتملة</p>
        ) : (
          <div className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="border border-amber-200 bg-amber-50/30 rounded-lg p-3 space-y-2">
                {pickBox(t)}
                <TxnHead t={t} />
                <TxnEditor
                  t={t}
                  draft={draftOf(t)}
                  dirty={isDirty(t)}
                  saving={saving === t.id}
                  houses={houses}
                  purchases={purchases}
                  categoryOptions={categoryOptions}
                  usedTargets={usedTargets}
                  onEdit={(patch) => edit(t.id, patch)}
                  onSave={() => save(t)}
                  onReset={() =>
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[t.id];
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ٣ — مكتملة، عرض فقط */}
      <section className="card">
        <h2 className="font-bold mb-3">
          ✅ عمليات مكتملة{" "}
          <span className="text-gray-400 text-sm font-normal">({settled.length})</span>
        </h2>

        {pickBar(settled)}

        {settled.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">لم تكتمل أي عملية بعد</p>
        ) : (
          <div className="space-y-2">
            {settled.map((t) => {
              const linked = purchases.find((pu) => pu.id === t.purchase_id);
              return (
                <div key={t.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  {pickBox(t)}
                  <TxnHead t={t} />

                  {editing === t.id ? (
                    <>
                      <TxnEditor
                  t={t}
                  draft={draftOf(t)}
                  dirty={isDirty(t)}
                  saving={saving === t.id}
                  houses={houses}
                  purchases={purchases}
                  categoryOptions={categoryOptions}
                  usedTargets={usedTargets}
                  onEdit={(patch) => edit(t.id, patch)}
                  onSave={() => save(t)}
                  onReset={() =>
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[t.id];
                      return next;
                    })
                  }
                />
                      <div className="flex gap-2">
                        <button
                          onClick={() => removeTxn(t.id, t.merchant)}
                          className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5"
                        >
                          حذف العملية
                        </button>
                        <button
                          onClick={() => {
                            setDrafts((prev) => {
                              const next = { ...prev };
                              delete next[t.id];
                              return next;
                            });
                            setEditing(null);
                          }}
                          className="flex-1 text-xs bg-gray-100 border border-gray-300 rounded py-1.5"
                        >
                          إغلاق
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-end gap-2">
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {linked && (
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            🧾 {linked.store_name}
                          </span>
                        )}
                        {t.category && (
                          <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded">
                            {t.category}
                          </span>
                        )}
                        {targetText(t) && (
                          <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded">
                            {targetText(t)}
                          </span>
                        )}
                        {t.note && <span className="text-gray-500">— {t.note}</span>}
                      </div>
                      <button
                        onClick={() => setEditing(t.id)}
                        className="text-xs text-primary border border-blue-200 rounded px-3 py-1 whitespace-nowrap"
                      >
                        ✏️ تعديل
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
