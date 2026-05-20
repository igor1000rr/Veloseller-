import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/stripe/portal — создаёт Stripe Billing Portal Session.
 *
 * БАГ 49 fix: rate limit.
 * БАГ 29 fix: origin для return_url из whitelisted env, не из user-controlled headers.
 */
const ALLOWED_ORIGINS = (process.env.APP_URL || "https://veloseller.ru").split(",").map(s => s.trim());

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const { data: seller } = await supabase
    .from("sellers").select("stripe_customer_id").eq("id", user.id).single();
  if (!seller?.stripe_customer_id) {
    return NextResponse.json({ error: "Нет активной подписки" }, { status: 400 });
  }

  const requestOrigin = req.headers.get("origin");
  const origin = (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin))
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  const session = await getStripe().billingPortal.sessions.create({
    customer: seller.stripe_customer_id,
    return_url: `${origin}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
