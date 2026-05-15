import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: seller } = await supabase
    .from("sellers").select("stripe_customer_id").eq("id", user.id).single();
  if (!seller?.stripe_customer_id) {
    return NextResponse.json({ error: "Нет активной подписки" }, { status: 400 });
  }

  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
  const session = await getStripe().billingPortal.sessions.create({
    customer: seller.stripe_customer_id,
    return_url: `${origin}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
