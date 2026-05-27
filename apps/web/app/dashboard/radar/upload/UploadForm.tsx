"use client";
import { useState } from "react";

export function UploadForm({ brandsLimit }: { brandsLimit: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress("Загружаем файл...");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/radar/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Ошибка ${res.status}`);
        setUploading(false);
        setProgress(null);
        return;
      }

      const data = await res.json();
      // После успешной загрузки переходим на страницу проверки извлечённых брендов
      window.location.href = `/dashboard/radar/upload/${data.uploadId}/review`;
    } catch (e) {
      setError("Ошибка соединения");
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-paper p-6">
      <label className="block">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-2">
          Файл прайса
        </div>

        <div className="rounded-xl border-2 border-dashed border-line hover:border-lime-deep/40 transition p-8 text-center">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className="hidden"
            id="price-file"
          />
          <label htmlFor="price-file" className="cursor-pointer">
            {file ? (
              <div>
                <div className="font-medium text-ink">{file.name}</div>
                <div className="text-xs text-ink-muted mt-1">
                  {(file.size / 1024).toFixed(0)} КБ — нажмите чтобы выбрать другой
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium text-ink-muted">Перетащите файл или нажмите для выбора</div>
                <div className="text-xs text-ink-hush mt-1">XLSX, XLS или CSV · до 10 МБ · до 50 000 строк</div>
              </div>
            )}
          </label>
        </div>
      </label>

      <div className="mt-4 rounded-lg bg-bg-soft p-3 text-xs text-ink-muted leading-relaxed">
        <strong className="text-ink">Что нужно в прайсе:</strong> хотя бы один столбец с названием товара. ИИ найдёт бренды независимо от формата.
        Желательно также столбцы с ценой и количеством SKU — это поможет отсортировать бренды по важности.
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose/30 bg-rose/5 p-3 text-sm text-rose">
          {error}
        </div>
      )}

      {progress && (
        <div className="mt-4 rounded-lg border border-azure/30 bg-azure/5 p-3 text-sm text-azure">
          {progress}
        </div>
      )}

      <button
        type="submit"
        disabled={!file || uploading}
        className="mt-4 w-full px-4 py-3 rounded-lg bg-ink text-paper font-semibold hover:bg-ink-soft disabled:opacity-50 transition"
      >
        {uploading ? "Обрабатываем..." : "Загрузить и извлечь бренды"}
      </button>

      <p className="mt-3 text-xs text-ink-hush text-center">
        ИИ извлечёт до {brandsLimit} брендов. После обработки вы сможете убрать ненужные.
      </p>
    </form>
  );
}
