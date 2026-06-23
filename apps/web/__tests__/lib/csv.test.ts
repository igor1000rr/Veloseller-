import { describe, it, expect } from "vitest";
import { csvEscape } from "@/lib/csv";

/**
 * csvEscape — структурное экранирование + защита от CSV/formula injection.
 * Ведущие = + - @ \t \r исполняются Excel/LibreOffice/Sheets как формула при
 * открытии файла; sku/название/заметки задаёт арендатор, а экспорт открывает
 * админ/саппорт → нейтрализуем апострофом.
 */
describe("lib/csv — csvEscape", () => {
  it("обычные значения проходят как есть", () => {
    expect(csvEscape("SFRRNST2")).toBe("SFRRNST2");
    expect(csvEscape("Носки тёплые")).toBe("Носки тёплые");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("null/undefined → пустая строка", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("нейтрализует ведущие формульные символы апострофом", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+1234")).toBe("'+1234");
    expect(csvEscape("-2+3")).toBe("'-2+3");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("\tcmd")).toBe("'\tcmd");
    expect(csvEscape("\rpayload")).toBe("'\rpayload");
  });

  it("формула с внутренними кавычками: префикс + структурное экранирование", () => {
    // =HYPERLINK("http://evil") → апостроф впереди, затем оборачивание в кавычки
    // с удвоением внутренних — это корректный безопасный вывод.
    expect(csvEscape('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
  });

  it("формульный символ НЕ в начале — не трогаем", () => {
    expect(csvEscape("A=B")).toBe("A=B");
    expect(csvEscape("ID-123")).toBe("ID-123");
  });

  it("структурное экранирование: разделитель/кавычка/перевод строки", () => {
    expect(csvEscape("a,b", ",")).toBe('"a,b"');
    expect(csvEscape("a;b", ";")).toBe('"a;b"');
    expect(csvEscape('say "hi"', ",")).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2", ",")).toBe('"line1\nline2"');
    // запятая безопасна при разделителе ; (excel-режим)
    expect(csvEscape("a,b", ";")).toBe("a,b");
  });

  it("формула + разделитель: и префикс, и кавычки", () => {
    expect(csvEscape("=A1,B1", ",")).toBe("\"'=A1,B1\"");
  });
});
