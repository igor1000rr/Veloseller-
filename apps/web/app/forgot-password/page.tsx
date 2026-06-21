"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icons } from "../_components/Icons";
import { t } from "@/lib/i18n";

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
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-paper-warm relative overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[500px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }} />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 md:px-6 py-12">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Icons.Logo size={32} />
          <span className="font-display text-xl font-medium tracking-tight">
            Velo<span className="text-lime-deep">seller</span>
          </span>
        </Link>
        <div className="rounded-2xl border border-line bg-paper p-7 md:p-8 shadow-[0_20px_50px_-20px_rgba(10,10,8,0.15)]">
          <h1 className="font-display text-2xl md:text-3xl tracking-tight font-medium">{t("auth.forgot.title")}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{t("auth.forgot.subtitle")}</p>
          {sent ? (
            <div className="mt-6 rounded-lg border border-lime-deep/30 bg-lime-soft p-4">
              <div className="flex items-center gap-2 text-lime-deep font-semibold">
                <Icons.Check /> {t("auth.forgot.sent")}
              </div>
              <p className="mt-2 text-sm text-ink-muted">{t("auth.forgot.checkEmail", { email })}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">{t("auth.email")}</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg-soft px-4 py-3 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
              </div>
              {error && (
                <div className="rounded-lg border border-rose/30 bg-rose/10 p-3 text-sm text-rose">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-4 py-3 font-semibold hover:bg-ink-soft disabled:opacity-50 transition">
                {loading ? t("auth.forgot.submitting") : (<>{t("auth.forgot.submit")} <Icons.ArrowRight /></>)}
              </button>
            </form>
          )}
          <div className="mt-5 text-center">
            <Link href={"/login"} className="text-sm text-ink-muted hover:text-lime-deep transition">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
