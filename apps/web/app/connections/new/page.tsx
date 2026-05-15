"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SourceKind = "csv_upload" | "google_sheet" | "ozon" | "wildberries";

export default function NewConnectionPage() {
  const router = useRouter();
  const [kind, setKind] = useState<SourceKind | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/connections" className="text-lg font-bold text-brand-700">← Источники</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900">Новый источник</h1>

        {!kind ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <SourceCard
              title="CSV-загрузка"
              text="Самый простой способ — выгрузить из своей системы и залить файл."
              onClick={() => setKind("csv_upload")}
            />
            <SourceCard
              title="Google Sheet"
              text="Расшарь таблицу нашему service account — будем синхронизироваться по расписанию."
              onClick={() => setKind("google_sheet")}
            />
            <SourceCard
              title="Ozon API"
              text="Read-only ключ из личного кабинета Ozon. Никакого write-доступа."
              onClick={() => setKind("ozon")}
            />
            <SourceCard
              title="Wildberries API"
              text="Статистический токен WB — только чтение остатков и цен."
              onClick={() => setKind("wildberries")}
            />
          </div>
        ) : (
          <KindForm kind={kind} onCancel={() => setKind(null)} onDone={() => router.push("/connections")} />
        )}
      </main>
    </div>
  );
}

function SourceCard({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-brand-600 hover:shadow-sm"
    >
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{text}</div>
    </button>
  );
}

function KindForm({ kind, onCancel, onDone }: { kind: SourceKind; onCancel: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Поля под каждый тип
  const [sheetId, setSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A:E");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wbToken, setWbToken] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Сессия истекла");
        return;
      }

      let source: string;
      let marketplace: string | null = null;
      let config: Record<string, unknown> = {};

      if (kind === "csv_upload") {
        source = "csv_upload";
        if (!csvFile) {
          setError("Выберите CSV-файл");
          return;
        }
      } else if (kind === "google_sheet") {
        source = "google_sheet";
        config = { sheet_id: sheetId, range: sheetRange };
      } else if (kind === "ozon") {
        source = "marketplace_api";
        marketplace = "ozon";
        config = { client_id: clientId, api_key: apiKey }; // TODO: вынести api_key в Supabase Vault
      } else {
        source = "marketplace_api";
        marketplace = "wildberries";
        config = { token: wbToken }; // TODO: вынести в Vault
      }

      // 1) создаём connection через API с серверным шифрованием
      const createRes = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, marketplace, name: name || sourceTitle(kind), config }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setError(data.error ?? "Не удалось создать подключение");
        return;
      }
      const conn = await createRes.json() as { id: string };

      // 2) запускаем первый синк
      if (kind === "csv_upload" && csvFile) {
        const fd = new FormData();
        fd.append("file", csvFile);
        const res = await fetch(`/api/connections/${conn.id}/upload-csv`, { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(`Загрузка CSV не прошла: ${data.error ?? res.statusText}`);
          return;
        }
      } else {
        const res = await fetch(`/api/connections/${conn.id}/sync`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(`Первый синк не прошёл: ${data.error ?? res.statusText}`);
          return;
        }
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <button type="button" onClick={onCancel} className="text-sm text-slate-600 hover:text-brand-700">
        ← Назад к выбору
      </button>

      <h2 className="text-xl font-bold text-slate-900">{sourceTitle(kind)}</h2>

      <div>
        <label className="block text-sm font-medium text-slate-700">Название (для тебя)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Мой магазин Ozon"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </div>

      {kind === "google_sheet" && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700">Sheet ID</label>
            <input
              required
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="из ссылки на таблицу"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Range</label>
            <input
              required
              value={sheetRange}
              onChange={(e) => setSheetRange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Колонки: sku, product_name, price, stock_quantity, snapshot_time (опционально).
            </p>
          </div>
        </>
      )}

      {kind === "ozon" && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700">Client-Id</label>
            <input
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Api-Key</label>
            <input
              required
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
            <p className="mt-1 text-xs text-amber-700">
              Создавай read-only ключ в Ozon Seller → Настройки → API.
            </p>
          </div>
        </>
      )}

      {kind === "wildberries" && (
        <div>
          <label className="block text-sm font-medium text-slate-700">Статистический токен</label>
          <input
            required
            type="password"
            value={wbToken}
            onChange={(e) => setWbToken(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
          />
          <p className="mt-1 text-xs text-amber-700">
            Кабинет WB → Профиль → Доступ к API → Статистика (read-only).
          </p>
        </div>
      )}

      {kind === "csv_upload" && (
        <div>
          <label className="block text-sm font-medium text-slate-700">CSV-файл</label>
          <input
            required
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Колонки: sku, product_name, price, stock_quantity, snapshot_time (опционально).
          </p>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? "Подключаем…" : "Подключить и синхронизировать"}
      </button>
    </form>
  );
}

function sourceTitle(kind: SourceKind): string {
  return {
    csv_upload: "CSV-загрузка",
    google_sheet: "Google Sheet",
    ozon: "Ozon API",
    wildberries: "Wildberries API",
  }[kind];
}
