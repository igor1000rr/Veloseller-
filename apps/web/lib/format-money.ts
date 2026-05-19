/**
 * Форматирование денежных сумм в валюте селлера.
 *
 * Поле currency хранится в sellers.currency (default 'RUB'). Служит для корректного
 * отображения выручки/остатков пользователям в разных странах.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string = "RUB",
): string {
  if (amount == null) return "—";
  // Для рублей и RUB-подобных валют мелкие деления (копейки) обычно не нужны.
  // Для USD/EUR — оставим без дробной части тоже, т.к. это KPI-дашборд.
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Невалидный currency code — fallback на RUB
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
