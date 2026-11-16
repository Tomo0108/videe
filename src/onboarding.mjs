/** First-launch product tour state. Bump TOUR_VERSION to show a reworked tour once more. */
export const TOUR_KEY = 'videe-tour';
export const TOUR_VERSION = '1';

/** @param {Pick<Storage,'getItem'>|null|undefined} storage */
export function tourSeen(storage) {
  try { return storage?.getItem(TOUR_KEY) === TOUR_VERSION; } catch { return true; }
}
/** @param {Pick<Storage,'setItem'>|null|undefined} storage */
export function markTourSeen(storage) {
  try { storage?.setItem(TOUR_KEY, TOUR_VERSION); } catch { /* Shows again next launch; harmless. */ }
}
/**
 * The tour opens on its own only for a person's first launch. Automated browsers (tests,
 * screenshot scripts) skip it unless the URL asks for it with ?tour, so the overlay
 * never blocks scripted clicks.
 * @param {{ storage?: Pick<Storage,'getItem'>|null, webdriver?: boolean, search?: string }} env
 */
export function shouldAutoStartTour({ storage, webdriver = false, search = '' }) {
  if (/[?&]tour(=|&|$)/.test(search)) return true;
  if (webdriver) return false;
  return !tourSeen(storage);
}

/**
 * Which edition of the quick guide to show: the Mac app (or a Mac browser) gets the Mac
 * guide, iPhone and iPad the iOS one, everything else the Windows one.
 * @param {{ platform?: string, userAgent?: string, touch?: boolean }} env
 * @returns {'mac'|'win'|'ios'}
 */
export function guideEdition({ platform = '', userAgent = '', touch = false }) {
  if (platform) return platform === 'darwin' ? 'mac' : platform === 'ios' ? 'ios' : 'win';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  // iPadOS asks for desktop sites with a Mac user agent; a touch screen gives it away.
  if (/Macintosh|Mac OS X/.test(userAgent)) return touch ? 'ios' : 'mac';
  return 'win';
}
