import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh-CN.json";
import legacy from "./locales/legacy.json";
import {
  getLocaleState,
  saveLocale,
  type LocaleState,
  type LanguagePreference,
} from "./commands";
import { listen } from "@tauri-apps/api/event";

export type Locale = "zh-CN" | "en";
let preference: LanguagePreference = "system";
let localeRevision = 0;
let diagnostics = false;
export function isValidationProfile(): boolean {
  return diagnostics;
}
const reverse = new Map<string, string>([
  ...Object.entries(en).map(([key, value]) => [value, key] as [string, string]),
  ...Object.entries(zh).map(([key, value]) => [value, key] as [string, string]),
]);

// Bundled resources keep language switching fully offline. Chinese is the
// pre-bootstrap default for legacy unit fixtures; native startup resolves it.
void i18next.use(initReactI18next).init({
  lng: "zh-CN",
  fallbackLng: "en",
  supportedLngs: ["zh-CN", "en"],
  keySeparator: false,
  initAsync: false,
  resources: { en: { translation: en }, "zh-CN": { translation: zh } },
  interpolation: { escapeValue: false },
});

export function tr(key: string, values?: Record<string, unknown>): string {
  const actual =
    Object.prototype.hasOwnProperty.call(en, key) ||
    Object.prototype.hasOwnProperty.call(en, key + "_other")
      ? key
      : (legacy as Record<string, string>)[key] || reverse.get(key);
  const parameters =
    actual === "stats.count" && typeof values?.count === "number"
      ? {
          ...values,
          countText: new Intl.NumberFormat(getLocale()).format(values.count),
        }
      : values;
  return actual ? String(i18next.t(actual, parameters || {})) : key;
}
export function useLocale(): Locale {
  useTranslation();
  return getLocale();
}
export function getLocale(): Locale {
  return i18next.resolvedLanguage === "en" ? "en" : "zh-CN";
}
export function getLanguagePreference(): LanguagePreference {
  return preference;
}
export function resolveLocale(value: string): Locale {
  return value.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export async function applyLocale(state: LocaleState): Promise<void> {
  if (state.revision < localeRevision) return;
  localeRevision = state.revision;
  preference = state.preference;
  diagnostics = state.diagnostics === true;
  await i18next.changeLanguage(state.locale);
  document.documentElement.lang = state.locale;
}
export async function initializeLocale(): Promise<void> {
  // Attach before querying, so a simultaneous update cannot be missed.
  await listen<LocaleState>("quickmd:locale-changed", (event) => {
    void applyLocale(event.payload);
  });
  await applyLocale(await getLocaleState());
}
export async function changeLocale(value: LanguagePreference): Promise<void> {
  // Commit once in Rust; the persisted state also updates native tray labels.
  try {
    await applyLocale(await saveLocale(value));
  } catch (error) {
    await applyLocale(await getLocaleState());
    throw error;
  }
}

/** Re-localize controlled UI messages held by an open dialog or status bar. */
export function displayMessage(text: string): string {
  const direct = reverse.get(text);
  if (direct) return tr(direct);
  for (const catalogue of [en, zh]) {
    for (const [key, summary] of Object.entries(catalogue)) {
      if (key.startsWith("errors.") && text.startsWith(summary + ": "))
        return tr(key) + ": " + displayMessage(text.slice(summary.length + 2));
    }
  }
  for (const catalogue of [en, zh]) {
    for (const [key, template] of Object.entries(catalogue)) {
      if (!template.includes("{{")) continue;
      const names: string[] = [];
      const pattern = template
        .split(/(\{\{\w+\}\})/)
        .map((part) => {
          const match = /^\{\{(\w+)\}\}$/.exec(part);
          if (match) {
            names.push(match[1]);
            return "([\\s\\S]*?)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      const match = new RegExp("^" + pattern + "$").exec(text);
      if (match)
        return tr(
          key,
          Object.fromEntries(
            names.map((name, i) => [
              name,
              key === "ui.settingsCouldNotBeSavedPreviousValuesRestored"
                ? displayMessage(match[i + 1])
                : match[i + 1],
            ]),
          ),
        );
    }
  }
  return text;
}

export default i18next;
