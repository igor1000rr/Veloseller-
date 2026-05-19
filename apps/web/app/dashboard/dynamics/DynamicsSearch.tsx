"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DynamicsSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [val, setVal] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(v: string) {
    startTransition(() => {
      if (v.trim()) {
        router.push(`/dashboard/dynamics?q=${encodeURIComponent(v.trim())}` as any);
      } else {
        router.push("/dashboard/dynamics" as any);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(val); }}
        placeholder="Найти по SKU или названию..."
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-sm focus:outline-none focus:border-lime-deep/40 transition w-64"
      />
      {val && (
        <button
          onClick={() => { setVal(""); submit(""); }}
          className="px-2 py-1 rounded border border-line text-xs font-mono uppercase tracking-wider text-ink-muted hover:bg-bg-soft transition"
        >
          сброс
        </button>
      )}
      <button
        onClick={() => submit(val)}
        disabled={pending}
        className="px-3 py-1.5 rounded-md bg-ink text-paper text-xs font-mono uppercase tracking-wider hover:bg-ink-soft disabled:opacity-50 transition"
      >
        {pending ? "..." : "найти"}
      </button>
    </div>
  );
}
