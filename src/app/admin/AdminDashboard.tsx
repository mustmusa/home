"use client";

import { useState, useEffect } from "react";
import PendingRequestsTab from "./PendingRequestsTab";
import RequestHistoryTab from "./RequestHistoryTab";
import NewInvoiceTab from "./NewInvoiceTab";
import ReportsTab from "./ReportsTab";
import ActiveOrdersTab from "./ActiveOrdersTab";
import PurchasedOrdersTab from "./PurchasedOrdersTab";
import UsersTab from "./UsersTab";
import FixPricesTab from "./FixPricesTab";
import WarehouseManager from "@/components/WarehouseManager";
import type { House } from "@/lib/types";

const TABS = [
  { id: "pending", label: "الطلبات المعلّقة" },
  { id: "active-orders", label: "الطلبات النشطة" },
  { id: "purchased-history", label: "سجل الطلبيات" },
  { id: "history", label: "سجل الطلبات" },
  { id: "invoice", label: "فاتورة جديدة" },
  { id: "fix-prices", label: "🔧 إصلاح الأسعار" },
  { id: "warehouse", label: "المخزون" },
  { id: "reports", label: "التقارير" },
  { id: "users", label: "المستخدمون" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("pending");
  const [houses, setHouses] = useState<House[]>([]);

  useEffect(() => {
    fetch("/api/houses")
      .then((r) => r.json())
      .then((d) => setHouses(d.houses ?? []));
  }, []);

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
      {tab === "active-orders" && <ActiveOrdersTab />}
      {tab === "purchased-history" && <PurchasedOrdersTab />}
      {tab === "history" && <RequestHistoryTab />}
      {tab === "invoice" && <NewInvoiceTab />}
      {tab === "fix-prices" && <FixPricesTab />}
      {tab === "warehouse" && <WarehouseManager />}
      {tab === "reports" && <ReportsTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}
