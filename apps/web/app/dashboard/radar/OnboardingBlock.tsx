import Link from "next/link";

export function OnboardingBlock({ plan, brandsLimit }: { plan: string; brandsLimit: number }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold mb-3">
          Radar · Тариф {plan} · до {brandsLimit} брендов
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">
          Добавьте бренды для мониторинга
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">
          Загрузите ваш прайс — ИИ извлечёт список брендов автоматически.
          Либо добавьте бренды вручную. После подтверждения Radar начнёт
          собирать и обрабатывать информацию. Раз в 2 недели высылаем отчёт
          о проделанной работе.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href={"/dashboard/radar/upload" as any}
          className="group rounded-2xl border-2 border-lime-deep/30 bg-lime-soft/30 p-6 hover:border-lime-deep/60 hover:shadow-md transition"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold mb-2">
            Рекомендуется
          </div>
          <h3 className="font-display text-lg font-medium text-ink">Загрузить прайс</h3>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
            XLSX или CSV. ИИ найдёт бренды, вы подтвердите за 1 минуту.
            Поддерживается до 50 000 строк за раз.
          </p>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-wider text-lime-deep group-hover:underline">
            Загрузить →
          </div>
        </Link>

        <Link
          href={"/dashboard/radar/brands" as any}
          className="group rounded-2xl border border-line bg-paper p-6 hover:border-lime-deep/40 hover:shadow-sm transition"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-2">
            Альтернатива
          </div>
          <h3 className="font-display text-lg font-medium text-ink">Добавить вручную</h3>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
            Если у вас есть готовый список брендов или прайс не готов.
            Просто введите названия по одному.
          </p>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-wider text-ink-muted group-hover:text-lime-deep group-hover:underline">
            Открыть список →
          </div>
        </Link>
      </div>

      {/* «Как работает Radar» — текст Александра 01.06.2026 */}
      <div className="mt-8 rounded-xl border border-line bg-bg-soft p-5">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-3">
          Как работает Radar
        </h4>
        <ol className="space-y-2 text-sm text-ink leading-relaxed">
          <li><span className="font-mono text-xs text-lime-deep mr-2">01</span> Сервис делает обращение к Wordstat и получает поисковые запросы с частотой от 60</li>
          <li><span className="font-mono text-xs text-lime-deep mr-2">02</span> Каждый запрос проверяется через подсказки OZON и WB</li>
          <li><span className="font-mono text-xs text-lime-deep mr-2">03</span> Совпадение спроса — сигнал «Новый запрос» (на закупку)</li>
          <li><span className="font-mono text-xs text-lime-deep mr-2">04</span> Только Wordstat без подтверждения — «Ранний сигнал» (спрос на покупку не подтверждён)</li>
          <li><span className="font-mono text-xs text-lime-deep mr-2">05</span> Отчёты о работе приходят на email и в Telegram раз в 2 недели</li>
        </ol>
      </div>
    </div>
  );
}
