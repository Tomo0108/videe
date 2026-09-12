import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
import { RELEASE_REPO, RELEASE_VERSION, RELEASES_API, RELEASES_PAGE, artifactNames, latestDownloadUrl } from './release.mjs';
import '@fontsource-variable/inter-tight';
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
      <header className="site-header">
        <a className="brand" href={homeHref}>Videe</a>
        <nav className="site-nav" aria-label="Primary">
          <a href={`https://github.com/${RELEASE_REPO}`} rel="noreferrer">GitHub</a>
          <a href={playerHref}>Web</a>
          <a className="nav-download" href={href}>Download</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>Videe</h1>
          <p className="spec">Local video player</p>
          <p className="platforms">
            {PLATFORMS.map((platform, index) => (
              <span key={platform.id}>
                {index > 0 ? <span className="sep"> · </span> : null}
                {platform.id === os
                  ? <span className="is-here" aria-current="true">{platform.label}</span>
                  : <a href={files[platform.id].available ? files[platform.id].href : RELEASES_PAGE}>{platform.label}</a>}
              </span>
            ))}
          </p>
          <a className="hero-download" href={href}>
            <Icon size={18} strokeWidth={2} />
            <span>{currentFile.available ? current.cta : 'View releases'}</span>
          </a>
          {currentFile.size ? <p className="also">{currentFile.size}</p> : null}
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href={homeHref}>
          <img src="./icon.png" alt="" />
          <span>Videe</span>
          <small>{version}</small>
        </a>
        <nav aria-label="Footer">
          <a href={`https://github.com/${RELEASE_REPO}`} rel="noreferrer">GitHub</a>
          <a href={playerHref}>Web</a>
          <a href={RELEASES_PAGE} rel="noreferrer">Releases</a>
          <a href="./altstore.json" title="AltStore source">AltStore</a>
        </nav>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Site />);
