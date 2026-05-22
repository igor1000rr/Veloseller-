// Простой markdown→JSX рендер для постов. Без внешних зависимостей.
//
// Поддерживает:
//   ## H2 / ### H3
//   - Маркированные списки
//   1. 2. Нумерованные списки
//   | a | b |  Таблицы
//   **bold**, *italic*, `code`
//   [text](url) внутренние и внешние
//   Пустые строки = разделители блоков

import Link from "next/link";
import type { ReactNode } from "react";

export function renderMarkdown(text: string): ReactNode {
  const blocks = text.trim().split(/\n\n+/);
  return <>{blocks.map((block, i) => renderBlock(block.trim(), i))}</>;
}

function renderBlock(block: string, key: number): ReactNode {
  if (!block) return null;

  // H2
  if (block.startsWith("## ")) {
    return (
      <h2
        key={key}
        className="font-display text-2xl md:text-3xl tracking-tight mt-12 mb-4 font-medium text-ink"
      >
        {renderInline(block.slice(3))}
      </h2>
    );
  }
  // H3
  if (block.startsWith("### ")) {
    return (
      <h3
        key={key}
        className="font-display text-xl md:text-2xl tracking-tight mt-8 mb-3 font-medium text-ink"
      >
        {renderInline(block.slice(4))}
      </h3>
    );
  }
  // Таблица — блок, строки которого начинаются с |
  if (block.startsWith("|")) {
    return renderTable(block, key);
  }
  const lines = block.split("\n");
  // Маркированный список
  if (lines.every((l) => l.startsWith("- "))) {
    return (
      <ul
        key={key}
        className="my-5 space-y-2 text-ink-soft text-base md:text-[17px] leading-relaxed list-disc list-outside pl-6"
      >
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.slice(2))}</li>
        ))}
      </ul>
    );
  }
  // Нумерованный список
  if (lines.every((l) => /^\d+\.\s/.test(l))) {
    return (
      <ol
        key={key}
        className="my-5 space-y-2 text-ink-soft text-base md:text-[17px] leading-relaxed list-decimal list-outside pl-6"
      >
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.replace(/^\d+\.\s/, ""))}</li>
        ))}
      </ol>
    );
  }
  // Синглтон-блок в обрамлении бэквотов = выделенная формула
  if (block.startsWith("`") && block.endsWith("`") && !block.includes("\n")) {
    return (
      <div
        key={key}
        className="my-5 rounded-lg border border-line bg-bg-soft px-4 py-3 font-mono text-sm md:text-[15px] text-ink-soft overflow-x-auto"
      >
        {block.slice(1, -1)}
      </div>
    );
  }
  // Обычный параграф
  return (
    <p
      key={key}
      className="my-5 text-ink-soft text-base md:text-[17px] leading-[1.75]"
    >
      {renderInline(block)}
    </p>
  );
}

function renderTable(block: string, key: number): ReactNode {
  const lines = block.split("\n").filter(Boolean);
  if (lines.length < 2) return null;

  const headers = lines[0]
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  // Строка 1 — разделитель |---|---|, пропускаем
  const rows = lines.slice(2).map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
  );

  return (
    <div key={key} className="my-7 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm md:text-[15px]">
        <thead>
          <tr className="bg-bg-soft border-b-2 border-line">
            {headers.map((h, j) => (
              <th
                key={j}
                className="text-left py-3 px-4 font-display font-medium text-ink whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, j) => (
            <tr key={j} className="border-b border-line last:border-b-0">
              {row.map((cell, k) => (
                <td key={k} className="py-3 px-4 text-ink-soft align-top">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // По приоритету: ссылка [text](url), `code`, **bold**, *italic*
  const regex = /(\[([^\]]+)\]\(([^)]+)\))|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/;

  while (remaining.length > 0) {
    const match = remaining.match(regex);
    if (!match) {
      out.push(remaining);
      break;
    }
    const idx = match.index ?? 0;
    if (idx > 0) out.push(remaining.slice(0, idx));

    if (match[1]) {
      // [text](url)
      const label = match[2];
      const href = match[3];
      const isInternal = href.startsWith("/") || href.startsWith("#");
      if (isInternal) {
        out.push(
          <Link
            key={key++}
            href={href as never}
            className="text-lime-deep hover:underline font-medium underline-offset-2"
          >
            {label}
          </Link>
        );
      } else {
        out.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lime-deep hover:underline font-medium underline-offset-2"
          >
            {label}
          </a>
        );
      }
    } else if (match[4]) {
      // `code`
      out.push(
        <code
          key={key++}
          className="font-mono text-[0.92em] bg-bg-soft border border-line px-1.5 py-0.5 rounded text-ink"
        >
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      // **bold**
      out.push(
        <strong key={key++} className="text-ink font-semibold">
          {match[5]}
        </strong>
      );
    } else if (match[6]) {
      // *italic*
      out.push(
        <em key={key++} className="italic">
          {match[6]}
        </em>
      );
    }

    remaining = remaining.slice(idx + match[0].length);
  }

  return <>{out}</>;
}
