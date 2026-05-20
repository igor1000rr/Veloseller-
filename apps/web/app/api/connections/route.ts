import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/connections — создание connection с шифрованием sensitive полей.
 *
 * Поля config, которые шифруются (если SECRET_ENCRYPTION_KEY задан):
 *   - ozon: client_id, api_key
 *   - wildberries: token
 *
 * БАГ 27-30 fix: добавлены rate limit, валидация source/marketplace, лимит размера config,
 * максимум connections per seller.
 * БАГ 78 fix: не светим error.message в response.
 */
const SENSITIVE_KEYS_BY_MARKETPLACE: Record<string, string[]> = {
  ozon: ["client_id", "api_key"],
  wildberries: ["token"],
};

const ALLOWED_SOURCES = new Set([
  "csv_upload", "google_sheet", "marketplace_api", "feed", "manual",
]);
const ALLOWED_MARKETPLACES = new Set([
  "ozon", "wildberries", "amazon", "shopify",
]);

const MAX_CONFIG_BYTES = 10 * 1024;
const MAX_CONNECTIONS_PER_SELLER = 20;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { source, marketplace, name, config } = body as {
    source: string;
    marketplace?: string | null;
    name?: string;
    config?: Record<string, unknown>;
  };

  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "source обязателен" }, { status: 400 });
  }
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
  if (name != null && (typeof name !== "string" || name.length > 200)) {
    return NextResponse.json({ error: "name должен быть строкой ≤200 символов" }, { status: 400 });
  }
  if (config != null && typeof config !== "object") {
    return NextResponse.json({ error: "config должен быть объектом" }, { status: 400 });
  }
  const configSize = config ? JSON.stringify(config).length : 0;
  if (configSize > MAX_CONFIG_BYTES) {
    return NextResponse.json({
      error: `config слишком большой (${configSize} байт > лимита ${MAX_CONFIG_BYTES})`
    }, { status: 400 });
  }

  const { count: existingCount, error: countErr } = await supabase
    .from("data_connections")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);
  if (countErr) {
    console.error("[connections-create] count error:", countErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if ((existingCount ?? 0) >= MAX_CONNECTIONS_PER_SELLER) {
    return NextResponse.json({
      error: `Достигнут лимит подключений (${MAX_CONNECTIONS_PER_SELLER}). Удалите неактивные.`
    }, { status: 400 });
  }

  const encryptedConfig: Record<string, unknown> = { ...(config ?? {}) };
  if (isEncryptionConfigured() && marketplace) {
    const sensitive = SENSITIVE_KEYS_BY_MARKETPLACE[marketplace] ?? [];
    for (const k of sensitive) {
      const v = encryptedConfig[k];
      if (typeof v === "string" && v.length > 0) {
        encryptedConfig[k] = encrypt(v);
      }
    }
    encryptedConfig._encrypted = true;
  }

  const { data, error } = await supabase
    .from("data_connections")
    .insert({
      seller_id: user.id,
      source,
      marketplace: marketplace ?? null,
      name: name ?? source,
      config: encryptedConfig,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[connections-create] insert error:", error.message);
    return NextResponse.json({ error: "Не удалось создать подключение" }, { status: 400 });
  }
  return NextResponse.json({ id: data.id });
}
