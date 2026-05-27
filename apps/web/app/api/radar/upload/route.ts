import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractBrandsFromFile, normalizeBrandName } from "@/lib/radar/extract-brands";
import crypto from "crypto";

// 50MB лимит на загрузку. Если файл больше — обычно это не прайс, а
// архив. Реальный прайс OZON/WB на 5000 SKU занимает ~2-5 МБ.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // ИИ-запрос ~10-30 сек.

export async function POST(req: NextRequest) {
  // 1. Auth.
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2. Проверка тарифа.
  const { data: seller } = await sb
    .from("sellers")
    .select("radar_plan, radar_brands_limit, radar_active_until")
    .eq("id", user.id)
    .maybeSingle();
  const hasRadar = seller && seller.radar_plan && seller.radar_plan !== "none"
    && (!seller.radar_active_until || new Date(seller.radar_active_until) > new Date());
  if (!hasRadar) {
    return NextResponse.json({ error: "Подключите Radar в /billing" }, { status: 403 });
  }

  // 3. Файл.
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}МБ > 50МБ`
    }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const fileHash = crypto.createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");

  // 4. Создаём запись upload (status=processing) ДО вызова ИИ.
  const admin = createSupabaseAdminClient();
  const { data: uploadRow, error: uploadErr } = await admin
    .from("radar_price_uploads")
    .insert({
      seller_id: user.id,
      file_name: file.name,
      file_size_bytes: file.size,
      file_hash: fileHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (uploadErr || !uploadRow) {
    return NextResponse.json({
      error: "Не удалось создать запись upload: " + (uploadErr?.message ?? "")
    }, { status: 500 });
  }

  const uploadId = uploadRow.id;

  try {
    // 5. Парсим прайс + ИИ.
    const result = await extractBrandsFromFile(buffer, file.name);

    // 6. Вставляем бренды (pending — ждут approve от юзера).
    // Если бренд уже есть в БД (повторная загрузка) — обновляем sku_count/avg_price.
    const brandsToInsert = result.brands.map(b => ({
      seller_id: user.id,
      name: b.name,
      name_normalized: normalizeBrandName(b.name),
      source: "ai" as const,
      status: "approved" as const,  // approved сразу — юзер на странице /brands может исключить
      sku_count: b.sku_count,
      avg_price: b.avg_price,
    }));

    if (brandsToInsert.length > 0) {
      await admin
        .from("radar_brands")
        .upsert(brandsToInsert, { onConflict: "seller_id,name_normalized" });
    }

    // 7. Обновляем запись upload.
    await admin
      .from("radar_price_uploads")
      .update({
        status: "completed",
        rows_total: result.rows_processed,
        ai_provider: result.provider,
        ai_model: result.model,
        ai_input_tokens: result.tokens_input,
        ai_output_tokens: result.tokens_output,
        ai_cost_usd: result.cost_usd,
        ai_response: result.raw_response,
        brands_extracted: result.brands.length,
        brands_approved: result.brands.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    return NextResponse.json({
      success: true,
      upload_id: uploadId,
      brands_count: result.brands.length,
      cost_usd: result.cost_usd,
    });
  } catch (e: any) {
    // Ошибка ИИ / парсинга — фиксируем в upload и возвращаем 500.
    await admin
      .from("radar_price_uploads")
      .update({
        status: "failed",
        error_message: String(e?.message ?? e).slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);
    return NextResponse.json(
      { error: e?.message ?? "Ошибка обработки" },
      { status: 500 }
    );
  }
}
