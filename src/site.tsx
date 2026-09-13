import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Laptop, Monitor, Smartphone, FolderOpen, Captions, History } from 'lucide-react';
import { RELEASE_REPO, RELEASE_VERSION, RELEASES_API, RELEASES_PAGE, artifactNames, latestDownloadUrl } from './release.mjs';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/geist';
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
const PLATFORMS: { id: Platform; label: string; cta: string; icon: typeof Laptop }[] = [
  { id: 'mac', label: 'macOS', cta: 'Download for macOS', icon: Laptop },
  { id: 'win', label: 'Windows', cta: 'Download for Windows', icon: Monitor },
  { id: 'ios', label: 'iOS', cta: 'Download for iOS', icon: Smartphone },
];

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

function guessPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/Win/i.test(ua)) return 'win';
  return 'mac';
}

function Site() {
  const [files, setFiles] = useState<Record<Platform, Asset>>(FALLBACK);
  const [version, setVersion] = useState(RELEASE_VERSION);
  const [os, setOs] = useState<Platform>('mac');

  useEffect(() => { setOs(guessPlatform()); }, []);
  useEffect(() => {
    const ac = new AbortController();
    void fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: ac.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { tag_name?: string; assets?: { name: string; browser_download_url: string; size: number }[] };
      const tag = String(data.tag_name || '').replace(/^v/, '');
      if (tag) setVersion(tag);
      const assets = data.assets || [];
      if (!assets.length) return;
      setFiles({ mac: pickAsset(assets, 'mac'), win: pickAsset(assets, 'win'), ios: pickAsset(assets, 'ios') });
    }).catch(() => {});
    return () => ac.abort();
  }, []);

  const current = PLATFORMS.find(platform => platform.id === os)!;
  const currentFile = files[os];
  const Icon = current.icon;
  const href = currentFile.available ? currentFile.href : RELEASES_PAGE;

  return (
    <div className="site">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <a className="brand" href={homeHref} aria-label="Videe home">
          <img src="./icon.png" width="32" height="32" alt="" /><span translate="no">Videe</span>
        </a>
        <nav className="site-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href={playerHref}>Player</a>
          <a className="nav-download" href="#downloads">Download</a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="spec">Local video player</p>
            <h1 id="hero-title">Videe</h1>
            <div className="hero-actions">
              <a className="hero-download" href={href}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{currentFile.available ? current.cta : 'View releases'}</span>
              </a>
              <a className="hero-web" href={playerHref}>Web player</a>
            </div>
            <p className="release-note">macOS, Windows & iOS<span>Version {version}{currentFile.size ? ` · ${currentFile.size}` : ''}</span></p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="icon-stage"><img src="./icons/icon-rounded.png" width="512" height="512" alt="" fetchPriority="high" /></div>
          </div>
          <div className="hero-footnote"><span>On your device</span><span>No account</span></div>
        </section>

        <section className="features" id="features" aria-labelledby="features-title">
          <div className="section-heading"><h2 id="features-title">Features</h2></div>
          <div className="feature-list">
            <article><FolderOpen aria-hidden="true" size={26} strokeWidth={1.5} /><h3>Library</h3><p>Local files, search, and favorites.</p></article>
            <article><History aria-hidden="true" size={26} strokeWidth={1.5} /><h3>Resume</h3><p>Continue from the last position.</p></article>
            <article><Captions aria-hidden="true" size={26} strokeWidth={1.5} /><h3>Subtitles</h3><p>SRT and WebVTT.</p></article>
          </div>
        </section>

        <section className="downloads" id="downloads" aria-labelledby="downloads-title">
          <div className="section-heading"><div><h2 id="downloads-title">Download</h2></div><a className="text-link" href={RELEASES_PAGE}>Release notes</a></div>
          <div className="download-list">
            {PLATFORMS.map(platform => {
              const PlatformIcon = platform.icon;
              const file = files[platform.id];
              return <article key={platform.id} className="download-option">
                <PlatformIcon size={28} strokeWidth={1.5} aria-hidden="true" />
                <h3>{platform.label}</h3>
                <p>{platform.id === 'mac' ? '.dmg' : platform.id === 'win' ? '.exe' : '.ipa'}</p>
                <a className="platform-download" href={file.available ? file.href : RELEASES_PAGE}>{file.available ? platform.cta : `View ${platform.label} releases`}</a>
                {file.size ? <span className="file-size">{file.size}</span> : null}
              </article>;
            })}
          </div>
          <p className="download-help"><a href={playerHref}>Web player</a> · <a href={`https://github.com/${RELEASE_REPO}#readme`} rel="noreferrer">Setup</a></p>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href={homeHref}><span>Videe</span><small>{version}</small></a>
        <nav aria-label="Footer">
          <a href={`https://github.com/${RELEASE_REPO}`} rel="noreferrer">GitHub</a>
          <a href={playerHref}>Web player</a>
          <a href={RELEASES_PAGE} rel="noreferrer">Releases</a>
          <a href="./altstore.json" title="AltStore source">AltStore</a>
        </nav>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Site />);
