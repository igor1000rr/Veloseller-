import Link from "next/link";

type Props = { daysSinceSetup: number };

export function DayProgress({ daysSinceSetup }: Props) {
  if (daysSinceSetup >= 30) return null;

  let stage: "day1" | "day7" | "day30" = "day1";
  if (daysSinceSetup >= 7) stage = "day30";
  else if (daysSinceSetup >= 1) stage = "day7";

  const content = {
    day1: {
      title: "Данные записаны",
      body: "За сегодня мы всё записали, но нам понадобится несколько дней, чтобы дать тебе больше полезной информации.",
      next: "Через 7 дней появится: TVelo по каждому SKU, скорости продаж, lost revenue, заканчивающиеся остатки.",
    },
    day7: {
      title: "Первые расчёты готовы",
      body: `Прошло ${daysSinceSetup} ${pluralDay(daysSinceSetup)}. Теперь видны TVelo, покрытие, OOS — но достоверность данных ещё не максимальная.`,
      next: "Через месяц увидишь: помесячную динамику, недооценённые SKU, влияние цены, точные сегменты.",
    },
    day30: {
      title: "Аналитика накапливается",
      body: `Прошло ${daysSinceSetup} ${pluralDay(daysSinceSetup)}. Confidence растёт, появляются продвинутые метрики.`,
      next: "Через месяц достоверность данных будет максимальной — можно использовать для закупок.",
    },
  }[stage];

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-violet-600 mt-2"></div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-violet-900">{content.title}</h3>
          <p className="text-sm text-violet-800 mt-1">{content.body}</p>
          <p className="text-xs text-violet-700 mt-2">{content.next}</p>
        </div>
        <Link href="/onboarding" className="text-xs text-violet-700 hover:text-violet-900 font-medium whitespace-nowrap">
          Подробнее →
        </Link>
      </div>
    </div>
  );
}

function pluralDay(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  const last = n % 10;
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}
