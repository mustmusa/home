"use client";

import { useState } from "react";
import WarehouseManager from "@/components/WarehouseManager";
import OffersTab from "@/app/admin/OffersTab";

const TABS = [
  { id: "inventory", label: "المخزون" },
  { id: "offers", label: "🎁 العروض" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function WarehouseDashboard() {
  const [tab, setTab] = useState<TabId>("inventory");

  return (
    <div className="px-4 -mt-6 max-w-2xl mx-auto">
      <nav className="card !p-2 mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-semibold ${
              tab === t.id ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "inventory" && <WarehouseManager />}
      {tab === "offers" && <OffersTab />}
    </div>
  );
}
