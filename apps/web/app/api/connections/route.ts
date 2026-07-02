import { NextRequest, NextResponse } from "next/server";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { SENSITIVE_KEYS_BY_KIND } from "@/lib/connection-secrets";
import type { Json, Enums } from "@/lib/database.types";

/**
 * POST /api/connections — создание склада (data_connection).
 *
 * Multi-warehouse архитектура (май 2026): UI шлёт `warehouse_kind`, сервер
 * выводит из него source+marketplace для совместимости с существующими enum.
 *
 * Шифруются sensitive поля config (если SECRET_ENCRYPTION_KEY задан):
 *   - ozon_fbo / ozon_fbs: client_id, api_key
 *   - wb_fbo / wb_fbs: token
 *   - shopify: access_token
 *
 * Лимит складов берётся из sellers.plan_warehouses_limit (зависит от тарифа):
 *   trial=3, starter=2, growth=6, pro=15
 *
 * Backward compat: если warehouse_kind не пришёл, парсим из source+marketplace.
 */
const ALLOWED_WAREHOUSE_KINDS = new Set([
  "ozon_fbo", "ozon_fbs", "wb_fbo", "wb_fbs", "google_sheet", "shopify",
  // Источники без интеграций (новая концепция «расчёт по движению остатков»):
  "csv", "manual",
]);

// Backward compat для legacy запросов от старого UI
const ALLOWED_SOURCES = new Set([
  "csv_upload", "google_sheet", "marketplace_api", "feed", "manual",
]);
const ALLOWED_MARKETPLACES = new Set([
  "ozon", "wildberries", "amazon", "shopify",
]);

const MAX_CONFIG_BYTES = 10 * 1024;
const MAX_NAME_LENGTH = 200;

/** Выводим source+marketplace из warehouse_kind для записи в enum-колонки. */
function deriveSourceAndMarketplace(kind: string): { source: Enums<"source_type">; marketplace: Enums<"marketplace_kind"> | null } {
  switch (kind) {
    case "ozon_fbo":
    case "ozon_fbs":
      return { source: "marketplace_api", marketplace: "ozon" };
    case "wb_fbo":
    case "wb_fbs":
      return { source: "marketplace_api", marketplace: "wildberries" };
    case "shopify":
      return { source: "marketplace_api", marketplace: "shopify" };
    case "google_sheet":
      return { source: "google_sheet", marketplace: null };
    case "csv":
      return { source: "csv_upload", marketplace: null };
    case "manual":
      return { source: "manual", marketplace: null };
    default:
      return { source: "manual", marketplace: null };
  }
}

/** Обратная операция для legacy запросов без warehouse_kind. */
function deriveWarehouseKind(source: string, marketplace: string | null | undefined): string | null {
  if (source === "google_sheet") return "google_sheet";
  if (source === "marketplace_api") {
    if (marketplace === "ozon") return "ozon_fbo";          // legacy ozon = FBO по умолчанию
    if (marketplace === "wildberries") return "wb_fbo";     // legacy wb = FBO по умолчанию
    if (marketplace === "shopify") return "shopify";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { warehouse_kind, source, marketplace, name, config } = body as {
    warehouse_kind?: string;
    source?: string;
    marketplace?: string | null;
    name?: string;
    config?: Record<string, unknown>;
  };

  // 1. Определяем warehouse_kind: либо явно из body, либо выводим из legacy source+marketplace
  let kind: string | null = null;
  if (warehouse_kind) {
    if (!ALLOWED_WAREHOUSE_KINDS.has(warehouse_kind)) {
      return NextResponse.json({
        error: `Недопустимый warehouse_kind. Допустимы: ${Array.from(ALLOWED_WAREHOUSE_KINDS).join(", ")}`
      }, { status: 400 });
    }
    kind = warehouse_kind;
  } else if (source) {
    // Legacy путь — валидируем source/marketplace и выводим kind
    if (!ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({
        error: `Недопустимый source. Допустимы: ${Array.from(ALLOWED_SOURCES).join(", ")}`
      }, { status: 400 });
    }
    if (marketplace != null) {
      if (typeof marketplace !== "string" || !ALLOWED_MARKETPLACES.has(marketplace)) {
        return NextResponse.json({
          error: `Недопустимый marketplace. Допустимы: ${Array.from(ALLOWED_MARKETPLACES).join(", ")}`
        }, { status: 400 });
      }
    }
    kind = deriveWarehouseKind(source, marketplace ?? null);
    if (!kind) {
      return NextResponse.json({
        error: "Не удалось определить тип склада. Передайте warehouse_kind явно."
      }, { status: 400 });
    }
  } else {
    return NextResponse.json({
      error: "warehouse_kind обязателен"
    }, { status: 400 });
  }

  // 2. Название склада — обязательное поле (Александр: «Название вашего склада, например: …»)
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Название склада обязательно" }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({
      error: `Название должно быть ≤${MAX_NAME_LENGTH} символов`
    }, { status: 400 });
  }

  // 3. config — опциональный объект
  if (config != null && typeof config !== "object") {
    return NextResponse.json({ error: "config должен быть объектом" }, { status: 400 });
  }
  const configSize = config ? JSON.stringify(config).length : 0;
  if (configSize > MAX_CONFIG_BYTES) {
    return NextResponse.json({
      error: `config слишком большой (${configSize} байт > лимита ${MAX_CONFIG_BYTES})`
    }, { status: 400 });
  }

  // 4. Проверяем лимит складов из тарифа.
  // ВАЖНО: чтение лимита — МЯГКАЯ проверка, не блокер создания. Инцидент
  // 11.06.2026: при устаревшем кэше схемы PostgREST (после DDL колонки
  // plan_warehouses_limit) этот select возвращал ошибку → роут отдавал
  // «DB error» и создание ЛЮБОГО склада падало. При этом /connections
  // рендерился, т.к. там maybeSingle + дефолт 15 и ошибка игнорируется.
  // Делаем роут таким же устойчивым: не можем прочитать лимит/счётчик —
  // дефолтим и продолжаем. Реальная запись (INSERT ниже) сама вернёт ошибку,
  // если с правами/БД что-то не так.
  const { data: seller, error: sellerErr } = await supabase
    .from("sellers")
    .select("plan_warehouses_limit, plan")
    .eq("id", user.id)
    .maybeSingle();
  if (sellerErr) {
    console.warn("[connections-create] seller read failed, defaulting limit:", sellerErr.message);
  }
  const limit = seller?.plan_warehouses_limit ?? 15;
  const planName = seller?.plan ?? "текущего тарифа";

  const { count: existingCount, error: countErr } = await supabase
    .from("data_connections")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);
  if (countErr) {
    console.warn("[connections-create] count read failed, skipping limit check:", countErr.message);
  }
  // Лимит применяем только если счётчик реально прочитан — иначе не блокируем.
  if (!countErr && (existingCount ?? 0) >= limit) {
    return NextResponse.json({
      error: `Достигнут лимит складов для тарифа «${planName}» (${limit}). Обновите тариф или удалите неактивные склады.`,
      code: "warehouse_limit_reached",
      limit,
      current: existingCount ?? 0,
    }, { status: 402 }); // 402 Payment Required — семантически правильнее для upgrade required
  }

  // 5. Шифрование sensitive полей.
  // Fail-closed: в проде запрещаем сохранять секреты маркетплейса открытым текстом.
  // Раньше при отсутствии SECRET_ENCRYPTION_KEY ключи молча писались в БД как есть.
  const sensitive = SENSITIVE_KEYS_BY_KIND[kind] ?? [];
  const cfg = (config ?? {}) as Record<string, unknown>;
  const hasSensitiveValues = sensitive.some(
    (k) => typeof cfg[k] === "string" && (cfg[k] as string).length > 0,
  );
  if (hasSensitiveValues && !isEncryptionConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[connections-create] SECRET_ENCRYPTION_KEY не задан — отказ сохранять секреты открытым текстом");
      return NextResponse.json(
        { error: "Шифрование секретов не настроено на сервере. Обратитесь к администратору." },
        { status: 503 },
      );
    }
    console.warn("[connections-create] SECRET_ENCRYPTION_KEY не задан — секреты сохранятся открытым текстом (dev)");
  }

  const encryptedConfig: Record<string, unknown> = { ...(config ?? {}) };
  if (isEncryptionConfigured()) {
    for (const k of sensitive) {
      const v = encryptedConfig[k];
      if (typeof v === "string" && v.length > 0) {
        encryptedConfig[k] = encrypt(v);
      }
    }
    if (sensitive.length > 0) {
      encryptedConfig._encrypted = true;
    }
  }

  // 6. Запись в БД с warehouse_kind
  const { source: derivedSource, marketplace: derivedMarketplace } = deriveSourceAndMarketplace(kind);

  const { data, error } = await supabase
    .from("data_connections")
    .insert({
      seller_id: user.id,
      source: derivedSource,
      marketplace: derivedMarketplace,
      warehouse_kind: kind as Enums<"warehouse_kind">,
      name: name.trim(),
      config: encryptedConfig as Json,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[connections-create] insert error:", error.message);
    return NextResponse.json({ error: "Не удалось создать склад" }, { status: 400 });
  }
  return NextResponse.json({ id: data.id, warehouse_kind: kind });
}
