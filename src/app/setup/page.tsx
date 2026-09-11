"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setOpen(!!d.open))
      .finally(() => setChecking(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin !== pin2) {
      setError("الرمز السري غير متطابق");
      return;
    }
    if (pin.length < 4) {
      setError("الرمز السري 4 أرقام على الأقل");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main className="min-h-screen flex items-center justify-center">جارٍ التحقق...</main>;
  }

  if (!open) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="card max-w-sm">
          <p className="mb-3">تم إنشاء حسابات هذا التطبيق مسبقًا.</p>
          <a href="/login" className="btn-primary inline-block">
            الذهاب لتسجيل الدخول
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">إعداد أول مرة</h1>
          <p className="text-gray-500 text-sm mt-1">أنشئ حساب الأدمن (لك أنت، بكل الصلاحيات)</p>
        </div>
        <form onSubmit={onSubmit} className="card flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">اسمك</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">رقم جوالك</label>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">رمز سري (4 أرقام أو أكثر)</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">تأكيد الرمز السري</label>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          بعد الدخول، تقدر تضيف باقي المستخدمين (الزوجات ومسؤول المخزن) من لوحة الأدمن.
        </p>
      </div>
    </main>
  );
}
