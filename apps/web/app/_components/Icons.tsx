// Все SVG иконки приложения — без unicode-символов, currentColor для наследования.
export const Icons = {
  // Лого Veloseller (правка 8, 25.05.2026): две зелёные горы образующие M.
  // Раньше был чёрный квадрат с лаймовой ломаной — Александр прислал новый логотип
  // в zip-архиве (исходный 1100×1100 PNG лежит в /public/logo.png для OG/email).
  // Здесь чистый SVG-ремэйк — резкий на любом размере, мало байт, без сетевого запроса.
  // Левая/правая горы — светло-зелёный градиент; их перекрытие нарисовано отдельным
  // тёмным треугольником (имитирует прозрачное наложение оригинала).
  // ID градиентов с префиксом vs-logo чтобы не конфликтовали с другими SVG в DOM;
  // при множественном рендере браузер использует первый найденный <defs> с этим ID —
  // содержимое идентичное, поэтому коллизий быть не может.
  Logo: ({ size = 28 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-label="Veloseller">
      <defs>
        <linearGradient id="vs-logo-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#65a30d" />
          <stop offset="1" stopColor="#bef264" />
        </linearGradient>
        <linearGradient id="vs-logo-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#365314" />
          <stop offset="1" stopColor="#4d7c0f" />
        </linearGradient>
      </defs>
      {/* Левая гора */}
      <path d="M0 24 L10 5 L19 24 Z" fill="url(#vs-logo-light)" />
      {/* Правая гора */}
      <path d="M8 24 L18 5 L27 24 Z" fill="url(#vs-logo-light)" />
      {/* Перекрытие — тёмный треугольник между вершинами */}
      <path d="M8 24 L14 13 L19 24 Z" fill="url(#vs-logo-dark)" />
    </svg>
  ),

  ArrowRight: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 7h12m0 0L8 2m5 5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  ArrowDownRight: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 5v6H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  Check: ({ size = 14, className = "" }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <path d="M2 7l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  Cross: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),

  Plus: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  Dot: ({ size = 4, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 4 4" aria-hidden>
      <circle cx="2" cy="2" r="2" fill={color} />
    </svg>
  ),

  Star: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M7 1l1.8 4 4.2.4-3.2 2.8 1 4.2L7 10.4 3.2 12.4l1-4.2L1 5.4 5.2 5z" />
    </svg>
  ),

  Menu: ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  Close: ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M5 5l12 12M17 5l-12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),

  Speed: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  Shield: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 2L3 4.5v5c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5v-5L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Coverage: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="4" width="14" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M7 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Health: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 10h3l2-5 2 10 2-5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Bell: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 9a5 5 0 1110 0v4l1.5 2H3.5L5 13V9zM8 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Plug: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M7 2v3M13 2v3M6 5h8v4a4 4 0 11-8 0V5zM10 13v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Telegram — бумажный самолётик (currentColor, наследует цвет родителя).
  Telegram: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.27-.89-.86.2-1.3l15.97-6.16c.73-.27 1.37.18 1.13 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  ),
};
