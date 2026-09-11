"use client";

import { useRouter } from "next/navigation";

export default function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-gradient-to-l from-primary to-primary-dark text-white px-4 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="text-xs opacity-90">{subtitle}</p>}
      </div>
      <button onClick={logout} className="text-sm bg-white/15 px-3 py-1.5 rounded-lg hover:bg-white/25">
        خروج
      </button>
    </header>
  );
}
