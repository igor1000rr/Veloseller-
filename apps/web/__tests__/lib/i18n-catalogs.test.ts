import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Каталоги переводов: apps/web/messages/{ru,en}/<namespace>.json.
// Под vitest (vite-node) import.meta.url бывает не со схемой file:// →
// fileURLToPath кидает. Поэтому пробуем варианты и берём существующий каталог.
function resolveMessagesDir(): string {
  const candidates: string[] = [];
  try {
    candidates.push(fileURLToPath(new URL("../../messages", import.meta.url)));
  } catch {
    /* import.meta.url не file:// — идём по фолбэкам ниже */
  }
  candidates.push(path.resolve(process.cwd(), "messages"));
  candidates.push(path.resolve(process.cwd(), "apps/web/messages"));
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).length > 0) return dir;
    } catch {
      /* нет такой директории — пробуем следующую */
    }
  }
  return candidates[candidates.length - 1];
}

const MESSAGES_DIR = resolveMessagesDir();

// CLDR plural-категории. В en реально используются one/other, в ru — one/few/many
// (см. plural() в lib/i18n.ts), поэтому набор форм заведомо разный по языкам —
// такие ключи проверяем отдельно, а не на побуквенный паритет.
const PLURAL_SUFFIX = /\.(one|few|many|other)$/;
const CYRILLIC = /[\u0400-\u04FF]/;
const PLACEHOLDER = /\{(\w+)\}/g;

function listNamespaces(lang: string): string[] {
  return readdirSync(`${MESSAGES_DIR}/${lang}`)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function load(lang: string, file: string): Record<string, string> {
  return JSON.parse(readFileSync(`${MESSAGES_DIR}/${lang}/${file}`, "utf8"));
}

function placeholders(s: string): string[] {
  return [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();
}

function pluralBases(keys: string[]): string[] {
  const set = new Set<string>();
  for (const k of keys) {
    const m = k.match(PLURAL_SUFFIX);
    if (m) set.add(k.slice(0, k.length - m[0].length));
  }
  return [...set].sort();
}

describe("i18n каталоги — целостность ru/en", () => {
  it("наборы namespace-файлов в ru и en совпадают", () => {
    expect(listNamespaces("en")).toEqual(listNamespaces("ru"));
  });

  for (const file of listNamespaces("en")) {
    describe(`namespace: ${file}`, () => {
      const ru = load("ru", file);
      const en = load("en", file);
      const ruKeys = Object.keys(ru);
      const enKeys = Object.keys(en);

      it("набор не-plural ключей ru и en идентичен", () => {
        const ruFlat = ruKeys.filter((k) => !PLURAL_SUFFIX.test(k));
        const enFlat = enKeys.filter((k) => !PLURAL_SUFFIX.test(k));
        const missingInEn = ruFlat.filter((k) => !(k in en)).sort();
        const missingInRu = enFlat.filter((k) => !(k in ru)).sort();
        expect({ missingInEn, missingInRu }).toEqual({ missingInEn: [], missingInRu: [] });
      });

      it("plural-ключи: одинаковые базы + формы по правилам локали", () => {
        expect(pluralBases(enKeys)).toEqual(pluralBases(ruKeys));
        for (const base of pluralBases(enKeys)) {
          expect(`${base}.one` in en && `${base}.other` in en, `en plural ${base}`).toBe(true);
          expect(
            `${base}.one` in ru && `${base}.few` in ru && `${base}.many` in ru,
            `ru plural ${base}`,
          ).toBe(true);
        }
      });

      it("нет пустых значений", () => {
        const emptyEn = Object.entries(en).filter(([, v]) => !String(v).trim()).map(([k]) => k);
        const emptyRu = Object.entries(ru).filter(([, v]) => !String(v).trim()).map(([k]) => k);
        expect({ emptyEn, emptyRu }).toEqual({ emptyEn: [], emptyRu: [] });
      });

      it("в en-значениях нет кириллицы (непереведённые строки)", () => {
        const cyrillic = Object.entries(en)
          .filter(([, v]) => CYRILLIC.test(String(v)))
          .map(([k]) => k);
        expect(cyrillic).toEqual([]);
      });

      it("плейсхолдеры {x} совпадают между ru и en (общие ключи)", () => {
        const mismatched: string[] = [];
        for (const k of enKeys) {
          if (k in ru && placeholders(String(en[k])).join(",") !== placeholders(String(ru[k])).join(",")) {
            mismatched.push(k);
          }
        }
        expect(mismatched).toEqual([]);
      });
    });
  }
});
