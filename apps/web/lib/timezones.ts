import { t } from "@/lib/i18n";

/**
 * Часовые пояса РФ/СНГ в формате IANA (sellers.timezone → pytz в воркере).
 * Метки показывают UTC-offset. Единый источник для /account и /dashboard/settings,
 * чтобы списки не расходились.
 */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/Kaliningrad", label: t("account.tz.kaliningrad") },
  { value: "Europe/Moscow",      label: t("account.tz.moscow") },
  { value: "Europe/Minsk",       label: t("account.tz.minsk") },
  { value: "Europe/Samara",      label: t("account.tz.samara") },
  { value: "Asia/Yekaterinburg", label: t("account.tz.yekaterinburg") },
  { value: "Asia/Omsk",          label: t("account.tz.omsk") },
  { value: "Asia/Krasnoyarsk",   label: t("account.tz.krasnoyarsk") },
  { value: "Asia/Irkutsk",       label: t("account.tz.irkutsk") },
  { value: "Asia/Yakutsk",       label: t("account.tz.yakutsk") },
  { value: "Asia/Vladivostok",   label: t("account.tz.vladivostok") },
  { value: "Asia/Magadan",       label: t("account.tz.magadan") },
  { value: "Asia/Kamchatka",     label: t("account.tz.kamchatka") },
];
