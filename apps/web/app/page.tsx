import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-brand-50 to-white">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-bold tracking-tight text-brand-700">
          Veloseller
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-brand-700">
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Начать
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Скорость продаж без вранья
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          Большинство селлеров считают скорость продаж неправильно — не учитывают дни отсутствия товара на складе.
          Мы учтём. Найдём, на каких SKU вы теряете деньги, сколько денег заморожено в плохих остатках.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-xl bg-brand-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            Подключи магазин за 5 минут
          </Link>
          <Link href="#how" className="text-base font-semibold text-slate-700 hover:text-brand-700">
            Как это работает →
          </Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">1 месяц бесплатно • без карты</p>
      </section>

      {/* Features */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">Что вы получите</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-bold text-slate-900">Тарифы</h2>
        <p className="mt-2 text-slate-600">Первый месяц — бесплатно.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border bg-white p-6 ${
                p.highlight ? "border-brand-600 ring-2 ring-brand-100" : "border-slate-200"
              }`}
            >
              <div className="text-sm font-semibold text-brand-700">{p.name}</div>
              <div className="mt-3 text-3xl font-bold text-slate-900">
                ${p.price}
                <span className="text-base font-normal text-slate-500">/мес</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">до {p.skus} SKU</div>
              <Link
                href="/register"
                className="mt-6 block rounded-xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-slate-700"
              >
                Попробовать
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Veloseller. Inventory Intelligence for Ecommerce.
      </footer>
    </main>
  );
}

const features = [
  {
    title: "Скорость продаж TVelo",
    text: "Учитываем out-of-stock дни — данные становятся качественно точнее, видно как товар продавался период к периоду.",
  },
  {
    title: "Покрытие склада",
    text: "На сколько дней хватит остатков с текущей скоростью продаж. Заранее предотвращаем дефицит и неликвид.",
  },
  {
    title: "Inventory Health Score",
    text: "Здоровье склада 0–100 с учётом рисков дефицита, избытка, неликвида. По товару и по складу целиком.",
  },
  {
    title: "Достоверность данных",
    text: "Видно, насколько надёжна каждая метрика. Аномалии, пополнения и пропуски — всё учтено и расшифровано.",
  },
  {
    title: "Полезные уведомления",
    text: "Товар скоро закончится. Товар неоднократно отсутствовал. Возможен избыток на складе.",
  },
  {
    title: "Подключение за 5 минут",
    text: "Google Sheet, CSV или API маркетплейса (Ozon, WB). Никакого write-доступа — только чтение.",
  },
];

const plans = [
  { name: "Starter", price: 24, skus: "500" },
  { name: "Growth", price: 89, skus: "4 000", highlight: true },
  { name: "Pro", price: 299, skus: "10 000" },
];
