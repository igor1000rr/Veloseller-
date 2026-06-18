"use client";
import { useEffect, useState } from "react";

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
    <div className="rounded-2xl border border-line bg-paper p-6 md:p-8 shadow-sm">
      <div className="mx-auto flex w-full max-w-sm gap-1.5 rounded-xl bg-bg-soft p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={"flex-1 rounded-lg px-3 py-2 text-sm font-medium transition " + (tab === t.key ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ol className="mt-7 mx-auto max-w-md space-y-3 text-left">
        {active.steps.map((st, idx) => (
          <li key={st} className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-soft text-lime-deep font-mono text-xs font-semibold">{idx + 1}</span>
            <span className="text-sm text-ink-soft leading-relaxed">{st}</span>
          </li>
        ))}
      </ol>

      {deferred ? (
        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-ink text-paper px-6 py-3 text-sm font-semibold hover:bg-ink-soft transition shadow-[0_10px_30px_-10px_rgba(10,10,8,0.45)] hover:-translate-y-0.5"
          >
            Установить сейчас
          </button>
        </div>
      ) : null}
    </div>
  );
}
