"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setSetupOpen(!!d.open))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      const dest = data.role === "wife" ? "/wife" : data.role === "warehouse" ? "/warehouse" : "/admin";
      router.push(dest);
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">📒 مصاريف البيت</h1>
          <p className="text-gray-500 text-sm mt-1">سجّل دخولك برقم جوالك ورمزك السري</p>
        </div>

        <form onSubmit={onSubmit} className="card flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">رقم الجوال</label>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              placeholder="05xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">الرمز السري</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>

        {setupOpen && (
          <p className="text-center text-sm text-gray-500 mt-4">
            أول مرة تفتح التطبيق؟{" "}
            <a href="/setup" className="text-primary font-semibold">
              أنشئ حساب الأدمن من هنا
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
