// Yandex.Metrika counter — ранняя загрузка на всех страницах (RU-деплой).
import Script from "next/script";
import { LOCALE } from "@/lib/features";

const METRIKA_ID = 109864311;

const METRIKA_INIT = `
(function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}', 'ym');

ym(${METRIKA_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
`;

/** Счётчик Яндекс.Метрики — только на RU-деплое (veloseller.ru). */
export function YandexMetrika() {
  if (LOCALE !== "ru") return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="beforeInteractive">
        {METRIKA_INIT}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
