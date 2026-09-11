import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabaseServer";
import TopBar from "@/components/TopBar";
import WifeDashboard from "./WifeDashboard";

export default async function WifePage() {
  const session = await getSession();
  let houseName = "بيتك";
  if (session?.houseId) {
    const { data } = await supabaseServer()
      .from("houses")
      .select("name")
      .eq("id", session.houseId)
      .maybeSingle();
    if (data?.name) houseName = data.name as string;
  }

  return (
    <main className="min-h-screen pb-10">
      <TopBar title={`📒 ${houseName}`} subtitle={`أهلًا ${session?.name ?? ""}`} />
      <WifeDashboard />
    </main>
  );
}
