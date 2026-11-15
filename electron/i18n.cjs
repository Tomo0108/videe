// Text the desktop shell shows itself: native dialog titles and the Mac menu bar.
// The app language comes from the player (Settings → Language); Japanese is the default.
const JA = {
  'Open videos': '動画を開く',
  'Videos': '動画',
  'Open folder': 'フォルダーを開く',
  'Save frame': '静止画を保存',
  'PNG image': 'PNG 画像',
  'Export video': '動画を書き出す',
  'edited': '編集済み',
  'About Videe': 'Videe について',
  'Settings…': '設定…',
  'Services': 'サービス',
  'Hide Videe': 'Videe を非表示',
  'Hide Others': 'ほかを非表示',
  'Show All': 'すべてを表示',
  'Quit Videe': 'Videe を終了',
  'File': 'ファイル',
  'Close Window': 'ウインドウを閉じる',
  'Edit': '編集',
  'Undo': '取り消す',
  'Redo': 'やり直す',
  'Cut': 'カット',
  'Copy': 'コピー',
  'Paste': 'ペースト',
  'Paste and Match Style': 'ペーストしてスタイルを合わせる',
  'Delete': '削除',
  'Select All': 'すべてを選択',
  'View': '表示',
  'Reload': '再読み込み',
  'Force Reload': '強制的に再読み込み',
  'Toggle Developer Tools': '開発者ツールを切り替える',
  'Actual Size': '実際のサイズ',
  'Zoom In': '拡大',
  'Zoom Out': '縮小',
  'Toggle Full Screen': 'フルスクリーンを切り替える',
  'Window': 'ウインドウ',
  'Minimize': 'しまう',
  'Zoom': '拡大/縮小',
  'Bring All to Front': 'すべてを手前に移動',
  'Help': 'ヘルプ',
  'Quick Guide': 'クイックガイド',
};

let language = 'ja';
/** @param {unknown} value */
function normalizeLanguage(value) { return value === 'en' || value === 'ja' ? value : null; }
function getLanguage() { return language; }
/** @param {unknown} value @returns {boolean} whether the language changed */
function setLanguage(value) {
  const next = normalizeLanguage(value);
  if (!next || next === language) return false;
  language = next;
  return true;
}
/** @param {string} key */
function t(key) { return language === 'ja' && JA[key] ? JA[key] : key; }

/**
 * Mac menu bar in the app language, with the same roles as Electron's default menu plus
 * Settings (⌘,) and the quick guide, which the player opens when `send` passes them on.
 * @param {(action: 'settings'|'guide') => void} send
 */
function macMenuTemplate(send) {
  return [
    { label: 'Videe', submenu: [
      { role: 'about', label: t('About Videe') },
      { type: 'separator' },
      { label: t('Settings…'), accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
      { type: 'separator' },
      { role: 'services', label: t('Services') },
      { type: 'separator' },
      { role: 'hide', label: t('Hide Videe') },
      { role: 'hideOthers', label: t('Hide Others') },
      { role: 'unhide', label: t('Show All') },
      { type: 'separator' },
      { role: 'quit', label: t('Quit Videe') },
    ] },
    { label: t('File'), submenu: [{ role: 'close', label: t('Close Window') }] },
    { label: t('Edit'), submenu: [
      { role: 'undo', label: t('Undo') },
      { role: 'redo', label: t('Redo') },
      { type: 'separator' },
      { role: 'cut', label: t('Cut') },
      { role: 'copy', label: t('Copy') },
      { role: 'paste', label: t('Paste') },
      { role: 'pasteAndMatchStyle', label: t('Paste and Match Style') },
      { role: 'delete', label: t('Delete') },
      { role: 'selectAll', label: t('Select All') },
    ] },
    { label: t('View'), submenu: [
      { role: 'reload', label: t('Reload') },
      { role: 'forceReload', label: t('Force Reload') },
      { role: 'toggleDevTools', label: t('Toggle Developer Tools') },
      { type: 'separator' },
      { role: 'resetZoom', label: t('Actual Size') },
      { role: 'zoomIn', label: t('Zoom In') },
      { role: 'zoomOut', label: t('Zoom Out') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('Toggle Full Screen') },
    ] },
    { role: 'windowMenu', label: t('Window'), submenu: [
      { role: 'minimize', label: t('Minimize') },
      { role: 'zoom', label: t('Zoom') },
      { type: 'separator' },
      { role: 'front', label: t('Bring All to Front') },
    ] },
    { role: 'help', label: t('Help'), submenu: [{ label: t('Quick Guide'), click: () => send('guide') }] },
  ];
}

module.exports = { JA, getLanguage, setLanguage, normalizeLanguage, t, macMenuTemplate };
