import { SITE_ORIGIN } from './altstore.mjs';
import { RELEASE_REPO } from './release.mjs';

export const QUICK_GUIDE_URL = `${SITE_ORIGIN}/quick-guide.html`;
export const QUICK_GUIDE_ASSET = 'Videe-quick-guide.html';

const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * The quick guide as GitHub-safe HTML for the release description: one collapsible section per edition
 * (Mac / Windows / iPhone and iPad), with icons and screenshots served from the release's own tag.
 * GitHub strips fonts, styles and scripts there, so the embedded-font page is linked and attached instead.
 */
export function releaseGuideSection(guide, version) {
  const base = `https://raw.githubusercontent.com/${RELEASE_REPO}/v${version}/docs/release-guide`;
  const icon = (key, size = 16) => (key ? `<img src="${base}/icons/${key}.png" width="${size}" height="${size}" alt="">` : '');
  const rich = html => html.replace(/\{icon:([a-z0-9-]*)\}/g, (_, key) => icon(key) + (key ? ' ' : ''));
  const step = (s, i) => [
    `<h3>${icon(s.icon, 20)} ${i + 1}. ${esc(s.title)}</h3>`,
    `<p>${rich(s.lead)}</p>`,
    s.image ? `<p><img src="${base}/${s.image}" width="${s.portrait ? 320 : 760}" alt="${esc(s.title)}の画面"></p>` : '',
    s.points.length ? `<ol>\n${s.points.map(p => `<li>${rich(p)}</li>`).join('\n')}\n</ol>` : '',
    s.shortcuts.length ? `<table>\n<tr><th>操作</th><th>キー</th></tr>\n${s.shortcuts.map(row => `<tr><td>${esc(row.label)}</td><td>${row.keys.map(k => `<kbd>${esc(k)}</kbd>`).join(' ')}</td></tr>`).join('\n')}\n</table>` : '',
    s.tip ? `<blockquote><p>${icon('lightbulb')} <b>ポイント</b>　${rich(s.tip)}</p></blockquote>` : '',
  ].filter(Boolean).join('\n');
  const editions = guide.editions.map(edition => `<details>
<summary>${icon(edition.icon, 18)} <b>${esc(edition.label)} 版</b></summary>

${edition.steps.map(step).join('\n\n')}

</details>`);
  return [
    '## クイックガイド',
    '',
    `使っている端末の版を開いてください。フォントとアイコンを埋め込んだ単体の HTML 版は <a href="${QUICK_GUIDE_URL}">Web で表示</a> するか、下の ${QUICK_GUIDE_ASSET} をダウンロードして開けます。`,
    '',
    editions.join('\n\n'),
  ].join('\n');
}

export function releaseNotesWithGuide(notes, guide, version) {
  return `${notes.trimEnd()}\n\n${releaseGuideSection(guide, version)}\n`;
}
