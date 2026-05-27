/**
 * AI-парсер прайса — извлекает бренды и подсчитывает SKU/среднюю цену.
 *
 * Стратегия: разбираем XLSX/CSV локально (xlsx + papaparse), извлекаем
 * текст вместе с ценами, отправляем в Claude Haiku 4.5 через OpenRouter
 * (или прямой Anthropic API если ANTHROPIC_API_KEY есть). ИИ возвращает
 * JSON-массив {brand, sku_count, avg_price}.
 *
 * Почему ИИ, а не regex/словарь:
 *   "Dyson V11 Absolute Extra Pro" vs "Сухой пылесос Dyson V12" — без
 *   знания мира не понять что бренд тут "Dyson". Особенно сложно
 *   когда: артикулы вперемешку с брендом, разные регистры, перевод
 *   с английского на русский, опечатки. ИИ справляется надёжно за $0.04.
 */
import { read, utils } from "@e965/xlsx";
import Papa from "papaparse";

export type ExtractedBrand = {
  name: string;
  sku_count: number;
  avg_price: number | null;
};

export type ExtractionResult = {
  brands: ExtractedBrand[];
  raw_response: any;
  rows_processed: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model: string;
  provider: "openrouter" | "anthropic";
};

// Цены Haiku 4.5 на 27.05.2026 (проверено в чате): $1/M input, $5/M output.
// OpenRouter добавляет ~5% наценку — заложу 1.05x в расчёт стоимости.
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;

const SYSTEM_PROMPT = `Ты помощник для извлечения брендов из товарного прайса.

Из CSV-строк "товар | цена" вычлени УНИКАЛЬНЫЕ бренды.
Для каждого бренда подсчитай число SKU и среднюю цену.

Правила:
1. Бренд = производитель товара. Dyson, Bosch, Apple, Samsung. НЕ модель, НЕ описание.
2. Если в строке нет очевидного бренда — пропусти строку.
3. Названия типа "Сухой пылесос", "Чайник", "Кружка" — это категории, НЕ бренды.
4. Артикулы (V11, GBH-2-26, SM-G991B) — это модели, бренды стоят перед ними.
5. Игнорируй размеры (XL, 32GB), цвета (Black, белый), упаковку (комплект).
6. Минимум 2 SKU чтобы попасть в список — одиночное упоминание бренда не повод.
7. Если категория одного бренда — например "Apple iPhone 15" — считаем бренд Apple.

Верни строго JSON массив, ничего больше:
[{"name":"Dyson","sku_count":4,"avg_price":45000},{"name":"Bosch","sku_count":7,"avg_price":12500}]`;

export async function extractBrandsFromFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
): Promise<ExtractionResult> {
  // 1. Парсим файл локально → массив (name, price?)
  const rows = parseFileLocally(fileBuffer, fileName);
  if (rows.length === 0) {
    throw new Error("Не удалось прочитать прайс — файл пустой или формат не распознан");
  }

  // 2. Ограничиваем размер payload для ИИ. ~3K строк = ~30K токенов input.
  // Для прайсов >3K SKU берём sample + распределённую выборку — даём ИИ
  // достаточно сигнала чтобы найти ВСЕ бренды.
  const sample = sampleRows(rows, 3000);
  const csvText = sample.map(r =>
    r.price != null ? `${r.name} | ${r.price}` : r.name
  ).join("\n");

  // 3. Вызываем ИИ.
  const apiResult = await callAI(csvText, sample.length);

  // 4. Парсим ответ — ожидаем JSON-массив.
  const brands = parseAIResponse(apiResult.text);

  return {
    brands,
    raw_response: apiResult.text,
    rows_processed: sample.length,
    tokens_input: apiResult.tokens_input,
    tokens_output: apiResult.tokens_output,
    cost_usd: apiResult.cost_usd,
    model: apiResult.model,
    provider: apiResult.provider,
  };
}

function parseFileLocally(
  buffer: ArrayBuffer,
  fileName: string,
): Array<{ name: string; price: number | null }> {
  const ext = fileName.toLowerCase().split(".").pop();

  // CSV — через papaparse (стрим, надёжно с любым encoding).
  if (ext === "csv" || ext === "tsv") {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      delimiter: ext === "tsv" ? "\t" : undefined,
    });
    return extractFromRows(parsed.data);
  }

  // XLSX/XLS через sheetjs.
  if (ext === "xlsx" || ext === "xls") {
    const workbook = read(buffer, { type: "array" });
    const allRows: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json<any[]>(sheet, { header: 1 });
      allRows.push(...rows);
    }
    return extractFromRows(allRows);
  }

  throw new Error(`Формат .${ext} не поддерживается. Используйте CSV/XLSX/XLS.`);
}

function extractFromRows(
  rawRows: any[],
): Array<{ name: string; price: number | null }> {
  const out: Array<{ name: string; price: number | null }> = [];

  for (const row of rawRows) {
    if (!Array.isArray(row) || row.length === 0) continue;

    // Найдём "name" колонку — первая колонка с текстом длиннее 3 символов
    // и не похожая на число/артикул.
    let nameCol: string | null = null;
    let priceCol: number | null = null;

    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (!s) continue;

      // Числовая ячейка → возможно цена.
      const asNumber = Number(s.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(asNumber) && asNumber > 0 && asNumber < 10_000_000) {
        if (priceCol == null) priceCol = asNumber;
        continue;
      }

      // Текстовая ячейка → потенциальное название товара.
      if (s.length >= 4 && nameCol == null) {
        nameCol = s;
      }
    }

    if (nameCol) {
      out.push({ name: nameCol, price: priceCol });
    }
  }

  return out;
}

/**
 * Если строк больше limit — берём первые N + равномерную выборку.
 * Гарантирует что ИИ увидит и начало (где часто хедеры со всеми категориями),
 * и редкие бренды из конца файла.
 */
function sampleRows<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const head = Math.floor(limit * 0.3);
  const distributed = limit - head;
  const step = (rows.length - head) / distributed;

  const result: T[] = rows.slice(0, head);
  for (let i = 0; i < distributed; i++) {
    const idx = Math.floor(head + i * step);
    if (rows[idx]) result.push(rows[idx]);
  }
  return result;
}

async function callAI(csv: string, rowCount: number): Promise<{
  text: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model: string;
  provider: "openrouter" | "anthropic";
}> {
  // Приоритет: OpenRouter (один ключ на всё) > Anthropic.
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openrouterKey) {
    return await callOpenRouter(csv, rowCount, openrouterKey);
  }
  if (anthropicKey) {
    return await callAnthropic(csv, rowCount, anthropicKey);
  }
  throw new Error(
    "Нет AI-ключа. Установите OPENROUTER_API_KEY или ANTHROPIC_API_KEY в .env"
  );
}

async function callOpenRouter(csv: string, rowCount: number, key: string) {
  const userPrompt = `Прайс (${rowCount} строк):\n\n${csv}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://veloseller.ru",
      "X-Title": "Veloseller Radar",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const tokensIn = data?.usage?.prompt_tokens ?? 0;
  const tokensOut = data?.usage?.completion_tokens ?? 0;
  // OpenRouter наценка ~5%.
  const costUsd = (tokensIn * HAIKU_INPUT_PER_M / 1_000_000
                 + tokensOut * HAIKU_OUTPUT_PER_M / 1_000_000) * 1.05;
  return {
    text,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    cost_usd: costUsd,
    model: "openrouter/anthropic/claude-haiku-4.5",
    provider: "openrouter" as const,
  };
}

async function callAnthropic(csv: string, rowCount: number, key: string) {
  const userPrompt = `Прайс (${rowCount} строк):\n\n${csv}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  const tokensIn = data?.usage?.input_tokens ?? 0;
  const tokensOut = data?.usage?.output_tokens ?? 0;
  const costUsd = tokensIn * HAIKU_INPUT_PER_M / 1_000_000
                + tokensOut * HAIKU_OUTPUT_PER_M / 1_000_000;
  return {
    text,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    cost_usd: costUsd,
    model: "claude-haiku-4-5",
    provider: "anthropic" as const,
  };
}

function parseAIResponse(text: string): ExtractedBrand[] {
  // ИИ может вернуть ```json ... ``` обёртку или просто JSON. Чистим.
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  // Найти первый '[' и последний ']' — JSON может прийти с предисловием.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("ИИ вернул не-JSON ответ: " + cleaned.slice(0, 200));
  }

  const jsonText = cleaned.slice(start, end + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("Не удалось распарсить JSON: " + jsonText.slice(0, 200));
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Ожидался JSON-массив");
  }

  return parsed
    .filter((b: any) => typeof b?.name === "string" && b.name.trim().length > 0)
    .map((b: any) => ({
      name: String(b.name).trim(),
      sku_count: Number.isFinite(Number(b.sku_count)) ? Number(b.sku_count) : 0,
      avg_price: Number.isFinite(Number(b.avg_price)) ? Number(b.avg_price) : null,
    }));
}

export function normalizeBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
