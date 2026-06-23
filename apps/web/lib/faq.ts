// FAQ-вопросы вынесены сюда, чтобы переиспользовать в двух местах:
// 1) <FaqAccordion> на главной — визуальный аккордеон
// 2) JSON-LD FAQPage schema на главной — для Google rich snippets
//
// Когда Google видит FAQPage, он показывает развёрнутые ответы прямо в выдаче,
// что даёт серьёзный буст CTR.
//
// Локале-зависимо: РФ-сборка отдаёт прежний русский FAQ (1:1), .com — английский,
// адаптированный под свой набор источников (Shopify/Google Sheet) и USD-тарифы.
// Экспорт faqItems сохранён — потребители (FaqAccordion, JSON-LD) не меняются.
import { LOCALE } from "@/lib/features";

export type FaqItem = { q: string; a: string };

const FAQ_RU: FaqItem[] = [
  {
    q: 'Сколько по времени занимает подключение?',
    a: '5-10 минут. Для Google Sheet вставить ссылку. Для Ozon/WB выдать read-only API ключ в личном кабинете маркетплейса. Один Ozon-ключ может питать сразу два склада — Ozon FBO (остатки на складах маркетплейса) и Ozon FBS (ваш склад).',
  },
  {
    q: 'Через сколько будет видна польза?',
    a: 'Первый сводный отчёт через 30 минут. Для точных прогнозов нужно минимум 7 дней истории — так алгоритм выявляет паттерны продаж. Наибольшая достоверность данных после 30 дней.',
  },
  {
    q: 'Что если у меня несколько складов на разных маркетплейсах?',
    a: 'Подключите каждый склад отдельно — Ozon FBO, Ozon FBS, Wildberries FBO. Данные считаются раздельно и не смешиваются.',
  },
  {
    q: 'Нужно ли выдавать вам доступ на изменение данных?',
    a: 'Нет. Исключительно read-only — мы читаем остатки и продажи, ничего не записываем.',
  },
  {
    q: 'Чем TVelo лучше обычного расчёта скорости продаж в Excel?',
    a: 'Обычный расчёт скорости продаж: Продажи/Дни неверно учитывает периоды, когда товара не было на складе. Наш расчёт реальной скорости продаж TVelo: Продажи/Дни, когда товар был на складе. Разница может очень сильно влиять на расчёт закупки и других показателей склада.',
  },
  {
    q: 'Есть ли бесплатный пробный период?',
    a: 'Да — 30 дней любого плана, 15 складов как на Pro. Карта не требуется. Если не подошло — просто перестаёшь пользоваться.',
  },
];

const FAQ_EN: FaqItem[] = [
  {
    q: 'How long does it take to connect?',
    a: '5–10 minutes. For Google Sheet, paste a link to your spreadsheet. For Shopify, create a custom app in your store admin (scope read_products) and paste the Admin API access token. The token is read-only — we never modify your store.',
  },
  {
    q: 'How soon will I see value?',
    a: 'Your first summary report appears within 30 minutes. Accurate forecasts need at least 7 days of history — that is how the algorithm picks up sales patterns. Data is most reliable after 30 days.',
  },
  {
    q: 'What if I have several stores or warehouses?',
    a: 'Connect each one separately — every store is analyzed on its own, data never mixes.',
  },
  {
    q: 'Do you need write access to my data?',
    a: 'No. Strictly read-only — we read stock levels and prices, we never write anything.',
  },
  {
    q: 'Why is TVelo better than a plain sales-velocity formula in Excel?',
    a: 'The usual sales-velocity calc, Sales / Days, miscounts the periods when an item was out of stock. Our real sales-velocity metric, TVelo: Sales / in-stock days. The difference can drastically change purchase planning and other warehouse metrics.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — 30 days of any plan with 15 warehouses, same as Pro. No credit card required. If it is not a fit, just stop using it.',
  },
];

export const faqItems: FaqItem[] = LOCALE === "en" ? FAQ_EN : FAQ_RU;
