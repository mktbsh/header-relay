import en from "../../public/_locales/en/messages.json";

export type I18nKey = keyof typeof en;

type ChromeI18n = { getMessage: (key: string, substitutions?: string | string[]) => string };

const chromeI18n = (globalThis as { chrome?: { i18n?: ChromeI18n } }).chrome?.i18n;

export function t(key: I18nKey, substitutions?: string | string[]): string {
  if (chromeI18n) return chromeI18n.getMessage(key, substitutions);
  // ponytail: English fallback for non-extension contexts (vitest); real pages use chrome.i18n
  const subs = typeof substitutions === "string" ? [substitutions] : (substitutions ?? []);
  return en[key].message.replace(/\$(\d)/g, (_, index: string) => subs[Number(index) - 1] ?? "");
}
