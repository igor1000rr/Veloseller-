"use client";
import { useEffect, useState } from "react";
import { PhoneFrame, ScreenHome } from "./DeviceMockups";

// Переключаемые инструкции установки PWA + реальная кнопка установки на Android
// (через перехват beforeinstallprompt). На iOS системного промпта нет — только шаги.
const TABS = [
  { key: "ios", label: "iPhone · Safari", steps: ["Откройте сайт в Safari", "Нажмите кнопку «Поделиться»", "Выберите «На экран „Домой“»", "Готово — иконка на главном экране"] },
  { key: "android", label: "Android · Chrome", steps: ["Откройте сайт в Chrome", "Откройте меню браузера (три точки)", "Нажмите «Установить приложение»", "Готово — иконка на главном экране"] },
];

export default function AppsInstallTabs() {
  const [tab, setTab] = useState("ios");
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setTab("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  const install = () => {
    if (deferred && typeof deferred.prompt === "function") {
      deferred.prompt();
      setDeferred(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-paper to-lime-soft shadow-sm">
      <div className="grid items-center gap-8 p-6 md:p-10 lg:grid-cols-2 lg:gap-12">
        <div className="relative order-2 lg:order-1">
          <div aria-hidden className="pointer-events-none absolute inset-0 blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.35), transparent 70%)" }} />
          <div className="relative">
            <PhoneFrame widthClass="w-[230px]"><ScreenHome /></PhoneFrame>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="flex w-full max-w-sm gap-1.5 rounded-xl border border-line bg-paper/70 p-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={"flex-1 rounded-lg px-3 py-2 text-sm font-medium transition " + (tab === t.key ? "bg-gradient-to-br from-lime-deep to-emerald text-paper shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ol className="mt-6 space-y-3.5">
            {active.steps.map((st, idx) => (
              <li key={st} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lime-deep to-emerald font-mono text-sm font-semibold text-paper shadow-md">{idx + 1}</span>
                <span className="pt-1 text-sm md:text-[15px] text-ink-soft leading-snug">{st}</span>
              </li>
            ))}
          </ol>

          <div className="mt-7">
            {deferred ? (
              <button
                type="button"
                onClick={install}
                className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5"
              >
                Установить сейчас
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper/70 px-4 py-2.5 text-sm text-ink-muted">
                <span className="size-1.5 rounded-full bg-lime-deep" />
                Откройте на телефоне, чтобы установить
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
