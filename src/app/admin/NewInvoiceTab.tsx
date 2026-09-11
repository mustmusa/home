"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type House } from "@/lib/types";

type PendingForMatch = {
  id: string;
  item_name: string;
  quantity_text: string | null;
  house_id: string;
  house_name: string;
};

type EditableLine = {
  key: string;
  item_name: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  category: string;
  destination: "house" | "warehouse";
  house_id: string;
  matched_request_id: string;
};

type Step = "upload" | "review" | "match";

export default function NewInvoiceTab() {
  const [houses, setHouses] = useState<House[]>([]);
  const [pending, setPending] = useState<PendingForMatch[]>([]);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/houses")
      .then((r) => r.json())
      .then((d) => setHouses(d.houses ?? []));
  }, []);

  // يحرّر روابط المعاينة المؤقتة لما نبدأ فاتورة جديدة
  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAll() {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setPreviewUrls([]);
    setImagePaths([]);
    setLines([]);
    setStep("upload");
    setError(null);
    setSuccess(null);
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setSuccess(null);
    setParsing(true);

    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);

    try {
      const form = new FormData();
      for (const f of files) form.append("images", f);
      const res = await fetch("/api/purchases/parse-invoice", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        urls.forEach((u) => URL.revokeObjectURL(u));
        setPreviewUrls([]);
        return;
      }
      setImagePaths(data.imagePaths ?? []);
      setPending(data.pendingRequests ?? []);

      const editable: EditableLine[] = (data.lines ?? []).map(
        (
          l: {
            item_name: string;
            quantity: number | null;
            unit_price: number | null;
            line_total: number | null;
            category: string | null;
            suggested_request_id: string | null;
          },
          idx: number,
        ) => {
          const matched = l.suggested_request_id
            ? (data.pendingRequests as PendingForMatch[]).find((p) => p.id === l.suggested_request_id)
            : null;
          return {
            key: String(idx),
            item_name: l.item_name,
            quantity: l.quantity != null ? String(l.quantity) : "",
            unit_price: l.unit_price != null ? String(l.unit_price) : "",
            line_total: l.line_total != null ? String(l.line_total) : "0",
            category: l.category ?? "أخرى",
            destination: matched ? "house" : "warehouse",
            house_id: matched ? matched.house_id : "",
            matched_request_id: matched ? matched.id : "",
          };
        },
      );
      setLines(editable);
      setStep("review");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const payload = lines.map((l) => ({
        item_name: l.item_name,
        quantity: l.quantity ? Number(l.quantity) : null,
        unit_price: l.unit_price ? Number(l.unit_price) : null,
        line_total: Number(l.line_total || 0),
        category: l.category || null,
        destination: l.destination,
        house_id: l.destination === "house" ? l.house_id : null,
        matched_request_id: l.matched_request_id || null,
      }));
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePaths, lines: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      setSuccess("تم حفظ الفاتورة بنجاح ✅");
      resetAll();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  const total = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);
  const needsManualMatch = (l: EditableLine) => l.destination === "warehouse" && !l.matched_request_id;

  return (
    <div className="flex flex-col gap-4">
      {step === "upload" && (
        <section className="card">
          <h2 className="font-bold mb-3">تصوير فاتورة جديدة</h2>
          <p className="text-xs text-gray-500 mb-2">
            لو الفاتورة طويلة ومصوّرة على أكثر من صورة، اختر كل الصور دفعة وحدة — بترتيبها من الأول للآخر.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onFiles}
            className="input"
          />
          {parsing && <p className="text-sm text-gray-500 mt-2">جارٍ قراءة الفاتورة بالذكاء الاصطناعي...</p>}
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          {success && <p className="text-emerald-600 text-sm mt-2">{success}</p>}
        </section>
      )}

      {step === "review" && (
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">١. راجع القراءة ({lines.length} سطر)</h2>
            <button onClick={resetAll} className="text-xs text-gray-500">
              إلغاء والبدء من جديد
            </button>
          </div>

          {previewUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
              {previewUrls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt={`صورة ${i + 1}`} className="h-28 w-auto rounded-lg border border-gray-200 shrink-0" />
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 mb-3">قارن الأرقام مع الصور فوق وصحّح أي خطأ قبل ما تكمل.</p>

          <div className="flex flex-col gap-3">
            {lines.map((l) => (
              <div key={l.key} className="border border-gray-100 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <input
                    className="input flex-1"
                    value={l.item_name}
                    onChange={(e) => updateLine(l.key, { item_name: e.target.value })}
                  />
                  <button onClick={() => removeLine(l.key)} className="text-red-500 text-xs shrink-0">
                    حذف
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className="input"
                    placeholder="الكمية"
                    type="number"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="سعر الوحدة"
                    type="number"
                    step="any"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="الإجمالي"
                    type="number"
                    step="any"
                    value={l.line_total}
                    onChange={(e) => updateLine(l.key, { line_total: e.target.value })}
                  />
                </div>
                <select className="input" value={l.category} onChange={(e) => updateLine(l.key, { category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
            <p className="font-bold">الإجمالي: {total.toFixed(2)}</p>
            <button className="btn-primary" onClick={() => setStep("match")} disabled={lines.length === 0}>
              الأسطر صحيحة، تابع للمطابقة ←
            </button>
          </div>
        </section>
      )}

      {step === "match" && (
        <section className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">٢. طابق كل سطر ({lines.length})</h2>
            <button onClick={() => setStep("review")} className="text-xs text-gray-500">
              → رجوع لمراجعة القراءة
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l) => (
              <div
                key={l.key}
                className={`border rounded-lg p-3 flex flex-col gap-2 ${
                  needsManualMatch(l) ? "border-amber-300 bg-amber-50" : "border-gray-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">
                    {l.item_name}{" "}
                    <span className="text-gray-400 text-xs">
                      ({l.quantity || "—"} × {l.unit_price || "—"} = {l.line_total})
                    </span>
                  </p>
                  <span className="text-xs text-gray-400">{l.category}</span>
                </div>
                {needsManualMatch(l) && (
                  <p className="text-xs text-amber-700">⚠️ ما لقى له الذكاء الاصطناعي طلب مطابق — تأكد من الوجهة يدويًا</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="input"
                    value={l.destination}
                    onChange={(e) =>
                      updateLine(l.key, {
                        destination: e.target.value as "house" | "warehouse",
                        house_id: e.target.value === "warehouse" ? "" : l.house_id,
                        matched_request_id: "",
                      })
                    }
                  >
                    <option value="warehouse">للمخزون</option>
                    <option value="house">لأحد البيوت</option>
                  </select>
                  {l.destination === "house" && (
                    <select
                      className="input"
                      value={l.house_id}
                      onChange={(e) => updateLine(l.key, { house_id: e.target.value, matched_request_id: "" })}
                    >
                      <option value="">اختر البيت</option>
                      {houses.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {l.destination === "house" && l.house_id && (
                  <select
                    className="input"
                    value={l.matched_request_id}
                    onChange={(e) => updateLine(l.key, { matched_request_id: e.target.value })}
                  >
                    <option value="">بدون ربط بطلب معيّن</option>
                    {pending
                      .filter((p) => p.house_id === l.house_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.item_name} {p.quantity_text ? `— ${p.quantity_text}` : ""}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
            <p className="font-bold">الإجمالي: {total.toFixed(2)}</p>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "تم، احفظ الفاتورة"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
