"use client";
import Link from "next/link";
import { Icons } from "../../../_components/Icons";

// Ссылка «Все SKU» в шапке карточки.
//
// Баг: карточка открывается в Drawer как <iframe ...?embed=1>. Обычная ссылка
// грузила список SKU ВНУТРЬ панели (iframe), а клик по товару там слал
// velo:open-sku в окно iframe, где обработчика нет → клики мертвели.
//
// Фикс: если мы внутри панели (embed + iframe) — не навигируем iframe, а просим
// родителя закрыть Drawer (postMessage). Пользователь возвращается к общему
// списку, который уже отрисован под панелью. В обычном окне — обычная навигация.
export default function BackToSkus({ label }: { label: string }) {
  const onClick = (e: React.MouseEvent) => {
    if (typeof window === "undefined") return;
    // Карточку в iframe открывает ТОЛЬКО SkuDrawer, поэтому «мы внутри iframe»
    // (window.parent !== window) — достаточный и надёжный признак панели. Раньше
    // дополнительно требовали ?embed=1 в URL; если бы параметр потерялся (редирект,
    // клиентская навигация и т.п.) — перехват отваливался и список грузился внутрь
    // панели. Теперь решаем по факту iframe → не навигируем, а просим родителя закрыть.
    if (window.parent !== window) {
      e.preventDefault();
      window.parent.postMessage({ type: "velo:close-sku" }, window.location.origin);
    }
  };

  return (
    <Link
      href="/dashboard/skus"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition py-1"
    >
      <span className="rotate-180"><Icons.ArrowRight size={12} /></span> {label}
    </Link>
  );
}
