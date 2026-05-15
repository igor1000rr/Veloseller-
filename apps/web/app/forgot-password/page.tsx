"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Восстановление пароля</h1>
        <p className="text-slate-600 mb-6 text-sm">Введите email — пришлём ссылку для сброса.</p>

        {sent ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-4 text-sm">
            Письмо отправлено на <strong>{email}</strong>. Проверьте почту (и папку «Спам»).
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {loading ? "Отправка…" : "Отправить ссылку"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-600 mt-6">
          <Link href="/login" className="text-teal-700 hover:underline">← Вернуться к входу</Link>
        </p>
      </div>
    </main>
  );
}
