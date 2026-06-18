import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Каталоги переводов лежат рядом: apps/web/messages/{ru,en}/<namespace>.json.
// Путь резолвим от файла теста, а не от cwd — чтобы тест не зависел от того,
// откуда запущен vitest.
const MESSAGES_DIR = fileURLToPath(new URL("../../messages", import.meta.url));

function listNamespaces(lang: string): string[] {
  return readdirSync(`${MESSAGES_DIR}/${lang}`)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function load(lang: string, file: string): Record<string, string> {
  return JSON.parse(readFileSync(`${MESSAGES_DIR}/${lang}/${file}`, "utf8"));
}

const CYRILLIC = /[\u0400-\u04FF]/;
const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(s: string): string[] {
  return [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();
}

describe("i18n каталоги — целостность ru/en", () => {
  it("наборы namespace-файлов в ru и en совпадают", () => {
    expect(listNamespaces("en")).toEqual(listNamespaces("ru"));
  });

  // По каждому неймспейсу (паритет файлов проверен выше).
  for (const file of listNamespaces("en")) {
    describe(`namespace: ${file}`, () => {
      const ru = load("ru", file);
      const en = load("en", file);

      it("набор ключей ru и en идентичен", () => {
        const missingInEn = Object.keys(ru).filter((k) => !(k in en)).sort();
        const missingInRu = Object.keys(en).filter((k) => !(k in ru)).sort();
        expect({ missingInEn, missingInRu }).toEqual({ missingInEn: [], missingInRu: [] });
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

      it("плейсхолдеры {x} совпадают между ru и en", () => {
        const mismatched: string[] = [];
        for (const k of Object.keys(en)) {
          if (k in ru && placeholders(String(en[k])).join(",") !== placeholders(String(ru[k])).join(",")) {
            mismatched.push(k);
          }
        }
        expect(mismatched).toEqual([]);
      });
    });
  }
});
