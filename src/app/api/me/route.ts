import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const { data: user, error } = await supabaseServer()
    .from("users")
    .select("id, name, phone, role, house_id")
    .eq("id", session.uid)
    .single();

  if (error || !user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}
