"use client";

/**
 * Ленивая обёртка над DashboardPreview (тянет recharts).
 *
 * Превью дашборда — самый тяжёлый клиентский кусок лендинга (recharts ~весомый
 * чанк) и живёт ниже первого экрана. Грузим его через next/dynamic с ssr:false,
 * чтобы recharts ушёл из основного бандла главной и не блокировал first paint.
 * Обёртка нужна потому, что Showcase — серверный компонент, а ssr:false в
 * next/dynamic допустим только в клиентских.
 */
import dynamic from "next/dynamic";

const DashboardPreview = dynamic(() => import("../DashboardPreview"), {
  ssr: false,
  // Заглушка под высоту превью — чтобы не было заметного скачка layout при подгрузке.
  loading: () => <div className="min-h-[480px] rounded-2xl border border-line bg-paper animate-pulse" />,
});

export default function DashboardPreviewLazy() {
  return <DashboardPreview />;
}
