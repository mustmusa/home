"use client";

import { useEffect, useState, useCallback } from "react";
import type { AppUser, House, Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = {
  wife: "زوجة",
  warehouse: "مسؤول المخزن",
  admin: "أدمن",
};

export default function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role>("wife");
  const [houseId, setHouseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, housesRes] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/houses").then((r) => r.json()),
      ]);
      setUsers(usersRes.users ?? []);
      setHouses(housesRes.houses ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, pin, role, house_id: role === "wife" ? houseId : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }
      setName("");
      setPhone("");
      setPin("");
      setHouseId("");
      load();
    } finally {
      setAdding(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("حذف هذا الحساب نهائيًا؟")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  function houseName(id: string | null) {
    return houses.find((h) => h.id === id)?.name ?? "—";
  }

  async function renameHouse(id: string, current: string) {
    const name = prompt("اسم البيت الجديد:", current);
    if (!name || name.trim() === current) return;
    await fetch(`/api/houses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="font-bold mb-3">أسماء البيوت</h2>
        <ul className="flex flex-col gap-2">
          {houses.map((h) => (
            <li key={h.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
              <span>{h.name}</span>
              <button onClick={() => renameHouse(h.id, h.name)} className="text-primary text-xs font-semibold">
                تعديل الاسم
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-bold mb-3">إضافة مستخدم</h2>
        <form onSubmit={addUser} className="grid grid-cols-2 gap-3">
          <input className="input col-span-2" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            className="input"
            placeholder="رقم الجوال"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="رمز سري (4 أرقام+)"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="wife">زوجة</option>
            <option value="warehouse">مسؤول المخزن</option>
            <option value="admin">أدمن</option>
          </select>
          {role === "wife" && (
            <select className="input" value={houseId} onChange={(e) => setHouseId(e.target.value)} required>
              <option value="">اختر البيت</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-red-600 text-sm col-span-2">{error}</p>}
          <button className="btn-primary col-span-2" disabled={adding}>
            {adding ? "جارٍ الإضافة..." : "إضافة مستخدم"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-bold mb-3">المستخدمون الحاليون</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="font-medium">
                    {u.name} <span className="text-xs text-gray-400">({ROLE_LABELS[u.role]})</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {u.phone} {u.role === "wife" && `— ${houseName(u.house_id)}`}
                  </p>
                </div>
                <button onClick={() => removeUser(u.id)} className="text-red-500 text-xs">
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
