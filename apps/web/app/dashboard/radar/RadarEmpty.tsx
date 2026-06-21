import Link from "next/link";

export default function RadarEmpty() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-paper p-8 md:p-12 text-center">
      <h2 className="font-display text-xl md:text-2xl font-medium text-ink">Начните с прайса</h2>
      <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">
        Загрузите прайс поставщиков — ИИ извлечёт бренды, вы подтвердите
        список, и Radar начнёт раз в 3 дня опрашивать Wordstat и
        WB/OZON suggest. Через неделю — первый дайджест с новинками.
      </p>
      <div className="mt-6 flex gap-3 justify-center flex-wrap">
        <Link
          href={"/dashboard/radar/upload"}
          className="inline-flex items-center rounded-lg bg-lime-deep text-paper px-5 py-3 font-mono uppercase tracking-wider text-sm font-semibold hover:bg-lime-deep/90 transition"
        >
          Загрузить прайс
        </Link>
        <Link
          href={"/dashboard/radar/brands"}
          className="inline-flex items-center rounded-lg border border-line bg-paper text-ink-muted hover:text-ink px-5 py-3 font-mono uppercase tracking-wider text-sm transition"
        >
          Добавить руками
        </Link>
      </div>
    </div>
  );
}
