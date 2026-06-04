/**
 * Контент лендинга — локале-зависимые массивы.
 *
 * Вынесено из page.tsx: (1) монолит 42КБ не пролезал в MCP-пуш целиком,
 * (2) контент отделён от разметки. РФ-массивы 1:1 со старым хардкодом page.tsx,
 * en — адаптация под .com (Shopify/Google Sheets вместо Ozon/WB).
 */
import { LOCALE } from "@/lib/features";
import { VELOSELLER_PLANS } from "@/lib/plans";

export const isEn = LOCALE === "en";

export const stats = isEn
  ? [
      { label: "TVelo accuracy", value: "+47", unit: "%", sub: "vs naive sales velocity" },
      { label: "Average setup time", value: "5", unit: "min", sub: "from sign-up to data" },
      { label: "Warehouse types", value: "2", sub: "Shopify, Google Sheets" },
      { label: "Metrics per SKU", value: "23", sub: "including data confidence" },
    ]
  : [
      { label: "Точность TVelo", value: "+47", unit: "%", sub: "vs обычная скорость продаж" },
      { label: "Среднее время настройки", value: "5", unit: "мин", sub: "от регистрации до данных" },
      { label: "Типов складов", value: "5", sub: "Ozon FBO/FBS, WB FBO/FBS, Sheets" },
      { label: "Метрик по каждому SKU", value: "23", sub: "включая достоверность данных" },
    ];

export const integrations = isEn
  ? [
      { name: "Shopify",       tag: "API",       dot: "#95BF47" },
      { name: "Google Sheets", tag: "READ-ONLY", dot: "#0F9D58" },
      { name: "Telegram",      tag: "BOT",       dot: "#229ED9" },
      { name: "Amazon",        tag: "SOON",      dot: "#FF9900" },
    ]
  : [
      { name: "Ozon FBS",        tag: "API",       dot: "#005bff" },
      { name: "Ozon FBO",        tag: "API",       dot: "#005bff" },
      { name: "Wildberries FBS", tag: "API",       dot: "#a71179" },
      { name: "Wildberries FBO", tag: "API",       dot: "#a71179" },
      { name: "Google Sheets",   tag: "READ-ONLY", dot: "#0F9D58" },
      { name: "Telegram",        tag: "BOT",       dot: "#229ED9" },
    ];

export const compareLeft = isEn
  ? [
      "You compute sales velocity by hand once a month",
      "Out-of-stock days are ignored — your numbers are distorted",
      "No idea how much money is stuck in dead stock",
      "Alarms arrive after the fact, when it is already too late",
    ]
  : [
      "Считаешь скорость продаж вручную раз в месяц",
      "Не учитываешь дни отсутствия товара на складе — данные искажены",
      "Не видишь сколько денег зависло в неликвиде",
      "Тревожные сигналы приходят постфактум, когда уже поздно",
    ];

export const compareRight = isEn
  ? [
      "We exclude out-of-stock days — true sales velocity",
      "Reorder signal 7–14 days before you run out",
      "Telegram + email reports every morning",
    ]
  : [
      "Вычитаем дни отсутствия товара на складе — реальная скорость продаж",
      "Сигнал на закупку за 7–14 дней до окончания остатков",
      "Telegram + email отчёты каждое утро",
    ];

export const steps = isEn
  ? [
      { title: "Connect your store", text: "Shopify or Google Sheet — pick a source and provide a read-only token. Every source = a separate warehouse with its own analytics." },
      { title: "Get your first numbers", text: "A warehouse summary in 30 minutes. First TVelo and other metrics in 7 days. After 30 days data confidence improves significantly." },
      { title: "Manage stock with data", text: "Get Telegram and email alerts, watch risks, plan purchasing and control stock in a single dashboard." },
    ]
  : [
      { title: "Подключи склад",     text: "Ozon FBO/FBS, Wildberries или Google Sheet — выбери источник, дай read-only ключ. Каждый источник = отдельный склад с собственной аналитикой." },
      { title: "Получи первый расчёт",   text: "Через 30 минут — сводная информация по складу. Через 7 дней — первые TVelo и другие показатели. Через 30 дней — значительно улучшена достоверность данных." },
      { title: "Управляй запасами на основе данных",   text: "Получай сигналы в Telegram и email, следи за рисками, планируй закупки и контролируй остатки в одном дашборде." },
    ];

export const testimonials = isEn
  ? [
      { quote: "Finally stopped computing sales velocity in Excel. Within a week I saw 12% of my working capital frozen in dead stock — cut a couple of reorders and freed up $4k.", name: "Alex Carter", role: "Shopify seller, 1,200 SKUs", initials: "AC", avatarBg: "#84cc16", avatarColor: "#0a0a08" },
      { quote: "TVelo showed that half of my 'slow' items were actually fast — they just kept going out of stock. Reordered them — revenue +18% in a month.", name: "Maria Lopez", role: "Shopify, 3,400 SKUs", initials: "ML", avatarBg: "#0284c7", avatarColor: "#fff" },
      { quote: "Telegram alerts are the killer feature. I do not sit in dashboards. A signal comes in, I reorder, done.", name: "Daniel Brooks", role: "Multi-store, 800 SKUs", initials: "DB", avatarBg: "#ea580c", avatarColor: "#fff" },
    ]
  : [
      { quote: "Наконец перестал считать скорость продаж в Excel. Через неделю увидел, что 12% оборотных денег заморожено в неликвиде — закрыл закупку на пару SKU и освободил 380к.", name: "Артём Кузнецов", role: "Селлер на Ozon, 1200 SKU", initials: "АК", avatarBg: "#84cc16", avatarColor: "#0a0a08" },
      { quote: "TVelo показал, что половина моих медленных товаров на самом деле быстрые — просто часто уходили в out-of-stock. Перезаказал — выручка +18% за месяц.", name: "Мария Логинова", role: "WB Premium, 3400 SKU", initials: "МЛ", avatarBg: "#0284c7", avatarColor: "#fff" },
      { quote: "Telegram-уведомления — главная фишка. Не сижу в дашборде. Приходит сигнал и пошёл, заказал, забыл.", name: "Дмитрий Беляев", role: "Multi-marketplace, 800 SKU", initials: "ДБ", avatarBg: "#ea580c", avatarColor: "#fff" },
    ];

export const footerWarehouseTypes = isEn
  ? ["Shopify", "Google Sheet"]
  : ["Ozon FBS", "Ozon FBO", "Wildberries FBS", "Wildberries FBO", "Google Sheet"];

export type LandingPlan = {
  name: string;
  price: number;
  highlight: boolean;
  perks: string[];
  /** Цена «от …» — для Конструктора (минимальная конфигурация). */
  fromPrice?: boolean;
};

/** Платные тарифы для офферов JSON-LD (без триала). */
export const paidPlans = VELOSELLER_PLANS.filter((p) => p.id !== "trial");

/**
 * Карточки цен лендинга. РФ (сетка Александра 04.06.2026): Старт, Рост (подсвечен)
 * и «Конструктор» от 1500 ₽ (1 склад × 1000 SKU). EN: фикс-тарифы как есть.
 */
export const landingPlans: LandingPlan[] = [
  ...paidPlans.map((p) => ({
    name: p.name,
    price: p.price,
    highlight: p.id === "growth",
    perks: p.features,
  })),
  ...(isEn
    ? []
    : [{
        name: "Конструктор",
        price: 1500,
        highlight: false,
        fromPrice: true,
        perks: [
          "1–20 складов",
          "1 000–20 000 SKU на склад",
          "Склад — 1 000 ₽, каждые 1 000 SKU — 500 ₽",
        ],
      }]),
];
