"use client";

// Yandex.Metrika — грузится ТОЛЬКО на RU-деплое и ТОЛЬКО после согласия
// пользователя (cookie-баннер → "accepted"). До согласия счётчик не
// инициализируется: ни cookies, ни webvisor (запись сессий), ни clickmap.
// Это требование 152-ФЗ и условие самой Метрики на сбор ПДн/поведения.
import Script from "next/script";
import { useEffect, useState } from "react";
import { LOCALE } from "@/lib/features";
import { CONSENT_EVENT, getStoredConsent, type ConsentValue } from "@/lib/consent";

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

/** Счётчик Яндекс.Метрики — только RU-деплой + только при cookie-согласии. */
export function YandexMetrika() {
  const [consent, setConsent] = useState<ConsentValue>(null);

  useEffect(() => {
    setConsent(getStoredConsent());
    const onChange = (e: Event) => setConsent((e as CustomEvent<ConsentValue>).detail ?? getStoredConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (LOCALE !== "ru" || consent !== "accepted") return null;

  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {METRIKA_INIT}
    </Script>
  );
}
