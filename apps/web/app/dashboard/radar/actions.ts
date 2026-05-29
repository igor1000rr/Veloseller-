"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Server Actions для UI Radar. Все требуют авторизованного юзера —
// RLS политика radar_queries_seller_all автоматически отфильтровывает
// чужие записи. Тут только обновляем + лог в radar_actions.

async function getUser() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return { sb, user };
}

async function logAction(
  sb: any,
  sellerId: string,
  queryId: string | null,
  type: string,
) {
  try {
    await sb.from("radar_actions").insert({
      seller_id: sellerId,
      query_id: queryId,
      action_type: type,
    });
  } catch {
    // не блокируем основное действие если лог не записался
  }
}

export async function actionToggleFavorite(queryId: string, value: boolean) {
  const { sb, user } = await getUser();
  // status=watching при добавлении в избранное (если не archived), early остаётся early.
  // При снятии из избранного — возвращается в свой natural status (early/new).
  const updates: any = { is_favorite: value, last_updated_at: new Date().toISOString() };
  if (value) {
    // Добавили в избранное → status=watching (вкладка "Наблюдение")
    updates.status = "watching";
  } else {
    // Сняли из избранного → возврат в статус в зависимости от текущих present_in_*.
    // Worker всё равно обновит на следующем проходе, но сразу синхронизируем.
    const { data: row } = await sb
      .from("radar_queries")
      .select("present_in_wb, present_in_ozon")
      .eq("id", queryId)
      .eq("seller_id", user.id)
      .maybeSingle();
    updates.status = (row?.present_in_wb || row?.present_in_ozon) ? "new" : "early";
  }
  await sb.from("radar_queries")
    .update(updates)
    .eq("id", queryId)
    .eq("seller_id", user.id);

  await logAction(sb, user.id, queryId, value ? "query_favorited" : "query_unfavorited");
  revalidatePath("/dashboard/radar");
}

export async function actionArchiveQuery(queryId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_queries")
    .update({
      status: "archived",
      is_favorite: false,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", queryId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, queryId, "query_archived");
  revalidatePath("/dashboard/radar");
}

export async function actionUnarchiveQuery(queryId: string) {
  const { sb, user } = await getUser();
  // Возврат в early — worker пересчитает на следующем проходе.
  await sb.from("radar_queries")
    .update({
      status: "early",
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", queryId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, queryId, "query_unarchived");
  revalidatePath("/dashboard/radar");
}

export async function actionApproveBrand(brandId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_brands")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, null, "brand_approved");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}

export async function actionExcludeBrand(brandId: string) {
  const { sb, user } = await getUser();
  await sb.from("radar_brands")
    .update({ status: "excluded", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .eq("seller_id", user.id);
  await logAction(sb, user.id, null, "brand_excluded");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}

export async function actionAddBrandManual(name: string) {
  const { sb, user } = await getUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("empty");
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  // Лимит брендов из тарифа.
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();
  const { count } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "approved");
  const limit = seller?.radar_brands_limit ?? 0;
  if ((count ?? 0) >= limit) {
    throw new Error(`Превышен лимит брендов (${limit}). Перейдите на старший тариф.`);
  }
  await sb.from("radar_brands").upsert({
    seller_id: user.id,
    name: trimmed,
    name_normalized: normalized,
    source: "manual",
    status: "approved",
  }, { onConflict: "seller_id,name_normalized" });
  await logAction(sb, user.id, null, "brand_added_manual");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");
}

/**
 * Массовое добавление брендов руками без AI-обработки прайса.
 * Use case: у селлера есть готовый список брендов (например 30 марок),
 * прайс ему лень загружать. Он вставляет в textarea одним блоком —
 * каждая строка/запятая = один бренд.
 *
 * Парсинг:
 *   - Разделители: \n (любой переход строки), запятая, точка с запятой, табуляция
 *   - Trim каждой строки, пропускаем пустые
 *   - Дедуп по normalized name внутри input'а
 *   - Дедуп с существующими brand'ами селлера (upsert разрулит)
 *
 * Лимит тарифа:
 *   - Если currently_approved + новые_approved > limit, кидаем ошибку с
 *     точным сообщением сколько штук убрать
 *   - Существующие excluded бренды при upsert переходят в approved
 *     (поведение совпадает с одиночным actionAddBrandManual)
 *
 * Returns:
 *   { added: N, skipped: M, totalApproved: K }
 */
export async function actionAddBrandsBulkManual(rawInput: string): Promise<{
  added: number;
  skipped: number;
  totalApproved: number;
}> {
  const { sb, user } = await getUser();

  // 1. Парсим список — разделители \n, ,, ;, \t
  const tokens = rawInput
    .split(/[\n,;\t]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Список пустой");
  }
  if (tokens.length > 200) {
    throw new Error(`Слишком много брендов за раз: ${tokens.length}. Максимум 200.`);
  }

  // 2. Внутренний дедуп по normalized name
  const uniqueMap = new Map<string, string>();  // normalized → display name
  for (const t of tokens) {
    if (t.length < 2 || t.length > 60) continue;  // длина 2-60 как в /api/radar/brands
    const norm = t.toLowerCase().replace(/\s+/g, " ");
    if (!uniqueMap.has(norm)) uniqueMap.set(norm, t);
  }
  const unique = [...uniqueMap.entries()];
  if (unique.length === 0) {
    throw new Error("Все названия слишком короткие (<2) или длинные (>60)");
  }

  // 3. Считаем лимит
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();
  const limit = seller?.radar_brands_limit ?? 0;

  // 4. Сколько уже approved (не считая тех что мы сейчас добавляем — upsert разрулит)
  const existingNormalized = unique.map(([norm]) => norm);
  const { data: existingBrands } = await sb
    .from("radar_brands")
    .select("id, name_normalized, status")
    .eq("seller_id", user.id)
    .in("name_normalized", existingNormalized);

  const existingByNorm = new Map<string, { id: string; status: string }>();
  for (const b of (existingBrands ?? []) as any[]) {
    existingByNorm.set(b.name_normalized, { id: b.id, status: b.status });
  }

  // approved бренды НЕ из нашего списка
  const { count: otherApprovedCount } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "approved")
    .not("name_normalized", "in", `(${existingNormalized.map(n => `"${n.replace(/"/g, '\\"')}"`).join(",")})`);

  // Будущее количество approved: остальные + все из нашего списка (мы все добавляем как approved)
  const futureApproved = (otherApprovedCount ?? 0) + unique.length;
  if (futureApproved > limit) {
    throw new Error(
      `Лимит тарифа: ${limit} брендов. После добавления будет ${futureApproved}. ` +
      `Уберите ${futureApproved - limit} из списка или перейдите на старший тариф.`,
    );
  }

  // 5. Batch upsert одним запросом
  const rows = unique.map(([norm, displayName]) => ({
    seller_id: user.id,
    name: displayName,
    name_normalized: norm,
    source: "manual" as const,
    status: "approved" as const,
  }));
  const { error: upsertError } = await sb
    .from("radar_brands")
    .upsert(rows, { onConflict: "seller_id,name_normalized" });

  if (upsertError) {
    throw new Error(`Ошибка БД: ${upsertError.message}`);
  }

  await logAction(sb, user.id, null, "brands_bulk_added_manual");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");

  // Считаем точные числа для возврата:
  // - added: те которых вообще не было ИЛИ были excluded (стали approved)
  // - skipped: те которые уже были approved (для них upsert noop по status)
  let added = 0;
  let skipped = 0;
  for (const [norm] of unique) {
    const ex = existingByNorm.get(norm);
    if (!ex || ex.status !== "approved") added++;
    else skipped++;
  }

  return {
    added,
    skipped,
    totalApproved: futureApproved,
  };
}

/**
 * Массовое подтверждение брендов из ревью прайса.
 * Фишка из обсуждения с Александром 28.05.2026 — после загрузки прайса
 * селлер видит таблицу с галочками и одной кнопкой подтверждает выбор.
 *
 * approvedIds — те что надо сделать approved (галочка стоит).
 * excludedIds — те что надо сделать excluded (галочка снята).
 *
 * Проверяем лимит тарифа: если approvedIds + текущие approved (которые
 * НЕ входят в excludedIds) превышают лимит — кидаем ошибку с количеством.
 */
export async function actionBulkUpdateBrands(
  approvedIds: string[],
  excludedIds: string[],
) {
  const { sb, user } = await getUser();

  // Лимит тарифа
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_brands_limit")
    .eq("id", user.id)
    .maybeSingle();
  const limit = seller?.radar_brands_limit ?? 0;

  // Сколько approved останется ПОСЛЕ операции:
  //   currently_approved - те что excluded (часть из excludedIds может быть approved)
  //   + approvedIds (те что хотим включить)
  // Считаем точно: смотрим текущее состояние всех затронутых брендов.
  const allIds = [...new Set([...approvedIds, ...excludedIds])];
  if (allIds.length === 0) return { changed: 0 };

  const { data: existing } = await sb
    .from("radar_brands")
    .select("id, status")
    .eq("seller_id", user.id)
    .in("id", allIds);

  // Текущие approved селлера (не в нашем списке)
  const { count: otherApproved } = await sb
    .from("radar_brands")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("status", "approved")
    .not("id", "in", `(${allIds.join(",")})`);

  const futureApprovedCount = (otherApproved ?? 0) + approvedIds.length;
  if (futureApprovedCount > limit) {
    throw new Error(
      `Лимит тарифа: ${limit} брендов. Выбрано ${futureApprovedCount} — снимите галочки с ${futureApprovedCount - limit} или перейдите на старший тариф.`,
    );
  }

  // Bulk update: два запроса вместо N
  const updatedAt = new Date().toISOString();
  if (approvedIds.length > 0) {
    await sb.from("radar_brands")
      .update({ status: "approved", updated_at: updatedAt })
      .eq("seller_id", user.id)
      .in("id", approvedIds);
  }
  if (excludedIds.length > 0) {
    await sb.from("radar_brands")
      .update({ status: "excluded", updated_at: updatedAt })
      .eq("seller_id", user.id)
      .in("id", excludedIds);
  }

  await logAction(sb, user.id, null, "brands_bulk_updated");
  revalidatePath("/dashboard/radar");
  revalidatePath("/dashboard/radar/brands");

  return { changed: approvedIds.length + excludedIds.length };
}
