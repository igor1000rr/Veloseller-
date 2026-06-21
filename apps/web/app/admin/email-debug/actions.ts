"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth";

/**
 * Server action: отправить тестовый email через Resend SDK.
 *
 * Проверяет:
 *  — пользователь авторизован и в ADMIN_EMAILS (двойная проверка помимо layout.tsx)
 *  — RESEND_API_KEY задан
 *  — email выглядит как email
 *
 * Возвращает { ok, message } — форма покажет результат человеку.
 */

export async function sendTestEmail(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Не авторизован" };
    if (!isAdminEmail(user.email)) {
      return { ok: false, message: "Нет доступа (не в ADMIN_EMAILS)" };
    }

    const to = String(formData.get("to") || "").trim();
    if (!to || !to.includes("@")) {
      return { ok: false, message: "Неверный email" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { ok: false, message: "RESEND_API_KEY не задан в .env.production" };
    }

    const from = process.env.RESEND_FROM || "Veloseller <noreply@veloseller.ru>";

    // Дырняем Resend HTTP API напрямую — без SDK, чтобы не тащить зависимость в web.
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Veloseller — тестовый email из админки",
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;padding:24px;max-width:600px;margin:0 auto">
<h2 style="color:#0f766e;margin:0 0 16px">Это тест</h2>
<p>Письмо отправлено из <code>/admin/email-debug</code> в ${new Date().toLocaleString("ru-RU")}.</p>
<p style="color:#64748b;font-size:13px">Если вы его видите — отправка работает корректно.</p>
<p style="color:#64748b;font-size:12px;margin-top:32px">Resend · from: ${from}</p>
</body></html>`,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, message: `Resend ${resp.status}: ${text.slice(0, 300)}` };
    }

    const data = await resp.json().catch(() => ({}));
    const id = (data as any)?.id || "unknown";
    return { ok: true, message: `Отправлено успешно · message_id: ${id}` };
  } catch (e: any) {
    return { ok: false, message: `Исключение: ${e?.message ?? String(e)}` };
  }
}
