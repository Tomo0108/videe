// Builds the quick guide shown on GitHub release pages, from the in-app guide (Japanese).
// Usage: npm run dev, then `npm run guide:release` (after `npm run guide:build`). Needs Python with fontTools + brotli.
// Writes docs/release-guide/: guide.json (text per edition), images (callouts baked in), icons, and
// quick-guide.html, a single file with its fonts, icons and images embedded and a Mac / Windows / iPhone switch.
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.VIDEE_URL || 'http://127.0.0.1:5173';
const out = 'docs/release-guide';
const tmp = mkdtempSync(join(tmpdir(), 'videe-release-guide-'));
mkdirSync(join(out, 'images'), { recursive: true });
mkdirSync(join(out, 'icons'), { recursive: true });
const EDITIONS = [
  { id: 'mac', label: 'Mac', icon: 'laptop', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
  { id: 'win', label: 'Windows', icon: 'monitor', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
  { id: 'ios', label: 'iPhone / iPad', icon: 'smartphone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
];
// Edition switch icons, drawn the same way as the lucide icons inside the guide.
const EXTRA_ICONS = {
  laptop: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/></svg>',
  monitor: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
  smartphone: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
};
const ICON_COLOR = '#3b82f6';

const browser = await chromium.launch();
const icons = new Map(Object.entries(EXTRA_ICONS));
const guide = { editions: [] };

/** Lucide's class names the icon, e.g. "lucide lucide-folder-open" → "folder-open". */
const iconName = svg => /lucide-([a-z0-9-]+)/.exec(svg.getAttribute('class') || '')?.[1];

for (const edition of EDITIONS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce', userAgent: edition.ua });
  await page.addInitScript(() => localStorage.setItem('videe-preferences', JSON.stringify({ theme: 'light', layout: 'grid', layoutVersion: 2 })));
  await page.goto(`${URL}/?lang=ja`);
  await page.locator('.header-help').click();
  await page.locator('.guide-step').first().waitFor();
  await page.evaluate(() => document.querySelectorAll('.guide-figure img').forEach(img => { img.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.guide-figure img')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });
  // Each inline control becomes {icon}{label}; everything else keeps only plain formatting.
  const steps = await page.evaluate(() => {
    const name = svg => /lucide-([a-z0-9-]+)/.exec(svg.getAttribute('class') || '')?.[1];
    const clean = node => {
      let html = '';
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { html += child.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;'); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();
        if (child.classList.contains('guide-ui')) {
          const svg = child.querySelector('svg');
          const label = child.querySelector('b');
          html += `{icon:${svg ? name(svg) : ''}}${label ? `<b>${label.textContent}</b>` : ''}`;
        } else if (child.classList.contains('guide-keys')) {
          html += [...child.querySelectorAll('kbd')].map(k => `<kbd>${k.textContent}</kbd>`).join(' ');
        } else if (['b', 'code', 'kbd', 'strong'].includes(tag)) {
          html += `<${tag === 'strong' ? 'b' : tag}>${clean(child)}</${tag === 'strong' ? 'b' : tag}>`;
        } else if (tag !== 'svg') html += clean(child);
      }
      return html.replace(/\s+/g, ' ').trim();
    };
    return [...document.querySelectorAll('.guide-step')].map(section => ({
      id: section.id.replace(/^guide-/, ''),
      title: section.querySelector('h3').textContent.trim(),
      icon: name(section.querySelector('h3 svg')),
      lead: clean(section.querySelector('.guide-lead')),
      figure: !!section.querySelector('.guide-figure'),
      portrait: !!section.querySelector('.guide-figure.portrait'),
      points: [...section.querySelectorAll('.guide-points li > span:last-child')].map(clean),
      shortcuts: [...section.querySelectorAll('.guide-shortcuts > div')].map(row => ({ label: row.querySelector('dt').textContent.trim(), keys: [...row.querySelectorAll('kbd')].map(k => k.textContent) })),
      tip: section.querySelector('.guide-tip > span') ? clean(section.querySelector('.guide-tip > span')).replace(/^<b>[^<]*<\/b>/, '') : '',
    }));
  });
  for (const svg of await page.locator('.guide-step svg[class*="lucide-"]').all()) {
    const html = await svg.evaluate(el => el.outerHTML);
    const key = /lucide-([a-z0-9-]+)/.exec(html)?.[1];
    if (key && !icons.has(key)) icons.set(key, html);
  }
  // Screenshots with their numbered callouts, as the app shows them.
  for (const step of steps.filter(s => s.figure)) {
    const figure = page.locator(`#guide-${step.id} .guide-figure`);
    await figure.scrollIntoViewIfNeeded();
    const png = join(tmp, `${edition.id}-${step.id}.png`);
    await figure.screenshot({ path: png, animations: 'disabled' });
    const file = `${edition.id}-${step.id}.webp`;
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '84', join(out, 'images', file)], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Could not encode ${file}`);
    step.image = `images/${file}`;
  }
  guide.editions.push({ id: edition.id, label: edition.label, icon: edition.icon, steps });
  await page.close();
  console.log(`${edition.id}: ${steps.length} steps`);
}

// Icons as small PNGs for the release page (GitHub drops inline SVG), and as SVG for the single-file guide.
const iconPage = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
const svgs = {};
for (const [key, html] of icons) {
  const svg = html.replace(/class="[^"]*"/, '').replace(/width="\d+"/, 'width="24"').replace(/height="\d+"/, 'height="24"').replace(/stroke-width="[\d.]+"/, 'stroke-width="2"').replace(/ aria-hidden="true"/, '');
  svgs[key] = svg;
  await iconPage.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:64px;height:64px;color:${ICON_COLOR}}</style>${svg}`);
  await iconPage.locator('svg').screenshot({ path: join(out, 'icons', `${key}.png`), omitBackground: true });
}
await browser.close();
guide.icons = Object.keys(svgs).sort();
writeFileSync(join(out, 'guide.json'), JSON.stringify(guide, null, 2) + '\n');

// Fonts: Noto Sans JP and Geist, cut down to the characters the guide uses.
const text = JSON.stringify(guide) + 'Videe クイックガイド Mac Windows iPhone / iPad 版 0123456789 ・、。「」（）→←↑↓…⌘⇧ ステップ ポイント ショートカット';
const chars = [...new Set([...text].filter(ch => ch.codePointAt(0) > 32))];
writeFileSync(join(tmp, 'chars.txt'), chars.join(''));
const fontFaces = [];
const subset = (src, family, weight) => {
  const dest = join(tmp, `${family.replace(/\W/g, '')}-${fontFaces.length}.woff2`);
  const result = spawnSync('python3', ['-m', 'fontTools.subset', src, `--text-file=${join(tmp, 'chars.txt')}`, '--flavor=woff2', `--output-file=${dest}`, '--layout-features=*', '--no-hinting'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`fontTools could not subset ${src}: ${result.stderr}`);
  const covered = spawnSync('python3', ['-c', 'import sys;from fontTools.ttLib import TTFont;print(",".join("U+%x"%c for c in sorted(TTFont(sys.argv[1]).getBestCmap())))', dest], { encoding: 'utf8' }).stdout.trim();
  if (!covered) return;
  fontFaces.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(dest).toString('base64')}) format('woff2');unicode-range:${covered}}`);
};
subset('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', 'Guide Latin', '100 900');
const notoDir = 'node_modules/@fontsource-variable/noto-sans-jp/files';
for (const file of readdirSync(notoDir).filter(f => f.endsWith('-wght-normal.woff2'))) subset(join(notoDir, file), 'Guide JP', '100 900');

writeFileSync(join(out, 'quick-guide.html'), standalone(guide, svgs, fontFaces));
rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${out}: ${guide.icons.length} icons, ${fontFaces.length} font subsets`);

function standalone(data, svgs, faces) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const icon = key => svgs[key] ? `<span class="ic" aria-hidden="true">${svgs[key]}</span>` : '';
  const rich = html => html.replace(/\{icon:([a-z0-9-]*)\}/g, (_, key) => `<span class="ui">${icon(key)}</span>`).replace(/<\/span><b>/g, '</span><b class="ui-label">');
  const image = path => `data:image/webp;base64,${readFileSync(join(out, path)).toString('base64')}`;
  const tabs = data.editions.map((edition, i) => `<input type="radio" name="edition" id="tab-${edition.id}" ${i === 0 ? 'checked' : ''}><label for="tab-${edition.id}">${icon(edition.icon)}${esc(edition.label)}</label>`).join('');
  const panels = data.editions.map(edition => `<section class="panel" data-edition="${edition.id}">
  <nav class="toc">${edition.steps.map((step, i) => `<a href="#${edition.id}-${step.id}"><span class="n">${i + 1}</span>${esc(step.title)}</a>`).join('')}</nav>
  ${edition.steps.map((step, i) => `<article class="step" id="${edition.id}-${step.id}">
    <header><span class="badge">ステップ ${i + 1}</span><h2>${icon(step.icon)}${esc(step.title)}</h2></header>
    <p class="lead">${rich(step.lead)}</p>
    ${step.image ? `<figure class="${step.portrait ? 'portrait' : ''}"><img src="${image(step.image)}" alt="${esc(step.title)}の画面" loading="lazy"></figure>` : ''}
    ${step.points.length ? `<ol class="points">${step.points.map((p, n) => `<li><span class="num">${n + 1}</span><span>${rich(p)}</span></li>`).join('')}</ol>` : ''}
    ${step.shortcuts.length ? `<dl class="keys">${step.shortcuts.map(row => `<div><dt>${esc(row.label)}</dt><dd>${row.keys.map(k => `<kbd>${esc(k)}</kbd>`).join(' ')}</dd></div>`).join('')}</dl>` : ''}
    ${step.tip ? `<p class="tip">${icon('lightbulb')}<span><b>ポイント</b>${rich(step.tip)}</span></p>` : ''}
  </article>`).join('\n  ')}
</section>`).join('\n');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Videe クイックガイド</title>
<style>
${faces.join('\n')}
:root{color-scheme:light dark;--ink:#0e1116;--muted:#5d6573;--bg:#f4f6f9;--surface:#fff;--line:#0e11161a;--accent:#2f62f2;--accent-bg:#3268f51a;--mark:#e8453c;--grad:linear-gradient(135deg,#3a7bff,#5b63ff 55%,#8a5cff)}
@media (prefers-color-scheme:dark){:root{--ink:#edf0f6;--muted:#8f97a6;--bg:#0a0b0e;--surface:#15171c;--line:#ffffff14;--accent:#7ea6ff;--accent-bg:#4d7dff2b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.75 'Guide Latin','Guide JP',-apple-system,'Segoe UI','Hiragino Sans','Yu Gothic UI',sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:980px;margin:0 auto;padding:40px 20px 80px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.top h1{margin:0;font-size:26px;font-weight:700;letter-spacing:-.02em}
.top p{margin:0;color:var(--muted);font-size:13px}
.tabs{position:sticky;top:0;z-index:2;display:flex;gap:6px;padding:10px 0;background:var(--bg)}
.tabs input{position:absolute;opacity:0;pointer-events:none}
.tabs label{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-weight:600;font-size:14px}
.tabs label .ic svg{width:17px;height:17px}
.tabs input:checked+label{background:var(--grad);color:#fff;border-color:transparent}
.tabs input:focus-visible+label{outline:3px solid var(--accent);outline-offset:2px}
.panel{display:none}
body:has(#tab-mac:checked) .panel[data-edition=mac],body:has(#tab-win:checked) .panel[data-edition=win],body:has(#tab-ios:checked) .panel[data-edition=ios]{display:block}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 8px}
.toc a{display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 5px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:13px}
.toc a:hover{color:var(--accent)}
.toc .n{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent-bg);color:var(--accent);font-weight:700;font-size:12px}
.step{margin-top:22px;padding:26px 28px;border-radius:20px;background:var(--surface);border:1px solid var(--line);scroll-margin-top:70px}
.step header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.badge{padding:2px 10px;border-radius:6px;background:var(--grad);color:#fff;font-size:12px;font-weight:700;letter-spacing:.04em}
.step h2{display:flex;align-items:center;gap:8px;margin:0;font-size:20px;letter-spacing:-.01em}
.step h2 .ic svg{width:20px;height:20px;color:var(--accent)}
.lead{margin:10px 0 16px}
figure{margin:0 0 18px;border-radius:12px;overflow:hidden;border:1px solid var(--line)}
figure img{display:block;width:100%;height:auto}
figure.portrait{max-width:360px;margin-inline:auto}
.points{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.points li{display:flex;gap:12px;align-items:flex-start}
.num{flex:none;display:grid;place-items:center;width:24px;height:24px;margin-top:2px;border-radius:50%;background:var(--mark);color:#fff;font-size:13px;font-weight:700}
.ui{display:inline-flex;align-items:center;vertical-align:-4px;margin:0 2px}
.ui .ic{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent-bg);color:var(--accent)}
.ui .ic svg{width:13px;height:13px}
.ui-label{margin-right:2px}
code{padding:1px 6px;border-radius:5px;background:var(--accent-bg);font-size:.9em;overflow-wrap:anywhere}
kbd{font:inherit;font-size:.85em;padding:1px 7px;border-radius:5px;border:1px solid var(--line);background:var(--bg);box-shadow:0 1px 0 var(--line)}
.keys{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;margin:0}
.keys div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.keys dd{margin:0;white-space:nowrap}
.tip{display:flex;gap:10px;margin:16px 0 0;padding:12px 14px;border-radius:12px;background:var(--accent-bg)}
.tip>.ic svg{width:16px;height:16px;margin-top:5px;color:var(--accent)}
.tip b:first-child{display:block;color:var(--accent);font-size:13px}
@media (max-width:640px){.wrap{padding:24px 14px 60px}.step{padding:20px 16px}.keys{grid-template-columns:1fr}.tabs label{padding:8px 12px;font-size:13px}}
</style>
</head>
<body>
<div class="wrap">
<div class="top"><div><h1>Videe クイックガイド</h1><p>使っている端末を選んでください。</p></div></div>
<div class="tabs" role="tablist">${tabs}</div>
${panels}
</div>
<script>
// Opens on the visitor's own platform; the tabs work without this.
(function(){var ua=navigator.userAgent,id=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'ios':/Macintosh/.test(ua)?'mac':'win';var el=document.getElementById('tab-'+id);if(el)el.checked=true;})();
</script>
</body>
</html>
`;
}
