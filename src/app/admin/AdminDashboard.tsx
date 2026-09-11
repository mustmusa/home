"use client";

import { useState } from "react";
import PendingRequestsTab from "./PendingRequestsTab";
import NewInvoiceTab from "./NewInvoiceTab";
import ReportsTab from "./ReportsTab";
import UsersTab from "./UsersTab";
import WarehouseManager from "@/components/WarehouseManager";

const TABS = [
  { id: "pending", label: "الطلبات المعلّقة" },
  { id: "invoice", label: "فاتورة جديدة" },
  { id: "warehouse", label: "المخزون" },
  { id: "reports", label: "التقارير" },
  { id: "users", label: "المستخدمون" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("pending");

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

      {tab === "pending" && <PendingRequestsTab />}
      {tab === "invoice" && <NewInvoiceTab />}
      {tab === "warehouse" && <WarehouseManager />}
      {tab === "reports" && <ReportsTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}
