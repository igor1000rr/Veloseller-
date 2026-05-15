import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";

/**
 * POST /api/connections — создание connection с шифрованием sensitive полей.
 *
 * Поля config, которые шифруются (если SECRET_ENCRYPTION_KEY задан):
 *   - ozon: client_id, api_key
 *   - wildberries: token
 */
const SENSITIVE_KEYS_BY_MARKETPLACE: Record<string, string[]> = {
  ozon: ["client_id", "api_key"],
  wildberries: ["token"],
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!source) return NextResponse.json({ error: "source обязателен" }, { status: 400 });

  // Шифруем sensitive ключи, если включено
  const encryptedConfig = { ...(config ?? {}) };
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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
