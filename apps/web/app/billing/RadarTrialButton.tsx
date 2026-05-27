"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionStartRadarTrial } from "./actions";

export function RadarTrialButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await actionStartRadarTrial();
        router.push("/dashboard/radar");
        router.refresh();
      } catch (e: any) {
        setError(e.message ?? "Ошибка");
      }
    });
  };

  return (
    <>
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center px-6 py-3 rounded-lg bg-azure text-paper font-mono uppercase tracking-wider text-sm font-semibold hover:bg-azure/90 disabled:opacity-60 transition"
      >
        {pending ? "Активируем…" : "Активировать Trial бесплатно"}
      </button>
      {error && <p className="mt-2 text-xs text-rose">{error}</p>}
    </>
  );
}
