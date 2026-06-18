import type { ReactNode } from "react";

// Двухцветные линейные иконки для маркетинговых страниц. Цвет берётся из
// родителя (currentColor), поэтому красятся акцентом карточки. Без хуков —
// можно рендерить и в серверных, и в клиентских компонентах.
const BASE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<string, ReactNode> = {
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  cap: (
    <>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5" />
      <path d="M22 9v5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
      <path d="M12 17v4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 7.5 12.5 6a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
      <path d="M13 16.5 11.5 18a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h3" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="8" cy="7" rx="5.5" ry="3" />
      <path d="M2.5 7v4.5c0 1.7 2.5 3 5.5 3" />
      <path d="M13.5 9.2c3 .2 5.5 1.5 5.5 3.3V17c0 1.7-2.5 3-5.5 3s-5.5-1.3-5.5-3v-4.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4v5h-5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M21 11V7h-4" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v3.5" />
      <path d="M12 17.5V21" />
      <path d="M3 12h3.5" />
      <path d="M17.5 12H21" />
      <path d="m6 6 2.4 2.4" />
      <path d="m15.6 15.6 2.4 2.4" />
      <path d="m18 6-2.4 2.4" />
      <path d="m8.4 15.6-2.4 2.4" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="11" rx="1.5" />
      <rect x="13" y="3" width="8" height="6" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <rect x="3" y="18" width="8" height="3" rx="1.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.5 21a1.5 1.5 0 0 0 3 0" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <rect x="7.5" y="11" width="3" height="6" rx="0.5" />
      <rect x="12.5" y="7" width="3" height="10" rx="0.5" />
      <rect x="17.5" y="13" width="3" height="4" rx="0.5" />
    </>
  ),
  check: <path d="m5 12 4 4 10-10" />,
};

export function MIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...BASE} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
