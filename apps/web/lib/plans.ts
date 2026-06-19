/**
 * Тарифы Veloseller и Radar — единственный источник для UI (биллинг, лендинг).
 *
 * Локале-зависимы: РФ-сборка — рубли, .com — USD ($0/$29/$79/$149).
 *
 * Сетка Александра 04.06.2026 (РФ): Триал 15 складов × 10000 SKU,
 * Старт 2 × 1000, Рост 5 × 2000; четвёртая карточка — «Конструктор»
 * (1–20 складов × 1000–20000 SKU, см. lib/custom-plan.ts), он рендерится
 * отдельным компонентом PlanBuilder, поэтому в этом массиве его нет.
 * Тариф Про из РФ-сетки убран (legacy: активация старых оплат работает).
 * EN-сетка не менялась (конструктор — фича РФ/Робокассы), только лимиты
 * синхронизированы с серверными.
 *
 * Цены здесь — только отображение. Суммы списания Робокассы живут на сервере
 * (/api/robokassa/create-payment) и этим файлом не трогаются.
 */
import { LOCALE } from "@/lib/features";

export type BillingPlan = {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
};

const VELOSELLER_PLANS_RU: BillingPlan[] = [
  { id: "trial",   name: "Триал",  price: 0,     period: "30 дней бесплатно",
    features: ["3 склада", "10 000 SKU на склад", "Весь функционал бесплатно"] },
  { id: "starter", name: "Старт",  price: 2500,  period: "₽/мес",
    features: ["2 склада", "1 000 SKU на склад"] },
  { id: "growth",  name: "Рост",   price: 6900,  period: "₽/мес",
    features: ["5 складов", "2 000 SKU на склад"] },
];

const VELOSELLER_PLANS_EN: BillingPlan[] = [
  { id: "trial",   name: "Trial",   price: 0,   period: "30 days free",
    features: ["15 warehouses", "10,000 SKUs per warehouse", "Full feature set, free"] },
  { id: "starter", name: "Starter", price: 29,  period: "/mo",
    features: ["2 warehouses", "1,000 SKUs per warehouse"] },
  { id: "growth",  name: "Growth",  price: 79,  period: "/mo",
    features: ["5 warehouses", "2,000 SKUs per warehouse"] },
  { id: "pro",     name: "Pro",     price: 149, period: "/mo",
    features: ["15 warehouses", "10,000 SKUs per warehouse"] },
];

export const VELOSELLER_PLANS: BillingPlan[] =
  LOCALE === "en" ? VELOSELLER_PLANS_EN : VELOSELLER_PLANS_RU;

/**
 * Radar — модуль только РФ-версии (Wordstat/WB/OZON suggest; .com собирается
 * с RADAR_ENABLED=false и эту сетку не рендерит), поэтому без en-варианта.
 */
export const RADAR_PLANS: BillingPlan[] = [
  { id: "radar_start",  name: "Radar Старт",   price: 900,   period: "₽/мес",
    features: ["3 бренда", "Wordstat + WB/OZON suggest", "Email дайджест"] },
  { id: "radar_seller", name: "Radar Селлер",  price: 2500,  period: "₽/мес",
    features: ["10 брендов", "Всё из Старт", "ИИ-парсинг прайса"] },
  { id: "radar_pro",    name: "Radar Про",     price: 5000,  period: "₽/мес",
    features: ["30 брендов", "Всё из Селлер", "Telegram-бот"] },
  { id: "radar_expert", name: "Radar Эксперт", price: 10000, period: "₽/мес",
    features: ["100 брендов", "Всё из Про", "Приоритетная поддержка"] },
];

/**
 * Цена тарифа для отображения. РФ: "2 500" (знак ₽ живёт в period — как было).
 * EN: "$29" (знак валюты в цене, period = "/mo").
 */
export function formatPlanPrice(price: number): string {
  return LOCALE === "en"
    ? `$${price.toLocaleString("en-US")}`
    : price.toLocaleString("ru-RU");
}
