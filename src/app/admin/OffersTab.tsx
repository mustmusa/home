"use client";

import { useEffect, useState } from "react";

type Offer = {
  id: string;
  mall: string;
  item_name: string;
  original_price: number | null;
  offer_price: number;
  discount_percent: number | null;
  description: string | null;
  created_at: string;
};

type OffersData = {
  [mall: string]: Offer[];
};

type UserRole = "admin" | "warehouse" | "user" | null;

export default function OffersTab() {
  const [offers, setOffers] = useState<OffersData>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedMall, setSelectedMall] = useState("بندا");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [d4dUrl, setD4dUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<Offer[] | null>(null);
  const [raw, setRaw] = useState<string | null>(null);

  const malls = ["بندا", "الجزيرة", "الدانوب", "أسواق التميمي", "اللولو"];

  useEffect(() => {
    loadOffers();
    fetchUserRole();
  }, []);

  async function fetchUserRole() {
    try {
      const res = await fetch("/api/user");
      const data = await res.json();
      setUserRole(data.role || null);
    } catch (e) {
      console.error("خطأ في تحميل دور المستخدم:", e);
    }
  }

  async function loadOffers() {
    setLoading(true);
    try {
      const res = await fetch("/api/offers");
      const data = await res.json();
      setOffers(data.offers || {});
    } catch (e) {
      setError("خطأ في تحميل العروض");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mall", selectedMall);

      const res = await fetch("/api/offers/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "فشل الرفع");
        return;
      }

      setSuccess(`تم استخراج ${data.extracted} عرض بنجاح ✅`);
      e.target.value = "";
      setTimeout(() => {
        loadOffers();
        setSuccess(null);
      }, 2000);
    } catch (e) {
      setError("خطأ في معالجة الملف");
    } finally {
      setUploading(false);
    }
  }

  async function deleteOffer(offerId: string) {
    if (!confirm("هل تريد حذف هذا العرض؟")) return;

    try {
      const res = await fetch("/api/offers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });

      if (res.ok) {
        loadOffers();
      } else {
        setError("فشل الحذف");
      }
    } catch (e) {
      setError("خطأ في الحذف");
    }
  }


  async function callSync(body: Record<string, unknown>) {
    const res = await fetch("/api/offers/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: d4dUrl, mall: selectedMall, ...body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل الطلب");
    return data;
  }

  async function testOnePage() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPreview(null);
    try {
      const data = await callSync({ dryRun: true });
      setPreview(data.offers || []);
      setRaw(data.raw ?? null);
      setSuccess(
        `[نسخة ${data.promptVersion ?? "قديمة"}] النشرة فيها ${data.totalPages} صفحة. استُخرج ${data.extracted} عرض من الصفحة الأولى.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPreview(null);
    let offset = 0;
    let inserted = 0;
    try {
      for (;;) {
        const data = await callSync({ offset });
        inserted += data.inserted ?? 0;
        setProgress({ done: data.processedPages, total: data.totalPages });
        if (data.done) break;
        offset = data.nextOffset;
      }
      setSuccess(`تم. حُفظ ${inserted} عرض من ${selectedMall}.`);
      loadOffers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const totalOffers = Object.values(offers).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Upload Section - Only for Admin */}
      {userRole === "admin" && (
        <section className="card">
          <h2 className="font-bold mb-3">📸 رفع عرض جديد</h2>

          <div className="space-y-3">
            <select
              value={selectedMall}
              onChange={(e) => setSelectedMall(e.target.value)}
              className="input w-full"
            >
              {malls.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <div className="space-y-3">
              <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-primary rounded-lg cursor-pointer hover:bg-blue-50">
                <span className="text-sm font-medium text-primary">
                  {uploading ? "جارٍ الرفع..." : "📁 اضغط لرفع صورة إعلان"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">
                🌐 جلب تلقائي من D4D
              </p>
              <input
                type="url"
                dir="ltr"
                value={d4dUrl}
                onChange={(e) => setD4dUrl(e.target.value)}
                placeholder="https://d4donline.com/en/saudi-arabia/riyadh/offers/..."
                className="input w-full text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={testOnePage}
                  disabled={busy || !d4dUrl}
                  className="flex-1 px-3 py-2 border border-primary text-primary rounded-lg text-xs font-medium disabled:opacity-40"
                >
                  اختبار صفحة واحدة
                </button>
                <button
                  onClick={syncAll}
                  disabled={busy || !d4dUrl}
                  className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-40"
                >
                  جلب كل الصفحات
                </button>
              </div>
              {progress && (
                <div className="space-y-1">
                  <div className="h-2 bg-gray-200 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    {progress.done} / {progress.total} صفحة
                  </p>
                </div>
              )}
              {raw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500">
                    عرض رد النموذج الخام
                  </summary>
                  <pre dir="ltr" className="mt-1 p-2 bg-gray-50 rounded overflow-x-auto whitespace-pre-wrap text-[10px] max-h-48">
                    {raw}
                  </pre>
                </details>
              )}
              {preview && preview.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {preview.map((o, i) => (
                    <div key={i} className="p-2 flex justify-between gap-2 text-xs">
                      <div className="flex-1">
                        <p>{o.item_name}</p>
                        {o.description && (
                          <p className="text-gray-500 mt-0.5">{o.description}</p>
                        )}
                      </div>
                      <span className="font-bold text-green-600 whitespace-nowrap">
                        {o.offer_price} ر.س
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {success && <p className="text-green-600 text-sm">{success}</p>}
          </div>
        </section>
      )}

      {/* Summary */}
      <section className="card">
        <h2 className="font-bold mb-3">📊 الإحصائيات</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-600">إجمالي العروض</p>
            <p className="text-2xl font-bold text-blue-600">{totalOffers}</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-gray-600">المولات النشطة</p>
            <p className="text-2xl font-bold text-purple-600">{Object.keys(offers).length}</p>
          </div>
        </div>
      </section>

      {/* Offers by Mall */}
      <section className="card">
        <h2 className="font-bold mb-4">🛍️ العروض حسب المول</h2>
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">جارٍ تحميل العروض...</p>
        ) : (
          <>
            <div className="space-y-4">
              {Object.entries(offers).map(([mall, mallOffers]) => (
                <div key={mall} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Mall Header */}
                  <div className="bg-gray-50 p-3 border-b border-gray-200">
                    <p className="font-semibold text-sm">{mall}</p>
                    <p className="text-xs text-gray-500 mt-1">{mallOffers.length} عرض</p>
                  </div>

                  {/* Offers List */}
                  <div className="divide-y divide-gray-100">
                    {mallOffers.map((offer) => (
                      <div key={offer.id} className="p-3 hover:bg-gray-50">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{offer.item_name}</p>
                            {offer.description && (
                              <p className="text-xs text-gray-500 mt-1">{offer.description}</p>
                            )}
                          </div>
                          {userRole === "admin" && (
                            <button
                              onClick={() => deleteOffer(offer.id)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              حذف
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2 items-center text-sm">
                          {offer.original_price && (
                            <span className="text-gray-500 line-through">
                              {offer.original_price} ر.س
                            </span>
                          )}
                          <span className="font-bold text-green-600">{offer.offer_price} ر.س</span>
                          {offer.discount_percent && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                              -{offer.discount_percent}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {totalOffers === 0 && (
              <p className="text-center text-gray-400 py-8">لا توجد عروض حالياً</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
