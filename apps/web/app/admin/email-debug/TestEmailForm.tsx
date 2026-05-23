"use client";

import { useState, useTransition } from "react";

type Result = { ok: boolean; message: string } | null;

export function TestEmailForm({
  action,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; message: string }>;
}) {
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const r = await action(fd);
      setResult(r);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          name="to"
          type="email"
          required
          placeholder="кому отправить (email)"
          className="flex-1 min-w-[240px] px-3 py-2 border border-line rounded-lg bg-paper text-sm focus:outline-none focus:border-lime-deep min-h-[40px]"
          defaultValue=""
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-ink text-paper rounded-lg text-sm font-medium hover:bg-ink-soft disabled:opacity-50 min-h-[40px]"
        >
          {pending ? "Отправка…" : "Отправить тест"}
        </button>
      </div>
      {result && (
        <div className={`rounded-lg p-3 text-sm font-mono break-words ${
          result.ok
            ? "bg-lime-soft text-lime-deep border border-lime-deep/30"
            : "bg-rose/10 text-rose border border-rose/30"
        }`}>
          {result.ok ? "✓ " : "✗ "}{result.message}
        </div>
      )}
    </form>
  );
}
