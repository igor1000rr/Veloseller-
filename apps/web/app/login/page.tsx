"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icons } from "../_components/Icons";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(redirect as any);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg-soft px-4 py-3 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
        />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Пароль</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg-soft px-4 py-3 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
        />
      </div>
      {error && (
        <div className="rounded-lg border border-rose/30 bg-rose/10 p-3 text-sm text-rose flex items-start gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest mt-0.5">err</span>
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-4 py-3 font-semibold hover:bg-ink-soft disabled:opacity-50 transition"
      >
        {loading ? "Входим…" : (<>Войти <Icons.ArrowRight /></>)}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-paper-warm relative overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 size-[500px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 size-[400px] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.15), transparent 70%)" }} />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 md:px-6 py-12">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Icons.Logo size={32} />
          <span className="font-display text-xl font-medium tracking-tight">
            Velo<span className="text-lime-deep">seller</span>
          </span>
        </Link>
        <div className="rounded-2xl border border-line bg-paper p-7 md:p-8 shadow-[0_20px_50px_-20px_rgba(10,10,8,0.15)]">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-lime-deep/30 bg-lime-soft mb-4">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime-deep font-semibold">Login</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">С возвращением</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Войди в личный кабинет</p>
          <Suspense fallback={<div className="mt-6 text-sm text-ink-hush">Загрузка…</div>}>
            <LoginForm />
          </Suspense>
          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href={"/forgot-password" as any} className="text-ink-muted hover:text-lime-deep transition">
              Забыли пароль?
            </Link>
            <Link href={"/register" as any} className="text-ink hover:text-lime-deep transition font-medium">
              Регистрация
            </Link>
          </div>
        </div>
        <Link href="/" className="mt-6 text-center text-sm text-ink-hush hover:text-ink transition inline-flex items-center gap-1 justify-center">
          <span className="rotate-180"><Icons.ArrowRight size={12} /></span> На главную
        </Link>
      </div>
    </main>
  );
}
