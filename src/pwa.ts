export function registerPwa() {
  if (!import.meta.env.PROD) return;
  if (window.videe) return;
  if (!('serviceWorker' in navigator)) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !local) return;
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
