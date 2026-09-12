"use client";

import { useEffect, useState, useCallback } from "react";
import type { House, PurchaseRequest, AppUser } from "@/lib/types";
import { useRouter } from "next/navigation";

type RequestByDate = {
  date: string;
  requests: (PurchaseRequest & { requestedAt: string })[];
  age: "new" | "old" | "very_old";
};

type PurchaseByDate = {
  date: string;
  storeName: string;
  totalAmount: number;
  itemCount: number;
};

export default function WifeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [house, setHouse] = useState<House | null>(null);
  const [tab, setTab] = useState<"requests" | "purchases" | "stats">("requests");
  const [loading, setLoading] = useState(true);

  const [pendingRequests, setPendingRequests] = useState<RequestByDate[]>([]);
  const [purchasedRequests, setPurchasedRequests] = useState<PurchaseByDate[]>([]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const [newRequestText, setNewRequestText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [stats, setStats] = useState({ pending: 0, purchased: 0, totalSpent: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, housesRes, reqRes, purchasesRes] = await Promise.all([
        fetch("/api/me").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
        fetch("/api/requests").then((r) => r.json()),
        fetch("/api/purchases?limit=100").then((r) => r.json()),
      ]);

      if (!meRes.user) {
        router.push("/login");
        return;
      }

      const currentUser = meRes.user;
      setUser(currentUser);

      const houses = housesRes.houses ?? [];
      const userHouse = houses.find((h: House) => h.id === currentUser.house_id);
      setHouse(userHouse);

      const requests = (reqRes.requests ?? []).filter((r: PurchaseRequest) => r.house_id === currentUser.house_id);

      // تنظيم الطلبات المعلقة بالتاريخ
      const grouped: Record<string, typeof requests> = {};
      requests
        .filter((r: PurchaseRequest) => r.status === "pending")
        .forEach((r: PurchaseRequest) => {
          const date = String(r.requested_at).slice(0, 10);
          if (!grouped[date]) grouped[date] = [];
          grouped[date].push(r);
        });

      const now = new Date();
      const pendingByDate: RequestByDate[] = Object.entries(grouped)
        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
        .map(([date, reqs]) => {
          const reqDate = new Date(date);
          const daysDiff = Math.floor((now.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
          const age = daysDiff > 7 ? "very_old" : daysDiff > 3 ? "old" : "new";
          return { date, requests: reqs as any, age };
        });

      setPendingRequests(pendingByDate);
      setStats((s) => ({ ...s, pending: requests.filter((r: PurchaseRequest) => r.status === "pending").length }));

      // تنظيم المشتريات بالتاريخ
      const purchases = purchasesRes.purchases ?? [];
      const housePurchases: Record<string, any> = {};
      purchases.forEach((p: any) => {
        const date = p.created_at.slice(0, 10);
        const items = (p.purchase_lines || []).filter((l: any) => l.house_id === currentUser.house_id);
        if (items.length > 0) {
          if (!housePurchases[date]) housePurchases[date] = [];
          housePurchases[date].push({
            storeName: p.store_name || "متجر",
            totalAmount: items.reduce((s: number, l: any) => s + Number(l.line_total || 0), 0),
            itemCount: items.length,
          });
        }
      });

      const purchasedByDate: PurchaseByDate[] = Object.entries(housePurchases)
        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
        .slice(0, 20)
        .map(([date, stores]) => ({
          date,
          storeName: stores.map((s: any) => s.storeName).join(" + "),
          totalAmount: stores.reduce((s: number, st: any) => s + st.totalAmount, 0),
          itemCount: stores.reduce((s: number, st: any) => s + st.itemCount, 0),
        }));

      setPurchasedRequests(purchasedByDate);
      setStats((s) => ({ ...s, purchased: purchasedByDate.length, totalSpent: purchasedByDate.reduce((s, p) => s + p.totalAmount, 0) }));

      if (pendingByDate.length > 0) {
        setExpandedDates(new Set([pendingByDate[0].date]));
      }
    } catch (e) {
      console.error("خطأ في التحميل:", e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitRequest() {
    if (!newRequestText.trim() || !house) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: newRequestText.trim(),
          quantity_requested: 1,
          quantity_text: newRequestText.trim(),
          house_id: house.id,
          notes: "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "فشل إرسال الطلب");
        return;
      }

      setSuccess("تم إرسال الطلب بنجاح ✅");
      setNewRequestText("");
      setTimeout(() => {
        setSuccess(null);
        load();
      }, 2000);
    } catch (e) {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  }

  const ageEmoji = { new: "🟢", old: "🟡", very_old: "🔴" };
  const ageLabel = { new: "جديد", old: "قديم", very_old: "قديم جداً" };

  if (loading) return <p className="text-gray-400 text-sm p-4">جارٍ التحميل...</p>;

  return (
    <div className="px-4 -mt-6 max-w-2xl mx-auto pb-4">
      {/* Header محسّن */}
      <div className="card mb-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">🏠</span>
              <div>
                <h1 className="text-2xl font-bold">{house?.name || "بيتك"}</h1>
                <p className="text-blue-100 text-sm">👤 {user?.name || "المستخدم"}</p>
              </div>
            </div>
            <div className="bg-blue-400 bg-opacity-30 rounded-lg p-2">
              <p className="text-xs text-blue-100">📱 {user?.phone || "رقم الهاتف"}</p>
              <p className="text-xs text-blue-100">🆔 {house?.id ? house.id.slice(0, 8) : "معرف البيت"}</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-white hover:bg-blue-700 px-4 py-2 rounded-lg transition text-sm font-semibold whitespace-nowrap h-fit"
          >
            ← خروج
          </button>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <section className="card mb-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs text-gray-600">قيد الانتظار</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-gray-600">تم شراؤه</p>
            <p className="text-2xl font-bold text-green-600">{stats.purchased}</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600">المصروف</p>
            <p className="text-lg font-bold text-blue-600">{stats.totalSpent.toFixed(0)}</p>
          </div>
        </div>
      </section>

      {/* التبويبات */}
      <nav className="card !p-2 mb-4 flex gap-1">
        {(["requests", "purchases", "stats"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
              tab === t ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t === "requests" ? "طلباتي" : t === "purchases" ? "مشترياتي" : "التقارير"}
          </button>
        ))}
      </nav>

      {tab === "requests" && (
        <div className="flex flex-col gap-4">
          {/* إنشاء طلبية جديدة */}
          <section className="card">
            <h2 className="font-bold mb-3">📝 طلبية جديدة</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRequest();
              }}
              className="flex flex-col gap-3"
            >
              <textarea
                className="input min-h-24"
                placeholder="أكتبي الأغراض اللي تبيها (مثال: أرز، سكر، زيت)"
                value={newRequestText}
                onChange={(e) => setNewRequestText(e.target.value)}
                required
              />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {success && <p className="text-green-600 text-sm">{success}</p>}
              <button className="btn-primary" disabled={submitting || !newRequestText.trim()}>
                {submitting ? "جارٍ الإرسال..." : "✓ أرسلي الطلب"}
              </button>
            </form>
          </section>

          {/* الطلبات المعلقة */}
          <section className="card">
            <h2 className="font-bold mb-3">⏳ طلباتك المعلقة ({stats.pending})</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-gray-400 text-sm text-center">لا توجد طلبات معلقة حالياً 🎉</p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((group) => (
                  <div key={group.date} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        const newSet = new Set(expandedDates);
                        if (newSet.has(group.date)) newSet.delete(group.date);
                        else newSet.add(group.date);
                        setExpandedDates(newSet);
                      }}
                      className="w-full p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-200"
                    >
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm">
                          📅 {new Date(group.date).toLocaleDateString("ar-SA", { weekday: "long", month: "long", day: "numeric" })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{group.requests.length} عناصر</p>
                      </div>
                      <div className="text-right ml-4">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          group.age === "new" ? "bg-green-100 text-green-700" : group.age === "old" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                        }`}>
                          {ageEmoji[group.age]} {ageLabel[group.age]}
                        </span>
                      </div>
                    </button>

                    {expandedDates.has(group.date) && (
                      <div className="bg-gray-50 p-3 space-y-2">
                        {group.requests.map((req) => (
                          <div key={req.id} className="bg-white border border-gray-100 rounded-lg p-3 flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{req.item_name}</p>
                              {req.quantity_text && <p className="text-xs text-gray-500">الكمية: {req.quantity_text}</p>}
                              
                            </div>
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">معلّق</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "purchases" && (
        <section className="card">
          <h2 className="font-bold mb-3">✅ مشترياتك ({stats.purchased})</h2>
          {purchasedRequests.length === 0 ? (
            <p className="text-gray-400 text-sm text-center">لم تُشترَ أي طلبات بعد</p>
          ) : (
            <div className="space-y-3">
              {purchasedRequests.map((purchase) => (
                <div key={purchase.date} className="border border-green-200 bg-green-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm">
                        📅 {new Date(purchase.date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                      </p>
                      <p className="text-xs text-gray-600">{purchase.storeName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">{purchase.totalAmount.toFixed(0)} ريال</p>
                      <p className="text-xs text-gray-600">{purchase.itemCount} عنصر</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "stats" && (
        <section className="card">
          <h2 className="font-bold mb-3">📊 التقارير</h2>
          <div className="space-y-3">
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">إجمالي الطلبات هذا الشهر</p>
              <p className="text-3xl font-bold text-primary">{stats.pending + stats.purchased}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">المجموع المصروف</p>
              <p className="text-3xl font-bold text-green-600">{stats.totalSpent.toFixed(0)} ريال</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">متوسط المشتريات</p>
              <p className="text-3xl font-bold text-blue-600">
                {stats.purchased > 0 ? (stats.totalSpent / stats.purchased).toFixed(0) : "0"} ريال
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
