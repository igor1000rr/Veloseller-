"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/radar/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "unknown" }));
      setError(err.error ?? `HTTP ${res.status}`);
      return;
    }
    // Правка Александра (#0): НЕ уводим пользователя со страницы прайсов —
    // остаёмся здесь, где «История загрузок» сразу покажет статус, число строк
    // и извлечённых брендов. Явный следующий шаг — ссылка на бренды ниже.
    setDone(true);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-paper p-6 md:p-8">
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => { setFile(e.target.files?.[0] ?? null); setDone(false); }}
        className="block w-full text-sm text-ink-muted file:mr-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-ink file:text-paper file:font-mono file:uppercase file:text-xs file:tracking-wider file:font-semibold hover:file:bg-ink-soft cursor-pointer"
      />
      {file && (
        <div className="mt-3 text-xs font-mono text-ink-hush">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!file || pending}
          className="inline-flex items-center rounded-lg bg-lime-deep text-paper px-5 py-2.5 text-sm font-mono uppercase tracking-wider font-semibold hover:bg-lime-deep/90 disabled:opacity-40 transition"
        >
          {pending ? "Обработка…" : "Извлечь бренды"}
        </button>
        {error && <span className="text-xs text-rose">{error}</span>}
      </div>
      <p className="mt-3 text-xs text-ink-hush leading-relaxed">
        Формат: CSV (UTF-8) или XLSX. До 50 МБ. ИИ извлечёт бренды и составит
        список для финальной редакции пользователя.
      </p>
      {done && (
        <div className="mt-4 rounded-lg border border-lime-deep/40 bg-lime-soft px-4 py-3 text-sm">
          <span className="text-ink">Прайс обработан — статус, число строк и брендов смотрите в истории ниже.</span>{" "}
          <Link href={"/dashboard/radar/brands" as any} className="font-semibold text-lime-deep hover:underline whitespace-nowrap">
            Перейти к брендам →
          </Link>
        </div>
      )}
    </div>
  );
}
