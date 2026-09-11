import { getSession } from "@/lib/session";
import TopBar from "@/components/TopBar";
import WarehouseDashboard from "./WarehouseDashboard";

export default async function WarehousePage() {
  const session = await getSession();
  return (
    <main className="min-h-screen pb-10">
      <TopBar title="📦 المخزن" subtitle={`أهلًا ${session?.name ?? ""}`} />
      <WarehouseDashboard />
    </main>
  );
}
