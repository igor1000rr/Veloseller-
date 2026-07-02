"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

type BulkItem = { sku: string; product_name: string | null; price: number; stock_quantity: number };

/**
 * Парсит массовую вставку: строка на товар, разделители — таб (вставка из Excel),
 * запятая или точка с запятой. 4 колонки: артикул, наименование, цена, остаток.
 * Если колонок 3 — наименование опускаем (артикул, цена, остаток).
 * Первую строку пропускаем, если она похожа на заголовок (нет числа в цене/остатке).
 */
function parseBulk(text: string): { items: BulkItem[]; errors: string[] } {
  const items: BulkItem[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Map<string, BulkItem>();
  lines.forEach((line, idx) => {
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const cols = line.split(sep).map((c) => c.trim());
    let sku = "", pname: string | null = null, priceStr = "", stockStr = "";
    if (cols.length >= 4) {
      [sku, pname, priceStr, stockStr] = [cols[0], cols[1] || null, cols[2], cols[3]];
    } else if (cols.length === 3) {
      [sku, priceStr, stockStr] = [cols[0], cols[1], cols[2]];
    } else {
      errors.push(`строка ${idx + 1}: нужно 3–4 колонки (артикул, [наименование], цена, остаток)`);
      return;
    }
    if (!sku) { errors.push(`строка ${idx + 1}: пустой артикул`); return; }
    const price = Number((priceStr || "0").replace(",", ".").replace(/\s/g, ""));
    const stock = parseInt((stockStr || "").replace(/\s/g, ""), 10);
    if (Number.isNaN(price) || price < 0) {
      // Возможно это строка-заголовок — на первой строке молча пропускаем
      if (idx === 0) return;
      errors.push(`строка ${idx + 1} (${sku}): цена не число`);
      return;
    }
    if (Number.isNaN(stock) || stock < 0) {
      if (idx === 0) return;
      errors.push(`строка ${idx + 1} (${sku}): остаток не целое ≥ 0`);
      return;
    }
    seen.set(sku, { sku, product_name: pname, price, stock_quantity: stock });
  });
  return { items: [...seen.values()], errors };
}

type Item = {
  productId: string;
  sku: string;
  productName: string | null;
  stock: number;
  price: number;
};

/**
 * Ручной режим: добавление товаров и правки остатков прямо в кабинете.
 * Каждое действие шлёт новый остаток в /api/connections/[id]/manual → worker
 * персистит снапшот source=manual. Продажи (−) и пополнения (+) — это просто
 * новый остаток; движок сам считает движение между снапшотами.
 */
export default function ManualEntry({
  connectionId,
  initialItems,
  truncated,
}: {
  connectionId: string;
  initialItems: Item[];
  truncated: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busy, setBusy] = useState<string | null>(null); // sku, по которому идёт запрос
  const [modalError, setModalError] = useState<ParsedError | null>(null);

  // Форма добавления товара
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  // Массовая вставка
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Голосовой ввод наименования (Web Speech API — Chrome/Edge; иначе кнопки нет)
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const w = window as any;
    setVoiceSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function startVoice() {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) setName((prev) => (prev ? prev + " " : "") + text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  async function handleBulk() {
    const { items: parsed, errors } = parseBulk(bulkText);
    if (parsed.length === 0) {
      setModalError({ kind: "validation", title: "Нечего добавить", message: errors[0] || "Вставьте строки: артикул, наименование, цена, остаток." });
      return;
    }
    setBulkBusy(true);
    try {
      const ok = await submitItems(parsed);
      if (ok) {
        const note = errors.length ? ` Пропущено строк с ошибками: ${errors.length}.` : "";
        setBulkText("");
        setBulkOpen(false);
        router.refresh();
        if (errors.length) setModalError({ kind: "validation", title: `Добавлено ${parsed.length}`, message: `Часть строк пропущена.${note}` });
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function submitItems(payload: { sku: string; product_name?: string | null; stock_quantity: number; price: number }[]): Promise<boolean> {
    setModalError(null);
    const res = await fetch(`/api/connections/${connectionId}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setModalError(parseApiError(data, "Не удалось сохранить"));
      return false;
    }
    return true;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const skuTrim = sku.trim();
    if (!skuTrim) { setModalError({ kind: "validation", title: "Нужен артикул", message: "Укажите артикул товара (sku)." }); return; }
    const stockNum = parseInt(stock, 10);
    if (Number.isNaN(stockNum) || stockNum < 0) { setModalError({ kind: "validation", title: "Остаток", message: "Остаток — целое число ≥ 0." }); return; }
    const priceNum = Number((price || "0").replace(",", "."));
    if (Number.isNaN(priceNum) || priceNum < 0) { setModalError({ kind: "validation", title: "Цена", message: "Цена — число ≥ 0." }); return; }

    setBusy("__add__");
    try {
      const ok = await submitItems([{ sku: skuTrim, product_name: name.trim() || null, stock_quantity: stockNum, price: priceNum }]);
      if (ok) {
        setSku(""); setName(""); setPrice(""); setStock("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function adjust(item: Item, delta: number) {
    const newStock = Math.max(0, item.stock + delta);
    if (newStock === item.stock) return;
    setBusy(item.sku);
    try {
      const ok = await submitItems([{ sku: item.sku, product_name: item.productName, stock_quantity: newStock, price: item.price }]);
      if (ok) {
        setItems((prev) => prev.map((it) => (it.productId === item.productId ? { ...it, stock: newStock } : it)));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-paper p-5 md:p-6">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
        Ручной ввод
      </h2>

      {/* Добавить товар */}
      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end mb-5">
        <div className="sm:col-span-3">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1">Артикул *</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="ABC-123"
            className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink text-sm font-mono focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
        </div>
        <div className="sm:col-span-4">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1">Наименование</label>
          <div className="relative">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Футболка синяя, M"
              className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 pr-9 text-ink text-sm focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
            {voiceSupported && (
              <button type="button" onClick={startVoice} title="Голосовой ввод"
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-md transition ${listening ? "text-rose animate-pulse" : "text-ink-hush hover:text-lime-deep"}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1">Цена, ₽ *</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="990"
            className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink text-sm tabular focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1">Остаток *</label>
          <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" placeholder="20"
            className="w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink text-sm tabular focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
        </div>
        <div className="sm:col-span-1">
          <button type="submit" disabled={busy === "__add__"}
            title="Добавить / обновить товар"
            className="w-full inline-flex items-center justify-center rounded-lg bg-ink text-paper px-3 py-2 text-sm font-semibold hover:bg-ink-soft disabled:opacity-50 transition">
            {busy === "__add__" ? "…" : "+"}
          </button>
        </div>
      </form>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <p className="text-[11px] text-ink-hush flex-1 min-w-[200px]">
          Добавили товар с текущим остатком — дальше отмечайте продажи и пополнения кнопками ниже.
          Тот же артикул с новым остатком обновляет позицию.
        </p>
        <button type="button" onClick={() => setBulkOpen((v) => !v)}
          className="text-xs font-semibold text-ink-muted hover:text-lime-deep underline transition shrink-0">
          {bulkOpen ? "Скрыть массовую вставку" : "Вставить списком / из Excel"}
        </button>
      </div>

      {bulkOpen && (
        <div className="mb-5 rounded-xl border border-line bg-bg-soft p-4">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush mb-1.5">
            Строка на товар: артикул, наименование, цена, остаток
          </label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"ABC-123, Футболка синяя M, 990, 20\nABC-124, Футболка синяя L, 990, 15"}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink text-sm font-mono focus:border-lime-deep focus:outline-none transition"
          />
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button type="button" onClick={handleBulk} disabled={bulkBusy || !bulkText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft disabled:opacity-50 transition">
              {bulkBusy ? "Добавляю…" : "Добавить списком"}
            </button>
            <span className="text-[11px] text-ink-hush">
              Разделитель — запятая, точка с запятой или табуляция (можно вставить прямо из Excel). Строку-заголовок пропустим.
            </span>
          </div>
        </div>
      )}

      {/* Список товаров */}
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-ink-hush border-b border-line">
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Товар</th>
                <th className="py-2 pr-4 text-right">Цена</th>
                <th className="py-2 pr-4 text-right">Остаток</th>
                <th className="py-2 text-right">Продажа / Пополнение</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <ManualRow key={it.productId} item={it} busy={busy === it.sku} onAdjust={adjust} />
              ))}
            </tbody>
          </table>
          {truncated && (
            <p className="mt-3 text-[11px] text-ink-hush">
              Показаны первые 500 товаров. Для больших каталогов удобнее загрузка CSV-складом.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-hush text-center py-4">Пока нет товаров — добавьте первый выше.</p>
      )}

      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </div>
  );
}

function ManualRow({ item, busy, onAdjust }: { item: Item; busy: boolean; onAdjust: (item: Item, delta: number) => void }) {
  const [qty, setQty] = useState("1");
  const q = Math.max(1, parseInt(qty, 10) || 1);
  return (
    <tr className="border-b border-line/50 hover:bg-bg-soft transition">
      <td className="py-2 pr-4 font-mono text-xs text-ink">{item.sku}</td>
      <td className="py-2 pr-4 text-ink-soft truncate max-w-xs">{item.productName ?? "—"}</td>
      <td className="py-2 pr-4 text-right tabular text-ink-soft">{item.price.toFixed(2)}</td>
      <td className="py-2 pr-4 text-right tabular text-ink font-medium">{item.stock}</td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" disabled={busy} onClick={() => onAdjust(item, -q)}
            title="Продажа (уменьшить остаток)"
            className="inline-flex items-center justify-center size-7 rounded-md border border-line bg-paper text-rose hover:border-rose/40 disabled:opacity-40 transition font-semibold">
            −
          </button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric"
            className="w-12 rounded-md border border-line bg-bg-soft px-2 py-1 text-center text-xs tabular focus:bg-paper focus:border-lime-deep focus:outline-none transition" />
          <button type="button" disabled={busy} onClick={() => onAdjust(item, q)}
            title="Пополнение (увеличить остаток)"
            className="inline-flex items-center justify-center size-7 rounded-md border border-line bg-paper text-lime-deep hover:border-lime-deep/40 disabled:opacity-40 transition font-semibold">
            +
          </button>
        </div>
      </td>
    </tr>
  );
}
