import Link from 'next/link';
import type { ReactNode } from 'react';

// Простой парсер для подмножества Markdown без зависимостей.
// Поддерживает: ## H2, ### H3, - списки, 1. упорядоченные списки,
//   '= ...' formula-блок (моноширинный), inline **bold**, _italic_, [text](url)

function renderInline(text: string, baseKey: string): ReactNode[] {
  const re = /\*\*([^*]+)\*\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    if (m[1]) {
      parts.push(<strong key={`${baseKey}-${key++}`} className="font-medium text-ink">{m[1]}</strong>);
    } else if (m[2]) {
      parts.push(<em key={`${baseKey}-${key++}`} className="italic">{m[2]}</em>);
    } else if (m[3]) {
      const url = m[4]!;
      const isExternal = url.startsWith('http');
      parts.push(
        <Link
          key={`${baseKey}-${key++}`}
          href={url as any}
          className="text-lime-deep underline decoration-lime-deep/30 underline-offset-2 hover:decoration-lime-deep transition"
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {m[3]}
        </Link>
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${key++}`} className="font-display text-2xl md:text-3xl mt-12 mb-4 tracking-tight font-medium text-ink">
          {renderInline(line.slice(3), `h2-${key}`)}
        </h2>
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${key++}`} className="font-display text-lg md:text-xl mt-8 mb-3 tracking-tight font-medium text-ink">
          {renderInline(line.slice(4), `h3-${key}`)}
        </h3>
      );
      i++;
      continue;
    }

    if (line.startsWith('= ')) {
      blocks.push(
        <div
          key={`formula-${key++}`}
          className="my-6 font-mono text-sm md:text-[15px] bg-bg-soft border border-line rounded-lg px-5 py-4 overflow-x-auto text-ink-soft tabular"
        >
          {line.slice(2)}
        </div>
      );
      i++;
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="my-5 space-y-2 pl-6 list-disc marker:text-lime-deep">
          {items.map((item, j) => (
            <li key={j} className="text-ink-soft leading-relaxed text-[15px] md:text-base">
              {renderInline(item, `ul-${key}-${j}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="my-5 space-y-2 pl-6 list-decimal marker:text-lime-deep marker:font-mono marker:text-sm">
          {items.map((item, j) => (
            <li key={j} className="text-ink-soft leading-relaxed text-[15px] md:text-base pl-1">
              {renderInline(item, `ol-${key}-${j}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="my-4 text-ink-soft leading-relaxed text-[15px] md:text-base">
        {renderInline(line, `p-${key}`)}
      </p>
    );
    i++;
  }

  return <div className="prose-content">{blocks}</div>;
}
