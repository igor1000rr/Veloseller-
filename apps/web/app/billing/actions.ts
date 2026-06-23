"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

/**
 * Активирует Radar Trial для текущего юзера: 14 дней, 3 бренда.
 *
 * Trial можно активировать ТОЛЬКО ОДИН РАЗ — если radar_trial_started_at уже
 * выставлен, action выкинет ошибку. Анти-фрод: не даём бесконечно продлевать
 * trial.
 */
export async function actionStartRadarTrial() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: seller } = await sb
    .from("sellers")
    .select("radar_plan, radar_trial_started_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!seller) throw new Error("seller not found");
  if (seller.radar_trial_started_at) {
    throw new Error("Trial уже был активирован ранее. Выберите платный тариф.");
  }
  if (seller.radar_plan && seller.radar_plan !== "none") {
    throw new Error("У вас уже активный Radar-тариф.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Привилегированная запись radar-тарифа идёт через service-role: биллинговые
  // колонки sellers закрыты от роли authenticated на уровне column-grants (защита
  // от самоапгрейда через прямой PostgREST). Анти-фрод (один trial на аккаунт)
  // уже проверен выше на authenticated-клиенте с учётом RLS.
  const admin = createServiceClient();
  const { error } = await admin
    .from("sellers")
    .update({
      radar_plan: "trial",
      radar_brands_limit: 3,
      radar_trial_started_at: now.toISOString(),
      radar_active_until: expiresAt.toISOString(),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/billing");
  revalidatePath("/dashboard/radar");
}
