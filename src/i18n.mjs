import { JA, JA_PATTERNS } from './locales/ja.mjs';

/** @typedef {'ja'|'en'} Language */
/** Japanese is the default; English stays available in Settings. */
export const DEFAULT_LANGUAGE = 'ja';
/** @type {{ value: Language, label: string }[]} Each language is listed under its own name. */
export const LANGUAGES = [{ value: 'ja', label: '日本語' }, { value: 'en', label: 'English' }];

/** @param {unknown} value @returns {Language|null} */
export function normalizeLanguage(value) {
  return value === 'ja' || value === 'en' ? value : null;
}
/** `?lang=en` or `?lang=ja` in the address picks the language (scripts and tests use it).
 * @param {string} [search] @returns {Language|null} */
export function languageFromUrl(search = typeof location === 'undefined' ? '' : location.search) {
  try { return normalizeLanguage(new URLSearchParams(search).get('lang')); } catch { return null; }
}
function storedLanguage() {
  try { return normalizeLanguage(JSON.parse(localStorage.getItem('videe-preferences') || '{}')?.language); } catch { return null; }
}

/** @type {Language} */
let current = languageFromUrl() || storedLanguage() || DEFAULT_LANGUAGE;
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLanguage() { return current; }
/** @param {Language} language */
export function setLanguage(language) {
  current = normalizeLanguage(language) || DEFAULT_LANGUAGE;
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
/** BCP 47 locale for dates and numbers in the current language. */
export function locale() { return current === 'ja' ? 'ja-JP' : 'en-US'; }

/**
 * Translate an English UI string. The English text is the key, so English needs no table and a
 * missing translation falls back to readable English. `{name}` placeholders are filled from `vars`.
 * Strings built at run time (error messages, playback reasons) are matched by JA_PATTERNS.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @param {Language} [language]
 */
export function translate(key, vars, language = current) {
  let text = key;
  if (language === 'ja') {
    const hit = Object.prototype.hasOwnProperty.call(JA, key) ? JA[/** @type {keyof typeof JA} */ (key)] : undefined;
    if (hit !== undefined) text = hit;
    else for (const [pattern, replacement] of JA_PATTERNS) {
      if (pattern.test(key)) { text = key.replace(pattern, /** @type {any} */ (replacement)); break; }
    }
  }
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => name in vars ? String(vars[name]) : match) : text;
}
/** @param {string} key @param {Record<string, string|number>} [vars] */
export function t(key, vars) { return translate(key, vars); }

/** English text of an error, without Electron's "Error invoking remote method" wrapper.
 * @param {unknown} error @param {string} fallback */
export function errorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : '';
  const clean = message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '').trim();
  return clean || fallback;
}
/** An error's message in the current language, or the fallback when it has none.
 * @param {unknown} error @param {string} fallback */
export function errorText(error, fallback) { return t(errorMessage(error, fallback)); }
