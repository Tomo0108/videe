import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
import { RELEASE_REPO, RELEASE_VERSION, RELEASES_API, RELEASES_PAGE, artifactNames, latestDownloadUrl } from './release.mjs';
import { Badge } from './components/ui/badge';
import { BlurReveal } from './components/ui/blur-reveal';
import { FlowButton } from './components/ui/flow-button';
import { GradientWaveText } from './components/ui/gradient-wave-text';
import { HighlightedText } from './components/ui/highlighted-text';
import { RichButton } from './components/ui/rich-button';
import { ShimmerText } from './components/ui/shimmer-text';
import { SlideUpText } from './components/ui/slide-up-text';
import { TiltCard } from './components/ui/tilt-card';
import '@fontsource-variable/inter-tight';
import './theme.css';
import './style.css';
import './site.css';

type Platform = 'mac' | 'win' | 'ios';
type Asset = { href: string; size: string; available: boolean };

const NAMES = artifactNames();
const playerHref = import.meta.env.DEV ? '/' : '/app';
const homeHref = import.meta.env.DEV ? '/site.html' : '/';
const FALLBACK: Record<Platform, Asset> = {
  mac: { href: latestDownloadUrl(NAMES.mac), size: '', available: true },
  win: { href: latestDownloadUrl(NAMES.win), size: '', available: true },
  ios: { href: latestDownloadUrl(NAMES.ios), size: '', available: true },
};

function formatBytes(bytes: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function pickAsset(assets: { name: string; browser_download_url: string; size: number }[], platform: Platform): Asset {
  const match = assets.find(asset => {
    const name = asset.name.toLowerCase();
    if (platform === 'mac') return name.endsWith('.dmg') && (name.includes('mac') || name.includes('arm64') || name.includes('darwin'));
    if (platform === 'win') return name.endsWith('.exe') || (name.includes('win') && (name.endsWith('.exe') || name.endsWith('.zip')));
    return name.endsWith('.ipa') || name.includes('ios');
  });
  if (!match) return { ...FALLBACK[platform], available: false };
  return { href: match.browser_download_url, size: formatBytes(match.size), available: true };
}

function Site() {
  const [files, setFiles] = useState<Record<Platform, Asset>>(FALLBACK);
  const [version, setVersion] = useState(RELEASE_VERSION);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      document.documentElement.classList.toggle('dark', media.matches);
      document.documentElement.dataset.theme = 'system';
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    void fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { tag_name?: string; assets?: { name: string; browser_download_url: string; size: number }[] };
      const tag = String(data.tag_name || '').replace(/^v/, '');
      if (tag) setVersion(tag);
      const assets = data.assets || [];
      if (!assets.length) return;
      setFiles({ mac: pickAsset(assets, 'mac'), win: pickAsset(assets, 'win'), ios: pickAsset(assets, 'ios') });
    }).catch(() => {});
  }, []);
  const cards: { id: Platform; title: string; body: string; note: string; icon: LucideIcon }[] = [
    { id: 'mac', title: 'macOS', body: 'Opens the original file. Converts unsupported formats with bundled FFmpeg. Apple Silicon.', note: 'Unsigned build. Right-click the app and choose Open the first time.', icon: Laptop },
    { id: 'win', title: 'Windows', body: 'Same local library and conversion tools. Installer for 64-bit Windows.', note: 'SmartScreen may warn because the build is not Microsoft-signed. Choose More info → Run anyway.', icon: Monitor },
    { id: 'ios', title: 'iPhone & iPad', body: 'Sideload the IPA with AltStore or Sideloadly. Home-screen app, no App Store.', note: 'Requires a free Apple ID to re-sign. Install expires after 7 days unless you use a developer certificate.', icon: Smartphone },
  ];
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-wrap">
          <a className="brand" href={homeHref} aria-label="Videe home"><img src="./icon.png" alt=""/><span>Videe</span></a>
          <nav className="site-nav">
            <a href={playerHref}>Web player</a>
            <a href={`https://github.com/${RELEASE_REPO}`}>GitHub</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero site-wrap">
          <div className="hero-copy">
            <ShimmerText className="hero-kicker">LOCAL CINEMA</ShimmerText>
            <h1><GradientWaveText align="left" repeat paused={false}>Your films. On your machine.</GradientWaveText></h1>
            <BlurReveal as="p" delay={0.12} className="hero-lead">The Vercel web app has to copy every video into browser storage, so large files stall or fail. Videe for Mac, Windows, and iOS reads the file you already have.</BlurReveal>
            <p className="ja">ブラウザ版は動画をサイト内ストレージへ複製するため、大きなファイルには向きません。各OSアプリは元ファイルを直接開きます。クラウドにもアカウントにも送りません。</p>
            <div className="hero-actions">
              <RichButton asChild size="lg" className="primary-button"><a href="#download">Download Videe</a></RichButton>
              <FlowButton asChild className="secondary-button"><a href={playerHref}>Try a small clip in the browser</a></FlowButton>
            </div>
          </div>
          <TiltCard className="hero-visual" tiltLimit={8} scale={1.02} spotlight>
            <img src="./promo/library.png" alt="Videe library on desktop"/>
          </TiltCard>
        </section>
        <section id="download" className="site-wrap downloads" aria-label="Downloads">
          {cards.map(card => {
            const file = files[card.id];
            const Icon = card.icon;
            return (
              <TiltCard key={card.id} className={`download-card ${file.available ? '' : 'disabled'}`} tiltLimit={6} scale={1.02} spotlight>
                <Icon size={22} strokeWidth={1.7}/>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
                <Badge variant={file.available ? 'default' : 'outline'}>{file.available ? `Version ${version}${file.size ? ` · ${file.size}` : ''}` : 'Build in progress'}</Badge>
                <RichButton asChild className="primary-button"><a href={file.available ? file.href : RELEASES_PAGE}>{file.available ? `Download ${card.title}` : 'View releases'}</a></RichButton>
                <span className="meta">{card.note}</span>
              </TiltCard>
            );
          })}
        </section>
        <section className="section site-wrap">
          <h2><HighlightedText>Why the apps exist</HighlightedText></h2>
          <div className="why">
            <article><h3>No duplicate library</h3><p>Desktop Videe keeps a path to your file. Moving a 20 GB film does not mean uploading 20 GB into a website.</p></article>
            <article><h3>Stays on the device</h3><p>There is no Videe account and no cloud ingest. Playback, resume position, and favorites never leave the machine.</p></article>
            <article><h3>Hard formats on desktop</h3><p>Mac and Windows can convert unsupported files to H.264/AAC with the bundled engine. The original file is left untouched.</p></article>
          </div>
        </section>
        <section className="section site-wrap">
          <h2><SlideUpText>Look around</SlideUpText></h2>
          <div className="shots">
            <figure><img src="./promo/player.png" alt="Videe player"/><figcaption>Transport sits under the picture. Queue, A–B loop, and subtitles stay one click away.</figcaption></figure>
            <figure><img src="./promo/start.png" alt="Videe start screen"/><figcaption>Open a file and watch. The first screen is one action.</figcaption></figure>
          </div>
        </section>
        <section className="section site-wrap">
          <h2>Install notes</h2>
          <div className="install">
            <details open>
              <summary>macOS</summary>
              <ol>
                <li>Download the DMG and drag Videe to Applications, or open the app from the disk image.</li>
                <li>This build is not notarized. If Gatekeeper blocks it, Control-click Videe and choose Open.</li>
                <li>Apple Silicon (arm64) only for this release.</li>
              </ol>
            </details>
            <details>
              <summary>Windows</summary>
              <ol>
                <li>Run the setup EXE. If SmartScreen appears, choose More info, then Run anyway.</li>
                <li>64-bit Windows is required. Conversion uses the FFmpeg binary bundled for Windows.</li>
              </ol>
            </details>
            <details>
              <summary>iOS sideload</summary>
              <ol>
                <li>Download the IPA on a computer.</li>
                <li>Install with <a href="https://altstore.io/">AltStore</a> or <a href="https://sideloadly.io/">Sideloadly</a> using your Apple ID.</li>
                <li>On iPhone, trust the developer in Settings → General → VPN &amp; Device Management if asked.</li>
                <li>Free Apple IDs need a refresh every 7 days. A paid Developer certificate lasts a year.</li>
                <li>You can also add the <a href="./altstore.json">AltStore source</a> if your client supports a JSON source URL.</li>
              </ol>
              <p>iOS plays formats the system already supports. It does not include the desktop converter.</p>
            </details>
          </div>
        </section>
        <section className="site-wrap" style={{ paddingBottom: 72 }}>
          <div className="web-note">
            <p>Need a quick look on a tiny file? The browser player is still here. Anything you care about should go through the apps above.</p>
            <FlowButton asChild className="secondary-button"><a href={playerHref}>Open web player</a></FlowButton>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-wrap">
          <span>Videe {version} · files stay on this device</span>
          <a href={RELEASES_PAGE}>All releases</a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Site />);
