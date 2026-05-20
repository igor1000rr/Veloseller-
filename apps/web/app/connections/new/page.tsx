"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icons } from "../../_components/Icons";
import { ErrorModal } from "../../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

type SourceKind = "google_sheet" | "ozon" | "wildberries" | "shopify" | "amazon";

type SourceMeta = {
  kind: SourceKind;
  title: string;
  text: string;
  dot: string;
  status: "ready" | "wip";
};

// Порядок по правкам Игоря: OZON, WB, Google Sheet, Shopify, Amazon. CSV убран.
const SOURCES: SourceMeta[] = [
  { kind: "ozon",         title: "Ozon API",       text: "Read-only ключ из личного кабинета Ozon.",                          dot: "#005bff", status: "ready" },
  { kind: "wildberries",  title: "Wildberries",    text: "Статистический токен WB — только чтение остатков и цен.",           dot: "#a71179", status: "ready" },
  { kind: "google_sheet", title: "Google Sheet",   text: "Доступ только для чтения таблицы Google Sheet.",                    dot: "#0F9D58", status: "ready" },
  { kind: "shopify",      title: "Shopify",        text: "OAuth-подключение к Shopify Admin API. Скоро появится.",            dot: "#95BF47", status: "wip" },
  { kind: "amazon",       title: "Amazon SP-API",  text: "Amazon Selling Partner API — в процессе одобрения роли Amazon.",    dot: "#FF9900", status: "wip" },
];

export default function NewConnectionPage() {
  const router = useRouter();
  const [kind, setKind] = useState<SourceKind | null>(null);
  const selected = SOURCES.find((s) => s.kind === kind);

  return (
    <>
      <Link href={"/connections" as any} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> К источникам
      </Link>

      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Новый источник</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">Новый источник</h1>
        <p className="mt-1 text-ink-muted text-sm">Выбери вариант подключения</p>
      </div>

      {!kind ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOURCES.map((s) => (
            <SourceCard key={s.kind} source={s} onClick={() => setKind(s.kind)} />
          ))}
        </div>
      ) : selected?.status === "wip" ? (
        <WipPanel source={selected} onCancel={() => setKind(null)} />
      ) : (
        <KindForm kind={kind} onCancel={() => setKind(null)} onDone={() => router.push("/connections")} />
      )}
    </>
  );
}

function SourceCard({ source, onClick }: { source: SourceMeta; onClick: () => void }) {
  const wip = source.status === "wip";
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl border bg-paper p-6 text-left transition hover:shadow-md ${
        wip ? "border-line opacity-90 hover:border-orange/40" : "border-line hover:border-lime-deep/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="size-3 rounded-full" style={{ background: source.dot }} />
        {wip ? (
          <span className="font-mono text-[9.5px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-2 py-0.5 rounded">
            в разработке
          </span>
        ) : (
          <span className="font-mono text-[9.5px] text-lime-deep uppercase tracking-[0.18em] font-semibold">ready</span>
        )}
      </div>
      <div className="mt-4 font-display text-xl font-medium text-ink">{source.title}</div>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{source.text}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-mono text-ink-hush group-hover:text-lime-deep transition">
        <span>{wip ? "узнать больше" : "подключить"}</span>
        <Icons.ArrowRight size={11} />
      </div>
    </button>
  );
}

function WipPanel({ source, onCancel }: { source: SourceMeta; onCancel: () => void }) {
  const isShopify = source.kind === "shopify";
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> К выбору
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="size-3 rounded-full" style={{ background: source.dot }} />
        <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">{source.title}</h2>
        <span className="font-mono text-[10px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-2 py-0.5 rounded">
          в разработке
        </span>
      </div>

      <p className="mt-4 text-ink-muted leading-relaxed">
        {isShopify
          ? "Интеграция с Shopify Admin GraphQL API. Подключение через OAuth — разрешаешь read_inventory_items, read_products, read_orders, и мы начинаем синхронизировать остатки и продажи каждые 6 часов."
          : "Интеграция с Amazon Selling Partner API. Подключение через Login with Amazon (LWA OAuth), используем Reports API по FBA Inventory + Sales для регионов NA / EU / FE."}
      </p>

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {(isShopify
          ? [
              ["OAuth flow",          "в работе"],
              ["Остатки и продажи",  "план"],
              ["Расписание синка",  "план"],
            ]
          : [
              ["Заявка на роль",      "подана"],
              ["LWA OAuth",           "в работе"],
              ["Reports API poller",  "план"],
            ]).map(([label, status]) => (
          <div key={label} className="rounded-lg border border-line bg-bg-soft p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
            <div className="mt-1 font-mono text-sm text-ink">{status}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-lime-deep/30 bg-lime-soft p-4 flex items-start gap-3">
        <span className="text-lime-deep mt-0.5"><Icons.Bell /></span>
        <div>
          <div className="font-medium text-ink">Оповестить, когда будет готово</div>
          <p className="mt-1 text-sm text-ink-muted">Напишем на твой email как только сделаем {source.title}. Пока что подключи Ozon, Wildberries или Google Sheet — это работает уже сейчас.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
      >
        Вернуться к выбору <Icons.ArrowRight />
      </button>
    </div>
  );
}

function KindForm({ kind, onCancel, onDone }: { kind: SourceKind; onCancel: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [modalError, setModalError] = useState<ParsedError | null>(null);
  const [loading, setLoading] = useState(false);

  const [sheetId, setSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A:E");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wbToken, setWbToken] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setModalError({ kind: "permission", title: "Сессия истекла", message: "Войдите заново чтобы продолжить." });
        return;
      }

      let source: string;
      let marketplace: string | null = null;
      let config: Record<string, unknown> = {};

      if (kind === "google_sheet") {
        source = "google_sheet";
        config = { sheet_id: sheetId, range: sheetRange };
      } else if (kind === "ozon") {
        source = "marketplace_api";
        marketplace = "ozon";
        config = { client_id: clientId, api_key: apiKey };
      } else {
        source = "marketplace_api";
        marketplace = "wildberries";
        config = { token: wbToken };
      }

      const createRes = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, marketplace, name: name || sourceTitle(kind), config }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setModalError(parseApiError(data, "Не удалось создать подключение"));
        return;
      }
      const conn = await createRes.json() as { id: string };

      const res = await fetch(`/api/connections/${conn.id}/sync`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(parseApiError(data, "Первая синхронизация не прошла"));
        return;
      }
      onDone();
    } catch (err: any) {
      setModalError(parseApiError(err?.message || String(err), "Не удалось связаться с сервером"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-paper p-6 md:p-8 space-y-5">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition">
          <span className="rotate-180"><Icons.ArrowRight size={12} /></span> К выбору
        </button>

        <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">{sourceTitle(kind)}</h2>

        {/* Инструкция по правкам Игоря — над полями формы */}
        {kind === "ozon" && <OzonInstructions />}
        {kind === "wildberries" && <WbInstructions />}
        {kind === "google_sheet" && <SheetInstructions />}

        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Название (для себя)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Мой магазин Ozon"
            className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
          />
        </div>

        {kind === "google_sheet" && (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Sheet ID</label>
              <input required value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="из ссылки на таблицу"
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Range</label>
              <input required value={sheetRange} onChange={(e) => setSheetRange(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
              <p className="mt-1.5 font-mono text-[11px] text-ink-hush">Колонки: артикул, наименование, цена, сток, snapshot_time (опц.).</p>
            </div>
          </>
        )}

        {kind === "ozon" && (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Client-Id</label>
              <input required value={clientId} onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Api-Key</label>
              <input required type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            </div>
          </>
        )}

        {kind === "wildberries" && (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Статистический токен</label>
            <input required type="password" value={wbToken} onChange={(e) => setWbToken(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-4 py-3 font-semibold hover:bg-ink-soft disabled:opacity-50 transition">
          {loading ? "Подключаем…" : (<>Подключить и синхронизировать <Icons.ArrowRight /></>)}
        </button>
      </form>

      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}

// ============================================================
// Инструкции для каждой интеграции (по правкам Игоря)
// ============================================================

function OzonInstructions() {
  return (
    <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
      <h3 className="font-display text-base font-medium text-ink mb-3">Как получить ключ</h3>
      <p className="text-ink-soft mb-2">
        Кабинет OZON → <b>Настройки → Seller API</b> → скопируйте <b>Client&nbsp;ID</b> в сервис
        и нажмите <b>Сгенерировать ключ</b>.
      </p>
      <ol className="list-decimal list-inside space-y-1 text-ink-muted">
        <li>Название ключа — произвольное</li>
        <li>Цель использования — <b>Для внешнего сервиса, приложения</b></li>
        <li>Название сервиса — <b>Veloseller</b></li>
        <li>Тип токена — <b>Product read-only</b></li>
        <li>Нажать <b>Сгенерировать</b></li>
        <li>Скопировать ключ в Veloseller в поле <b>Api-Key</b></li>
      </ol>
    </div>
  );
}

function WbInstructions() {
  return (
    <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
      <h3 className="font-display text-base font-medium text-ink mb-3">Как получить токен</h3>
      <p className="text-ink-soft mb-2">
        Кабинет WB → <b>Профиль → Интеграции по API</b> → <b>Создать токен</b>.
      </p>
      <ol className="list-decimal list-inside space-y-1 text-ink-muted">
        <li>Для интеграции — <b>вручную</b></li>
        <li>Тип токена — <b>Базовый токен</b></li>
        <li>Название токена — произвольное</li>
        <li>Категории — <b>Статистика</b></li>
        <li>Уровень доступа — <b>Только чтение</b></li>
        <li>Нажать <b>Создать токен</b></li>
        <li>Скопировать в поле <b>Статистический токен</b></li>
      </ol>
    </div>
  );
}

function SheetInstructions() {
  return (
    <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
      <h3 className="font-display text-base font-medium text-ink mb-3">Как открыть доступ и заполнить поля</h3>
      <p className="text-ink-soft mb-2">
        Таблица Google Sheet → <b>Файл → Поделиться → Открыть доступ</b> → <b>Общий доступ → Все, у кого есть ссылка</b> → <b>Скопировать ссылку</b>.
      </p>
      <div className="space-y-3">
        <div>
          <div className="font-medium text-ink mb-1">1. Sheet ID — внутри ссылки</div>
          <p className="text-ink-muted">Пример ссылки:</p>
          <code className="block bg-paper border border-line rounded px-2 py-1 mt-1 font-mono text-[11px] text-ink-soft break-all">
            https://docs.google.com/spreadsheets/d/<span className="text-lime-deep font-semibold">1XDhI5m7F0adlN8petoJhkX5CGHRQxLRaBezPcTzOaY</span>/edit?usp=sharing
          </code>
          <p className="mt-2 text-ink-muted">
            Sheet&nbsp;ID:{" "}
            <code className="bg-paper border border-line rounded px-1.5 py-0.5 font-mono text-[11px]">
              1XDhI5m7F0adlN8petoJhkX5CGHRQxLRaBezPcTzOaY
            </code>
          </p>
        </div>
        <div>
          <div className="font-medium text-ink mb-1">2. Range — диапазон со столбцами</div>
          <p className="text-ink-muted">
            Названия столбцов с данными: <b>Артикул, Наименование, Цена, Сток</b>.
          </p>
          <p className="mt-1 text-ink-muted">
            Пример:{" "}
            <code className="bg-paper border border-line rounded px-1.5 py-0.5 font-mono text-[11px]">
              Sheet1!A:E
            </code>
            , где <b>Sheet1</b> — название листа, <b>!</b> — разделитель, <b>A:E</b> — диапазон ячеек с данными.
          </p>
        </div>
      </div>
    </div>
  );
}

function sourceTitle(kind: SourceKind): string {
  return ({
    google_sheet: "Google Sheet",
    ozon:         "Ozon API",
    wildberries:  "Wildberries API",
    shopify:      "Shopify",
    amazon:       "Amazon SP-API",
  } as const)[kind];
}
