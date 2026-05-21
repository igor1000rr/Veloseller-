import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/connections/[id]/resume — ручное возобновление sync паузованного склада.
 *
 * Когда worker ставит status='paused' из-за 3+ неудач подряд, юзер
 * должен пофиксить причину (новый API ключ, доступ к Sheet, и т.д.) и нажать
 * эту кнопку. Это сбрасывает failure_count=0 и возвращает status='pending'.
 *
 * Следующий sync будет обычным — worker попытается, и если всё ок, склад
 * перейдёт в 'active'. Если опять ошибка — счётчик снова пойдёт с 0.
 *
 * Безопасность: 401 unauthorized, 403 если склад не принадлежит юзеру.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  // Проверяем что склад принадлежит юзеру и действительно в паузе
  const { data: conn, error: getErr } = await supabase
    .from("data_connections")
    .select("id, status")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();
  if (getErr) {
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conn) {
    return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
  }
  if (conn.status !== "paused") {
    return NextResponse.json(
      { error: `Склад не на паузе (текущий статус: ${conn.status})` },
      { status: 409 },
    );
  }

  // Сбрасываем счётчик и возвращаем в pending. Не сразу в active — ждём первый успешный sync.
  const { error: updErr } = await supabase
    .from("data_connections")
    .update({
      status: "pending",
      failure_count: 0,
      error_notified_at: null,
      last_error: null,
    })
    .eq("id", id)
    .eq("seller_id", user.id);
  if (updErr) {
    return NextResponse.json({ error: "Не удалось снять паузу" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Склад возобновлён. Запустите sync вручную или дождитесь следующего авто-расписания." });
}
