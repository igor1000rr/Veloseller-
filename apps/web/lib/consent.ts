// Единый источник правды по cookie-консенту (152-ФЗ / GDPR).
//
// CookieBanner записывает выбор пользователя, YandexMetrika читает его и
// грузит счётчик ТОЛЬКО при "accepted". Раньше баннер был декоративным —
// Метрика (с webvisor — запись сессий) грузилась всем без согласия, что
// противоречило и тексту баннера, и Политике конфиденциальности.

export const CONSENT_STORAGE_KEY = "veloseller-cookie-consent";
export const CONSENT_VERSION = "v1";
// Событие на window: баннер диспатчит при выборе, Метрика реагирует вживую
// (без перезагрузки страницы) — счётчик стартует сразу после «Принять все».
export const CONSENT_EVENT = "veloseller-consent-change";

export type ConsentValue = "accepted" | "rejected" | null;

/** Текущий выбор из localStorage с учётом версии. null — выбор не сделан/устарел. */
export function getStoredConsent(): ConsentValue {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === CONSENT_VERSION) {
      return parsed.value === "accepted" || parsed.value === "rejected" ? parsed.value : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Сохранить выбор и оповестить слушателей (Метрику) в этой же вкладке. */
export function setConsentChoice(value: "accepted" | "rejected"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ value, version: CONSENT_VERSION, ts: new Date().toISOString() })
    );
  } catch {
    // localStorage недоступен — событие всё равно шлём, чтобы UI отреагировал
  }
  window.dispatchEvent(new CustomEvent<ConsentValue>(CONSENT_EVENT, { detail: value }));
}
