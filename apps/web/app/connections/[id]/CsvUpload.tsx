"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../_components/Icons";
import { ErrorModal } from "../../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

/**
 * Загрузка CSV в склад типа csv (source=csv_upload).
 * POST multipart → /api/connections/[id]/upload-csv → worker /ingest/csv/[id].
 * После успешной загрузки обновляем страницу (снапшоты/KPI пересчитаются).
 */
export default function CsvUpload({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ parsed: number; inserted: number } | null>(null);
  const [modalError, setModalError] = useState<ParsedError | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setModalError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/connections/${connectionId}/upload-csv`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModalError(parseApiError(data, "Не удалось загрузить файл"));
        return;
      }
      setResult({ parsed: data.parsed ?? 0, inserted: data.inserted ?? 0 });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || String(e), "Не удалось связаться с сервером"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-paper p-5 md:p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
        Загрузка CSV
      </h2>
      <p className="text-sm text-ink-muted mb-4">
        Колонки: <code className="font-mono text-[12px] bg-bg-soft border border-line rounded px-1.5 py-0.5">sku, stock_quantity, price</code>{" "}
        (<span className="font-mono text-[12px]">product_name</span> — необязательно). Первая строка — заголовки, кодировка UTF-8.
        Excel: «Сохранить как → CSV».
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => { setResult(null); setFile(e.target.files?.[0] ?? null); }}
          className="block text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-bg-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-line/40 file:cursor-pointer"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2.5 text-sm font-semibold hover:bg-ink-soft disabled:opacity-50 transition"
        >
          {loading ? "Загрузка…" : (<>Загрузить <Icons.ArrowRight size={13} /></>)}
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded-lg border border-lime-deep/30 bg-lime-soft p-3 text-sm text-ink">
          Загружено: <b>{result.inserted}</b> {result.inserted === result.parsed ? "" : `из ${result.parsed} `}
          позиций. Метрики пересчитываются — обновите страницу через минуту.
        </div>
      )}

      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </div>
  );
}
