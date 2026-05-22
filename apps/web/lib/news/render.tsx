// Минимальный markdown → JSX без зависимостей.
// Поддерживает: ## H2, ### H3, абзацы, - списки, 1. списки, **bold**, _italic_, [text](url), | таблицы |
//
// Намеренно без backticks (template-literal posts.ts), без code-blocks.
// Формулы в постах оформлены жирным шрифтом, не моно.

import React from "react";
import Link from "next/link";

type InlineSegment = string | { kind: "bold" | "italic" | "link"; text: string; href?: string };

function tokenizeInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  while (i < text.length) {
    // [text](url)
    if (text[i] === "[") {
      const close = text.indexOf("]", i);
      if (close !== -1 && text[close + 1] === "(") {
        const parenClose = text.indexOf(")", close + 2);
        if (parenClose !== -1) {
          flush();
          out.push({ kind: "link", text: text.slice(i + 1, close), href: text.slice(close + 2, parenClose) });
          i = parenClose + 1;
          continue;
        }
      }
    }
    // **bold**
    if (text[i] === "*" && text[i + 1] === "*") {
      const close = text.indexOf("**", i + 2);
      if (close !== -1) {
        flush();
        out.push({ kind: "bold", text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    // _italic_ — учитываем что _ может быть в URL/ключах, поэтому требуем непробельные границы
    if (text[i] === "_" && text[i + 1] && text[i + 1] !== " ") {
      const close = text.indexOf("_", i + 1);
      if (close !== -1 && text[close - 1] !== " ") {
        flush();
        out.push({ kind: "italic", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const segs = tokenizeInline(text);
  return segs.map((seg, j) => {
    if (typeof seg === "string") return <React.Fragment key={`${keyPrefix}-${j}`}>{seg}</React.Fragment>;
    const k = `${keyPrefix}-${j}`;
    if (seg.kind === "bold")
      return (
        <strong key={k} className="font-semibold text-ink">
          {seg.text}
        </strong>
      );
    if (seg.kind === "italic") return <em key={k}>{seg.text}</em>;
    if (seg.kind === "link" && seg.href) {
      const isExternal = /^https?:\/\//.test(seg.href) && !seg.href.includes("veloseller.ru");
      if (isExternal) {
        return (
          <a key={k} href={seg.href} target="_blank" rel="noopener noreferrer" className="text-lime-deep underline underline-offset-2 hover:no-underline">
            {seg.text}
          </a>
        );
      }
      return (
        <Link key={k} href={seg.href as never} className="text-lime-deep underline underline-offset-2 hover:no-underline">
          {seg.text}
        </Link>
      );
    }
    return null;
  });
}

function isSpecialStart(line: string): boolean {
  return (
    line.startsWith("## ") ||
    line.startsWith("### ") ||
    line.startsWith("- ") ||
    /^\d+\.\s/.test(line) ||
    line.startsWith("|")
  );
}

export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // H3 — проверять до H2!
    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h-${i}`} className="mt-8 mb-3 font-display text-lg md:text-xl tracking-tight font-medium text-ink scroll-mt-24">
          {renderInline(trimmed.slice(4), `h${i}`)}
        </h3>,
      );
      i++;
      continue;
    }

    // H2
    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h-${i}`} className="mt-12 mb-4 font-display text-2xl md:text-3xl tracking-tight font-medium text-ink scroll-mt-24">
          {renderInline(trimmed.slice(3), `h${i}`)}
        </h2>,
      );
      i++;
      continue;
    }

    // Unordered list — собираем подряд идущие `- ` строки
    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="mt-4 mb-4 space-y-2 list-disc pl-5 md:pl-6 text-ink-soft">
          {items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(it, `ul${start}-${j}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${start}`} className="mt-4 mb-4 space-y-2 list-decimal pl-5 md:pl-6 text-ink-soft">
          {items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(it, `ol${start}-${j}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Table: первая строка | ... |, вторая | --- |
    if (trimmed.startsWith("|") && i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
      const rows: string[][] = [];
      const start = i;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const inner = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "");
        rows.push(inner.split("|").map((c) => c.trim()));
        i++;
      }
      if (rows.length >= 2) {
        const header = rows[0];
        const isSep = rows[1].every((c) => /^[-:]+$/.test(c));
        const body = isSep ? rows.slice(2) : rows.slice(1);
        blocks.push(
          <div key={`tbl-${start}`} className="mt-6 mb-6 overflow-x-auto rounded-xl border border-line bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-bg-soft border-b border-line">
                <tr>
                  {header.map((h, j) => (
                    <th key={j} className="px-4 py-2.5 text-left font-medium text-ink whitespace-nowrap">
                      {renderInline(h, `th${start}-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri < body.length - 1 ? "border-b border-line" : ""}>
                    {row.map((c, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-ink-soft align-top">
                        {renderInline(c, `td${start}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    // Paragraph — собираем строки до пустой / специальной
    const paraLines: string[] = [];
    const start = i;
    while (i < lines.length && lines[i].trim() && !isSpecialStart(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={`p-${start}`} className="mt-4 mb-4 text-ink-soft leading-relaxed">
          {renderInline(paraLines.join(" "), `p${start}`)}
        </p>,
      );
    }
  }

  return <div>{blocks}</div>;
}
