"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icons } from "../../_components/Icons";
import { ErrorModal } from "../../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";
import { isWarehouseKindEnabled, LOCALE } from "@/lib/features";
import { t } from "@/lib/i18n";

/**
 * Multi-warehouse архитектура (май 2026):
 * 6 типов складов, каждый = отдельная "data_connection" в БД с собственным warehouse_kind.
 * Один Ozon API-ключ → 2 склада (FBO + FBS, остатки берутся по разным фильтрам).
 * Один WB token → 2 склада (FBO через Statistics API + FBS через Marketplace API).
 * Для WB FBS токену нужны категории: Статистика + Маркетплейс + Контент.
 *
 * Правка Александра: после согласия на парный склад название склада сбрасывается
 * на пустое — реализовано через key={kind} на KindForm, что монтирует новый
 * экземпляр компонента и сбрасывает локальный useState с name.
 *
 * Ф0 (мультиверсия): набор карточек фильтруется isWarehouseKindEnabled по
 * ENABLED_MARKETPLACES. РФ-дефолт (ozon+wildberries) показывает всё как раньше;
 * .com скроет Ozon/WB. Google Sheet — ручной источник, доступен везде.
 * .com добавляет Shopify (один склад на магазин, остатки+цены через Admin GraphQL);
 * на РФ-сборке карточка Shopify скрыта тем же фильтром.
 *
 * i18n: на EN рендерятся только карточки Google Sheet + Shopify (Ozon/WB скрыты
 * фильтром), поэтому переведена лишь общая обвязка + Sheet/Shopify. Инструкции
 * Ozon/WB, их карточки, PairSuggestModal и WipPanel остаются на русском —
 * на EN-сборке этот код не выполняется.
 */
type WarehouseKind = "ozon_fbo" | "ozon_fbs" | "wb_fbo" | "wb_fbs" | "google_sheet" | "shopify";

type WarehouseMeta = {
  kind: WarehouseKind;
  title: string;
  text: string;
  dot: string;
  status: "ready" | "wip";
  pair?: WarehouseKind; // для предложения добавить парный склад (FBO ↔ FBS)
};

// Правка Александра: порядок Ozon FBS, Ozon FBO, WB FBS, WB FBO, Google Sheet
const WAREHOUSES: WarehouseMeta[] = [
  {
    kind: "ozon_fbs",
    title: "Ozon FBS",
    text: "Анализ вашего склада через остатки FBS Ozon (товары на вашем складе).",
    dot: "#005bff", status: "ready",
    pair: "ozon_fbo",
  },
  {
    kind: "ozon_fbo",
    title: "Ozon FBO",
    text: "Анализ остатков на складах Ozon (товары на FBO-складах маркетплейса).",
    dot: "#005bff", status: "ready",
    pair: "ozon_fbs",
  },
  {
    kind: "wb_fbs",
    title: "Wildberries FBS",
    text: "Анализ вашего склада через остатки FBS WB (товары на вашем складе). Токен с правами Статистика + Маркетплейс + Контент + Цены и скидки.",
    dot: "#a71179", status: "ready",
    pair: "wb_fbo",
  },
  {
    kind: "wb_fbo",
    title: "Wildberries FBO",
    text: "Анализ остатков на складах WB (товары на FBO-складах маркетплейса).",
    dot: "#a71179", status: "ready",
    pair: "wb_fbs",
  },
  {
    kind: "google_sheet",
    title: "Google Sheet",
    text: t("connections.new.cardText.googleSheet"),
    dot: "#0F9D58", status: "ready",
  },
  {
    kind: "shopify",
    title: "Shopify",
    text: t("connections.new.cardText.shopify"),
    dot: "#95BF47", status: "ready",
  },
];

export default function NewConnectionPage() {
  const router = useRouter();
  const [kind, setKind] = useState<WarehouseKind | null>(null);
  const [pairSuggest, setPairSuggest] = useState<WarehouseKind | null>(null);
  const selected = WAREHOUSES.find((s) => s.kind === kind);

  return (
    <>
      <Link href={"/connections" as any} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> {t("connections.new.back")}
      </Link>

      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("connections.new.title")}</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium">{t("connections.new.title")}</h1>
        <p className="mt-1 text-ink-muted text-sm">{t("connections.new.subtitle")}</p>
      </div>

      {!kind ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WAREHOUSES.filter((s) => isWarehouseKindEnabled(s.kind)).map((s) => (
            <WarehouseCard key={s.kind} warehouse={s} onClick={() => setKind(s.kind)} />
          ))}
        </div>
      ) : selected?.status === "wip" ? (
        <WipPanel warehouse={selected} onCancel={() => setKind(null)} />
      ) : (
        // key={kind} монтирует новый экземпляр KindForm при смене типа —
        // useState внутри (включая name) сбрасывается на дефолт.
        // Правка Александра: после согласия на парный склад название поле пустое.
        <KindForm
          key={kind}
          kind={kind}
          onCancel={() => setKind(null)}
          onDone={() => {
            const meta = WAREHOUSES.find((w) => w.kind === kind);
            const pairKind = meta?.pair;
            const pairMeta = pairKind ? WAREHOUSES.find((w) => w.kind === pairKind) : null;
            if (pairMeta && pairMeta.status === "ready") {
              setPairSuggest(pairKind!);
            } else {
              router.push("/connections");
            }
          }}
        />
      )}

      <PairSuggestModal
        suggest={pairSuggest}
        onDismiss={() => {
          setPairSuggest(null);
          router.push("/connections");
        }}
        onAccept={(newKind) => {
          setPairSuggest(null);
          setKind(newKind);
        }}
      />
    </>
  );
}

function WarehouseCard({ warehouse, onClick }: { warehouse: WarehouseMeta; onClick: () => void }) {
  const wip = warehouse.status === "wip";
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl border bg-paper p-6 text-left transition hover:shadow-md ${
        wip ? "border-line opacity-90 hover:border-orange/40" : "border-line hover:border-lime-deep/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="size-3 rounded-full" style={{ background: warehouse.dot }} />
        {wip ? (
          <span className="font-mono text-[9.5px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-2 py-0.5 rounded">
            {t("connections.new.card.soon")}
          </span>
        ) : (
          <span className="font-mono text-[9.5px] text-lime-deep uppercase tracking-[0.18em] font-semibold">ready</span>
        )}
      </div>
      <div className="mt-4 font-display text-xl font-medium text-ink">{warehouse.title}</div>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{warehouse.text}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-mono text-ink-hush transition">
        <span>{wip ? t("connections.new.card.learnMore") : t("connections.new.card.connect")}</span>
        <Icons.ArrowRight size={11} />
      </div>
    </button>
  );
}

function WipPanel({ warehouse, onCancel }: { warehouse: WarehouseMeta; onCancel: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition mb-4">
        <span className="rotate-180"><Icons.ArrowRight size={12} /></span> К выбору
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="size-3 rounded-full" style={{ background: warehouse.dot }} />
        <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">{warehouse.title}</h2>
        <span className="font-mono text-[10px] text-orange uppercase tracking-[0.18em] font-semibold border border-orange/30 bg-orange/10 px-2 py-0.5 rounded">
          скоро
        </span>
      </div>

      <p className="mt-4 text-ink-muted leading-relaxed">
        Эта интеграция в разработке. Напишем, когда будет готово.
      </p>

      <div className="mt-6 rounded-lg border border-lime-deep/30 bg-lime-soft p-4 flex items-start gap-3">
        <span className="text-lime-deep mt-0.5"><Icons.Bell /></span>
        <div>
          <div className="font-medium text-ink">Пока используйте другие склады</div>
          <p className="mt-1 text-sm text-ink-muted">Ozon FBO, Ozon FBS, Wildberries FBO/FBS и Google Sheet уже работают — подключайте их прямо сейчас.</p>
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

function KindForm({ kind, onCancel, onDone }: { kind: WarehouseKind; onCancel: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [modalError, setModalError] = useState<ParsedError | null>(null);
  const [loading, setLoading] = useState(false);

  const [sheetId, setSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A:E");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wbToken, setWbToken] = useState("");
  const [shop, setShop] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const isOzon = kind === "ozon_fbo" || kind === "ozon_fbs";
  const isWb = kind === "wb_fbo" || kind === "wb_fbs";
  const isWbFbs = kind === "wb_fbs";
  const isSheet = kind === "google_sheet";
  const isShopify = kind === "shopify";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    if (!name.trim()) {
      setModalError({ kind: "validation", title: t("connections.new.err.nameRequired.title"), message: t("connections.new.err.nameRequired.message") });
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setModalError({ kind: "permission", title: t("connections.new.err.sessionExpired.title"), message: t("connections.new.err.sessionExpired.message") });
        return;
      }

      let config: Record<string, unknown> = {};
      if (isSheet) {
        config = { sheet_id: sheetId, range: sheetRange };
      } else if (isOzon) {
        config = { client_id: clientId, api_key: apiKey };
      } else if (isWb) {
        config = { token: wbToken };
      } else if (isShopify) {
        config = { shop: shop.trim(), access_token: accessToken.trim() };
      }

      const createRes = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_kind: kind, name: name.trim(), config }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        if (createRes.status === 402 || data?.code === "warehouse_limit_reached") {
          setModalError({
            kind: "permission",
            title: t("connections.new.err.limit.title"),
            message: t("connections.new.err.limit.message", { limit: data?.limit ?? "?" }),
          });
          return;
        }
        setModalError(parseApiError(data, t("connections.new.err.createFailed")));
        return;
      }
      const conn = await createRes.json() as { id: string };

      const res = await fetch(`/api/connections/${conn.id}/sync`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(parseApiError(data, t("connections.new.err.firstSyncFailed")));
        return;
      }
      onDone();
    } catch (err: any) {
      setModalError(parseApiError(err?.message || String(err), t("connections.sync.errNetwork")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-paper p-6 md:p-8 space-y-5">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition">
          <span className="rotate-180"><Icons.ArrowRight size={12} /></span> {t("connections.new.toChoice")}
        </button>

        <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">{warehouseTitle(kind)}</h2>

        {isOzon && <OzonInstructions />}
        {isWb && <WbInstructions isFbs={isWbFbs} />}
        {isSheet && <SheetInstructions />}
        {isShopify && <ShopifyInstructions />}

        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">
            {t("connections.new.nameLabel")} <span className="text-rose">*</span>
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("connections.new.namePlaceholder")}
            className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
            maxLength={200}
          />
        </div>

        {isSheet && (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Sheet ID</label>
              <input required value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder={t("connections.new.sheet.idPlaceholder")}
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Range</label>
              <input required value={sheetRange} onChange={(e) => setSheetRange(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
              <p className="mt-1.5 font-mono text-[11px] text-ink-hush">{t("connections.new.sheet.rangeHint")}</p>
            </div>
          </>
        )}

        {isOzon && (
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
            {/* Правка Александра: "может питать оба склада" → "подходит для нескольких складов" */}
            <p className="font-mono text-[11px] text-ink-hush">
              Один Ozon API-ключ подходит для нескольких складов: Ozon FBO (остатки на складах маркетплейса) и Ozon FBS (ваш склад).
              После подключения предложим добавить второй.
            </p>
          </>
        )}

        {isWb && (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">
              {isWbFbs ? "Токен WB (Статистика + Маркетплейс + Контент + Цены и скидки)" : "Статистический токен"}
            </label>
            <input required type="password" value={wbToken} onChange={(e) => setWbToken(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            {isWbFbs && (
              <p className="mt-1.5 font-mono text-[11px] text-ink-hush">
                Для FBS нужны права: Маркетплейс (остатки FBS), Контент (карточки → бренд/категория), Цены и скидки (цены товаров), Статистика (продажи).
              </p>
            )}
          </div>
        )}

        {isShopify && (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">{t("connections.new.shopify.domainLabel")}</label>
              <input required value={shop} onChange={(e) => setShop(e.target.value)} placeholder="mystore.myshopify.com"
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">Admin API access token</label>
              <input required type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="shpat_..."
                className="w-full rounded-lg border border-line bg-bg-soft px-4 py-2.5 text-ink font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
              <p className="mt-1.5 font-mono text-[11px] text-ink-hush">{t("connections.new.shopify.tokenHint")}</p>
            </div>
          </>
        )}

        <button type="submit" disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-4 py-3 font-semibold hover:bg-ink-soft disabled:opacity-50 transition">
          {loading ? t("connections.new.submitting") : (<>{t("connections.new.submit")} <Icons.ArrowRight /></>)}
        </button>
      </form>

      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}

function PairSuggestModal({
  suggest, onDismiss, onAccept,
}: { suggest: WarehouseKind | null; onDismiss: () => void; onAccept: (kind: WarehouseKind) => void }) {
  if (!suggest) return null;
  const meta = WAREHOUSES.find((w) => w.kind === suggest);
  if (!meta) return null;

  const isOzonPair = suggest === "ozon_fbs" || suggest === "ozon_fbo";
  const sameKeyText = isOzonPair
    ? "Тот же API-ключ подходит для нескольких складов."
    : "Тот же токен подходит для нескольких складов.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" onClick={onDismiss}>
      <div className="relative w-full max-w-md rounded-2xl bg-paper border border-line p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-medium text-ink">Склад создан ✓</h3>
        <p className="mt-2 text-sm text-ink-muted">
          Добавить также склад <b>{meta.title}</b>? {sameKeyText}
        </p>
        <div className="mt-5 flex gap-2 flex-wrap">
          <button
            onClick={() => onAccept(suggest)}
            className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2.5 text-sm font-semibold hover:bg-ink-soft transition"
          >
            Да, добавить {meta.title}
          </button>
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper text-ink px-4 py-2.5 text-sm font-semibold hover:bg-bg-soft transition"
          >
            Нет, спасибо
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Инструкции по получению API-ключей
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
        <li>Тип токена — отметить <b>Admin Read only</b>
          <span className="block ml-5 text-[11px] text-ink-hush mt-0.5">
            Admin Read only даёт доступ ко всем методам чтения, включая дерево категорий — без него не подтянутся теги бренда и категории
          </span>
        </li>
        <li>Нажать <b>Сгенерировать</b></li>
        <li>Скопировать ключ в Veloseller в поле <b>Api-Key</b></li>
      </ol>
      <p className="mt-3 text-[11px] text-ink-hush">
        Ключу нужен доступ к методам: товары и остатки, цены (юнит-экономика и комиссия), категории и характеристики (теги бренда/категории). Тип <b>Admin Read only</b> покрывает всё это.
      </p>
    </div>
  );
}

function WbInstructions({ isFbs }: { isFbs: boolean }) {
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
        {isFbs ? (
          <li>
            Категории — <b>Статистика, Маркетплейс, Контент, Цены и скидки</b>
            <span className="block ml-5 text-[11px] text-ink-hush mt-0.5">
              (Маркетплейс — остатки FBS-складов, Контент — карточки для тегов бренда/категории, Цены и скидки — цены для юнит-экономики, Статистика — продажи и аналитика)
            </span>
          </li>
        ) : (
          <li>Категории — <b>Статистика</b></li>
        )}
        <li>Уровень доступа — <b>Только чтение</b></li>
        <li>Нажать <b>Создать токен</b></li>
        <li>Скопировать в поле выше</li>
      </ol>
      {isFbs && (
        <p className="mt-3 text-[11px] text-ink-hush">
          У одного токена WB можно ставить несколько категорий одновременно. Тот же токен подходит для нескольких складов.
        </p>
      )}
    </div>
  );
}

function SheetInstructions() {
  if (LOCALE === "en") {
    return (
      <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
        <h3 className="font-display text-base font-medium text-ink mb-3">How to share access and fill in the fields</h3>
        <p className="text-ink-soft mb-2">
          Google Sheet → <b>File → Share → Share with others</b> → <b>General access → Anyone with the link</b> → <b>Copy link</b>.
        </p>
        <div className="space-y-3">
          <div>
            <div className="font-medium text-ink mb-1">1. Sheet ID — inside the link</div>
            <p className="text-ink-muted">Example link:</p>
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
            <div className="font-medium text-ink mb-1">2. Range — the cell range with columns</div>
            <p className="text-ink-muted">
              Column names with data: <b>SKU, Name, Price, Stock</b>.
            </p>
            <p className="mt-1 text-ink-muted">
              Columns do not have to be adjacent (e.g. A, B, F, H) — you choose which column holds which field, and we only read the specified range.
            </p>
            <p className="mt-1 text-ink-muted">
              Example:{" "}
              <code className="bg-paper border border-line rounded px-1.5 py-0.5 font-mono text-[11px]">
                Sheet1!A:E
              </code>
              , where <b>Sheet1</b> is the sheet name, <b>!</b> is the separator, and <b>A:E</b> is the cell range with data.
            </p>
          </div>
        </div>
      </div>
    );
  }
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
            Колонки могут быть не подряд (например A, B, F, H) — вы сами назначаете какая колонка содержит какое поле,
            мы читаем только указанный диапазон.
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

function ShopifyInstructions() {
  if (LOCALE === "en") {
    return (
      <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
        <h3 className="font-display text-base font-medium text-ink mb-3">How to get an access token</h3>
        <p className="text-ink-soft mb-2">
          Shopify admin → <b>Settings → Apps and sales channels → Develop apps</b> → <b>Create an app</b>.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-ink-muted">
          <li>App name — anything you like</li>
          <li><b>Configuration → Admin API integration</b> → grant the <b>read_products</b> scope</li>
          <li>Click <b>Install app</b></li>
          <li><b>API credentials</b> → copy the <b>Admin API access token</b> (starts with <code className="bg-paper border border-line rounded px-1 py-0.5 font-mono text-[11px]">shpat_</code>)</li>
          <li>Store domain — like <b>mystore.myshopify.com</b></li>
        </ol>
        <p className="mt-3 text-[11px] text-ink-hush">
          The token is shown only once. Read-only catalog access — the service cannot change products or prices.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-bg-soft p-4 md:p-5 text-sm">
      <h3 className="font-display text-base font-medium text-ink mb-3">Как получить access token</h3>
      <p className="text-ink-soft mb-2">
        Админка Shopify → <b>Settings → Apps and sales channels → Develop apps</b> → <b>Create an app</b>.
      </p>
      <ol className="list-decimal list-inside space-y-1 text-ink-muted">
        <li>Название приложения — произвольное</li>
        <li><b>Configuration → Admin API integration</b> → выдать scope <b>read_products</b></li>
        <li>Нажать <b>Install app</b></li>
        <li><b>API credentials</b> → скопировать <b>Admin API access token</b> (начинается с <code className="bg-paper border border-line rounded px-1 py-0.5 font-mono text-[11px]">shpat_</code>)</li>
        <li>Домен магазина — вида <b>mystore.myshopify.com</b></li>
      </ol>
      <p className="mt-3 text-[11px] text-ink-hush">
        Токен показывается один раз. Доступ только на чтение каталога — менять товары и цены сервис не может.
      </p>
    </div>
  );
}

function warehouseTitle(kind: WarehouseKind): string {
  return ({
    ozon_fbo:     "Ozon FBO",
    ozon_fbs:     "Ozon FBS",
    wb_fbo:       "Wildberries FBO",
    wb_fbs:       "Wildberries FBS",
    google_sheet: "Google Sheet",
    shopify:      "Shopify",
  } as const)[kind];
}
