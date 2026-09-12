"use client";

import { useEffect, useRef, useState } from "react";
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

type Step = "upload" | "processing" | "review" | "match";

/** أقصى حجم إجمالي مسموح لطلب واحد (هامش أمان تحت حد الخادم 4.5MB) */
const MAX_TOTAL_BYTES = 3.8 * 1024 * 1024;

/** إعدادات ضغط تُجرَّب بالترتيب من الأفضل جودة للأصغر حجمًا */
const COMPRESSION_LEVELS = [
  { maxDimension: 1800, quality: 0.82 },
  { maxDimension: 1400, quality: 0.75 },
  { maxDimension: 1100, quality: 0.68 },
  { maxDimension: 900, quality: 0.6 },
] as const;

async function compressImageAt(file: File, maxDimension: number, quality: number): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** يضغط كل الصور، ويزيد شدة الضغط تدريجيًا لو المجموع لسا أكبر من الحد المسموح */
async function compressToBudget(rawFiles: File[]): Promise<{ files: File[]; overBudget: boolean }> {
  let result: File[] = rawFiles;
  for (const level of COMPRESSION_LEVELS) {
    result = await Promise.all(rawFiles.map((f) => compressImageAt(f, level.maxDimension, level.quality)));
    const total = result.reduce((s, f) => s + f.size, 0);
    if (total <= MAX_TOTAL_BYTES) return { files: result, overBudget: false };
  }
  return { files: result, overBudget: true };
}

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
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState(0);

  // النموذج الجديد: دفعات متعددة
  const [sessionId] = useState(() => crypto.randomUUID());
  const [uploadedBatches, setUploadedBatches] = useState<number>(0);
  const [totalExtractedLines, setTotalExtractedLines] = useState<number>(0);

  // الصور المتجمّعة قبل الإرسال (تصوير مباشر متكرر و/أو اختيار من المعرض معًا)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/houses")
      .then((r) => r.json())
      .then((d) => setHouses(d.houses ?? []));
  }, []);

  // يحرّر روابط المعاينة المؤقتة لما نبدأ فاتورة جديدة
  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      pendingPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAll() {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    pendingPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPreviewUrls([]);
    setImagePaths([]);
    setLines([]);
    setPendingFiles([]);
    setPendingPreviews([]);
    setStep("upload");
    setError(null);
    setSuccess(null);
    setUploadedBatches(0);
    setTotalExtractedLines(0);
  }

  function addPendingFiles(newFiles: File[]) {
    setError(null);
    setSuccess(null);
    setPendingFiles((prev) => [...prev, ...newFiles]);
    setPendingPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
  }

  function onCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addPendingFiles(files);
    e.target.value = "";
  }

  function onGalleryPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addPendingFiles(files);
    e.target.value = "";
  }

  function removePendingFile(index: number) {
    URL.revokeObjectURL(pendingPreviews[index]);
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setPendingPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadBatch() {
    const rawFiles = pendingFiles;
    if (rawFiles.length === 0) return;
    setError(null);
    setSuccess(null);
    setProcessingStatus("");
    setParsing(true);

    let files: File[] = rawFiles;
    try {
      setProcessingStatus("جارٍ ضغط الصور...");
      const { files: compressed, overBudget } = await compressToBudget(rawFiles);
      if (overBudget) {
        setError("عدد/حجم الصور كبير جدًا حتى بعد الضغط — استخدم صور أقل لكل دفعة");
        setProcessingStatus("");
        setProgressPercent(0);
        setParsing(false);
        return;
      }
      files = compressed;

      setProgressPercent(0);
      setProcessingStatus(`جارٍ رفع دفعة ${uploadedBatches + 1}...`);

      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const currentProgress = Math.min(90, Math.round(elapsed * 1.5));
        setProgressPercent(currentProgress);
      }, 500);

      const form = new FormData();
      for (const f of files) form.append("images", f);
      form.append("sessionId", sessionId);
      form.append("batchNumber", String(uploadedBatches + 1));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 65000);

      let res: Response;
      try {
        res = await fetch("/api/purchases/batch-upload", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearInterval(progressInterval);
        clearTimeout(timeoutId);
      }

      type BatchResponse = {
        error?: string;
        success?: boolean;
        batchNumber?: number;
        lineCount?: number;
        imagePaths?: string[];
      };
      let data: BatchResponse;

      if (!res.ok) {
        let errorMsg = "حدث خطأ غير متوقع";
        try {
          data = await res.json();
          errorMsg = data.error ?? errorMsg;
        } catch {
          if (res.status === 413) {
            errorMsg = "الصور كبيرة جدًا حتى بعد الضغط — جرّب صور أقل";
          } else if (res.status === 504 || res.status === 408) {
            errorMsg = "انتهت مهلة الخادم — جرّب صور أقل لكل دفعة";
          } else {
            errorMsg = `خطأ من الخادم (${res.status})`;
          }
        }
        setError(errorMsg);
        setProcessingStatus("");
        setProgressPercent(0);
        return;
      }

      try {
        data = await res.json();
      } catch (e) {
        setError("تعذّر فهم رد الخادم");
        setProcessingStatus("");
        setProgressPercent(0);
        return;
      }

      if (data.success) {
        const newBatchCount = uploadedBatches + 1;
        const newLineCount = totalExtractedLines + (data.lineCount ?? 0);
        setUploadedBatches(newBatchCount);
        setTotalExtractedLines(newLineCount);
        setPendingFiles([]);
        setPendingPreviews([]);

        setProgressPercent(100);
        setProcessingStatus(`✅ تم رفع الدفعة ${newBatchCount} (${data.lineCount} سطر)`);
        setTimeout(() => {
          setProcessingStatus("");
          setProgressPercent(0);
          setSuccess(`تم رفع الدفعة ${newBatchCount} بنجاح ✅`);
        }, 1500);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      if (msg.includes("abort")) {
        setError("انقطع الاتصال — جرّب مرة أخرى");
      } else {
        setError(`تعذّر الاتصال بالخادم: ${msg}`);
      }
      setProcessingStatus("");
      setProgressPercent(0);
    } finally {
      setParsing(false);
    }
  }

  async function finalizeInvoice() {
    if (uploadedBatches === 0) {
      setError("لم ترفع أي دفعات حتى الآن");
      return;
    }

    setError(null);
    setSuccess(null);
    setProcessingStatus("جارٍ معالجة الفاتورة الكاملة...");
    setParsing(true);
    setStep("processing");

    try {
      const res = await fetch("/api/purchases/finalize-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        setStep("upload");
        setProcessingStatus("");
        return;
      }

      type ExtractedLine = {
        item_name: string;
        quantity: number | null;
        unit_price: number | null;
        line_total: number | null;
        category: string | null;
        suggested_request_id: string | null;
      };

      setImagePaths(data.imagePaths ?? []);
      const pendingRequests = data.pendingRequests ?? [];
      setPending(pendingRequests);

      const editable: EditableLine[] = (data.lines ?? []).map(
        (l: ExtractedLine, idx: number) => {
          const matched = l.suggested_request_id && pendingRequests.length > 0
            ? pendingRequests.find((p: PendingForMatch) => p.id === l.suggested_request_id)
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

      setProcessingStatus("");
      setSuccess(
        `تم معالجة الفاتورة ✅\n• الدفعات: ${uploadedBatches}\n• العناصر المستخرجة: ${data.summary.originalItems}\n• المحذوف (تكرار): ${data.summary.removedDuplicates}\n• الأسطر النهائية: ${editable.length}`,
      );
      setStep("review");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ غير معروف";
      setError(`تعذّر الاتصال بالخادم: ${msg}`);
      setStep("upload");
      setProcessingStatus("");
    } finally {
      setParsing(false);
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

  function addNewLine() {
    const newKey = String(Date.now());
    const newLine: EditableLine = {
      key: newKey,
      item_name: "",
      quantity: "",
      unit_price: "",
      line_total: "0",
      category: "أخرى",
      destination: "warehouse",
      house_id: "",
      matched_request_id: "",
    };
    setLines((prev) => [...prev, newLine]);
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "upload" && (
        <section className="card">
          <h2 className="font-bold mb-3">تصوير فاتورة جديدة</h2>
          <p className="text-xs text-gray-500 mb-3">
            صوّر الصور دفعة تلو الأخرى (كل دفعة 2-3 صور)، ثم اضغط "رفع الدفعة". كمّل حتى تنتهي من الفاتورة كاملة،
            ثم اضغط "انتهيت من الصور" ليقوم النظام بمعالجة الفاتورة والتحقق من البيانات.
          </p>

          {uploadedBatches > 0 && (
            <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">✅ تم رفع {uploadedBatches} دفعة ({totalExtractedLines} سطر)</p>
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onCameraCapture}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onGalleryPick}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary" onClick={() => cameraInputRef.current?.click()}>
              📷 التقط صورة
            </button>
            <button type="button" className="btn-secondary" onClick={() => galleryInputRef.current?.click()}>
              🖼️ اختر من المعرض
            </button>
          </div>

          {pendingPreviews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
              {pendingPreviews.map((u, i) => (
                <div key={i} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`صورة ${i + 1}`} className="h-28 w-auto rounded-lg border border-gray-200" />
                  <button
                    onClick={() => removePendingFile(i)}
                    className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs leading-6"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <button className="btn-primary w-full mt-4" onClick={uploadBatch} disabled={parsing}>
              {parsing ? "جارٍ الرفع..." : `رفع الدفعة (${pendingFiles.length} صورة)`}
            </button>
          )}

          {uploadedBatches > 0 && (
            <button className="btn-primary w-full mt-2" onClick={finalizeInvoice} disabled={parsing || pendingFiles.length > 0}>
              {parsing ? "جارٍ المعالجة..." : "✅ انتهيت من الصور - معالجة الفاتورة"}
            </button>
          )}

          {uploadedBatches > 0 && (
            <button className="text-xs text-gray-500 w-full mt-2" onClick={resetAll}>
              إلغاء والبدء من جديد
            </button>
          )}

          {processingStatus && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-2">{processingStatus}</p>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-blue-700 mt-1">{progressPercent}% مكتمل</p>
            </div>
          )}

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          {success && <p className="text-emerald-600 text-sm mt-2">{success}</p>}
        </section>
      )}

      {step === "processing" && (
        <section className="card">
          <h2 className="font-bold mb-3">معالجة الفاتورة الكاملة</h2>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">{processingStatus}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full animate-pulse" style={{ width: "100%" }} />
            </div>
            <p className="text-xs text-gray-500 mt-3">جارٍ دمج البيانات وحذف التكرار...</p>
          </div>
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

          {/* Header row */}
          <div className="grid grid-cols-1 gap-3 mb-2">
            <div className="grid grid-cols-4 gap-2 text-xs font-bold text-gray-600 px-1">
              <div className="text-gray-400">السعر مع الضريبة (عرض فقط)</div>
              <div>السعر الأساسي ✏️</div>
              <div>الكمية ✏️</div>
              <div>الإجمالي ✏️</div>
            </div>
          </div>

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
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {/* السعر مع الضريبة - عرض فقط */}
                  <div className="p-2 bg-gray-50 rounded border border-gray-200 flex items-center justify-center">
                    <span className="font-semibold text-gray-600">
                      {(parseFloat(l.unit_price) * 1.15).toFixed(2)}
                    </span>
                  </div>
                  {/* السعر الأساسي - قابل للتعديل */}
                  <input
                    className="input"
                    placeholder="سعر الوحدة"
                    type="number"
                    step="any"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                  />
                  {/* الكمية - قابلة للتعديل */}
                  <input
                    className="input"
                    placeholder="الكمية"
                    type="number"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                  {/* الإجمالي - قابل للتعديل */}
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

          <button
            type="button"
            className="btn-secondary w-full mt-4"
            onClick={addNewLine}
          >
            + إضافة عنصر جديد
          </button>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
            <div className="flex flex-col gap-1">
              <p className="font-bold">الإجمالي (بدون ضريبة): {total.toFixed(2)} ريال</p>
              <p className="text-sm text-gray-600">مع 15% ضريبة: {(total * 1.15).toFixed(2)} ريال</p>
            </div>
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
            <div className="flex flex-col gap-1">
              <p className="font-bold">الإجمالي (بدون ضريبة): {total.toFixed(2)} ريال</p>
              <p className="text-sm text-gray-600">مع 15% ضريبة: {(total * 1.15).toFixed(2)} ريال</p>
            </div>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "تم، احفظ الفاتورة"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
