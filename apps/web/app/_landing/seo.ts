/**
 * SEO лендинга: metadata главной + JSON-LD граф.
 * Локале-зависимо; валюта и офферы — из lib/plans (единый источник с биллингом).
 * SITE_URL — из фиче-флагов (NEXT_PUBLIC_SITE_URL, дефолт РФ-прод).
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/features";
import { faqItems } from "@/lib/faq";
import { isEn, paidPlans } from "./data";

// Главная имеет свой title без template — title.absolute убирает суффикс
// " — Veloseller" из layout. Правка Александра: title = h1.
export const landingMetadata: Metadata = isEn
  ? {
      title: { absolute: "Sales velocity without distortion — Veloseller" },
      description:
        "For ecommerce sellers: TVelo (true sales velocity that excludes out-of-stock days), days of cover, stockout forecast, safety stock, lost revenue. Connect Shopify or Google Sheets in 5 minutes.",
      alternates: { canonical: "/" },
    }
  : {
      title: { absolute: "Скорость продаж без искажений — Veloseller" },
      description:
        "Сервис для маркетплейс-селлеров: TVelo (реальная скорость продаж с учётом out-of-stock дней), дни покрытия, прогноз нехватки, расчёт минимального остатка (safety stock), потерянная выручка. Подключение через API Wildberries, Ozon или Google Sheets за 5 минут.",
      alternates: { canonical: "/" },
    };

const LD = isEn
  ? {
      orgDescription: "Inventory management service for Shopify sellers. TVelo, out-of-stock forecast, safety stock, days of cover.",
      siteDescription: "Inventory management for Shopify and Google Sheets. TVelo, days of cover, out-of-stock forecast, safety stock.",
      appDescription: "Inventory management service for ecommerce sellers. Calculates true sales velocity (TVelo) excluding out-of-stock days, forecasts stockouts, computes safety stock and days of cover for every SKU on Shopify and Google Sheets.",
      inLanguage: "en-US",
      availableLanguage: ["English"],
      priceCurrency: "USD",
      featureList: [
        "TVelo — true sales velocity excluding out-of-stock days",
        "Days of cover for every SKU",
        "Out-of-stock forecast 7-14 days ahead",
        "Safety stock calculation",
        "Lost revenue from stockouts",
        "Telegram and email alerts",
        "Read-only integration with Shopify and Google Sheets",
      ],
    }
  : {
      orgDescription: "Сервис управления остатками для селлеров Wildberries и Ozon. Расчёт TVelo, прогноз out-of-stock, safety stock, дни покрытия.",
      siteDescription: "Управление остатками на Wildberries и Ozon. TVelo, дни покрытия, прогноз out-of-stock, safety stock.",
      appDescription: "Сервис управления складскими остатками для маркетплейс-селлеров. Считает реальную скорость продаж (TVelo) с учётом out-of-stock дней, прогнозирует нехватку товара, рассчитывает минимальный остаток (safety stock) и дни покрытия по каждому SKU на Ozon FBO/FBS, Wildberries и Google Sheets.",
      inLanguage: "ru-RU",
      availableLanguage: ["Russian"],
      priceCurrency: "RUB",
      featureList: [
        "TVelo — реальная скорость продаж с учётом out-of-stock",
        "Дни покрытия по каждому SKU",
        "Прогноз out-of-stock на 7-14 дней вперёд",
        "Расчёт минимального остатка (safety stock)",
        "Расчёт потерянной выручки из-за нехватки товара",
        "Алерты в Telegram и email",
        "Read-only интеграция с Wildberries, Ozon FBO/FBS, Google Sheets",
      ],
    };

export const landingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "Veloseller",
      url: SITE_URL,
      description: LD.orgDescription,
      email: "info@proaim.ru",
      contactPoint: {
        "@type": "ContactPoint",
        email: "info@proaim.ru",
        contactType: "customer support",
        availableLanguage: LD.availableLanguage,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: "Veloseller",
      url: SITE_URL,
      description: LD.siteDescription,
      inLanguage: LD.inLanguage,
      publisher: { "@id": `${SITE_URL}#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#software`,
      name: "Veloseller",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Inventory Management",
      operatingSystem: "Web",
      url: SITE_URL,
      description: LD.appDescription,
      inLanguage: LD.inLanguage,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: LD.priceCurrency,
        lowPrice: String(paidPlans[0].price),
        highPrice: String(paidPlans[paidPlans.length - 1].price),
        offerCount: paidPlans.length,
        offers: paidPlans.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: String(p.price),
          priceCurrency: LD.priceCurrency,
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/billing`,
          description: p.features[0],
        })),
      },
      featureList: LD.featureList,
      publisher: { "@id": `${SITE_URL}#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}#faq`,
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};
