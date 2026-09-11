import { getSession } from "@/lib/session";
import TopBar from "@/components/TopBar";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const session = await getSession();
  return (
    <main className="min-h-screen pb-10">
      <TopBar title="🛠️ لوحة الأدمن" subtitle={`أهلًا ${session?.name ?? ""}`} />
      <AdminDashboard />
    </main>
  );
}
