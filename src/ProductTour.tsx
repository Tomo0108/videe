import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {BookOpen,FolderOpen,Settings2,Sparkles,Upload,X} from 'lucide-react';
import type {Preferences} from './preferences.mjs';
import {UI, currentEdition} from './QuickGuide';
import {getLanguage,t} from './i18n.mjs';

type Box = {left: number; top: number; width: number; height: number};
type TourStep = {title: string; body: ReactNode; target?: () => DOMRect[]; settings?: boolean; guide?: boolean};
/** Boxes of the visible elements matching `selector`; the spotlight wraps them all. */
const visible = (selector: string) => () => [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
const OPEN = visible('.header-actions .header-open-video, .header-actions .header-open');
const LIBRARY = visible('.library-sidebar nav, .library-tabs');
const SETTINGS = visible('.app-header .header-settings');
const GUIDE = visible('.app-header .header-help');

/**
 * First-launch walkthrough: points at the controls people need first, lets them set the
 * key preferences in place, and hands off to the quick guide. Skippable at every step.
 */
export function ProductTour({prefs, setPrefs, desktop, onOpenGuide, onClose}: {prefs: Preferences; setPrefs: (next: Preferences) => void; desktop: boolean; onOpenGuide: () => void; onClose: () => void}) {
  const guideKeys = currentEdition() === 'mac' ? <><kbd>⌘</kbd> <kbd>?</kbd></> : <kbd>F1</kbd>;
  const steps: TourStep[] = getLanguage() === 'ja' ? [
    {title: 'Videe へようこそ', body: <>パソコンにある動画を、そのまま快適に再生できるプレイヤーです。1 分ほどで、主な使い方と最初に決めておきたい設定を確認しましょう。</>},
    {title: '動画を開く', target: OPEN, body: <><UI icon={Upload}>{t('Open video')}</UI> でファイルを、<UI icon={FolderOpen}>{t('Open folder')}</UI> でフォルダーごと追加します。ウィンドウへのドラッグ＆ドロップでも追加できます。</>},
    {title: 'ライブラリ', target: LIBRARY, body: <>途中まで見た動画は <b>{t('Continue watching')}</b>、お気に入りは <b>{t('Favorites')}</b> にまとまります。フォルダーやプレイリストで整理もできます。</>},
    {title: '最初の設定', target: SETTINGS, settings: true, body: <>あとから <UI icon={Settings2}>{t('Settings')}</UI> でいつでも変更できます。</>},
    {title: 'クイックガイド', target: GUIDE, guide: true, body: <>画面付きの手順書はここから開けます。キーボードの {guideKeys} でも開きます。ツアーは{t('Settings')}からもう一度見られます。</>},
  ] : [
    {title: 'Welcome to Videe', body: <>A player that plays the videos on your computer as they are, smoothly. Take a minute to see the basics and choose the settings worth deciding first.</>},
    {title: 'Open videos', target: OPEN, body: <><UI icon={Upload}>{t('Open video')}</UI> adds files and <UI icon={FolderOpen}>{t('Open folder')}</UI> a whole folder. You can also drag them onto the window.</>},
    {title: 'Library', target: LIBRARY, body: <>Videos you stopped partway gather in <b>{t('Continue watching')}</b>, favorites in <b>{t('Favorites')}</b>. Folders and playlists keep things organized.</>},
    {title: 'First settings', target: SETTINGS, settings: true, body: <>You can change these any time in <UI icon={Settings2}>{t('Settings')}</UI>.</>},
    {title: 'Quick guide', target: GUIDE, guide: true, body: <>Illustrated instructions open from here, or with {guideKeys} on the keyboard. You can take this tour again from Settings.</>},
  ];
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<{left: number; top: number} | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index]; const last = index === steps.length - 1;
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  const place = useCallback(() => {
    const rects = step.target?.() || [];
    const vw = window.innerWidth, vh = window.innerHeight, pad = 6, gap = 14, margin = 16;
    const left0 = Math.min(...rects.map(r => r.left)), top0 = Math.min(...rects.map(r => r.top));
    const spot = rects.length ? {left: left0 - pad, top: top0 - pad, width: Math.max(...rects.map(r => r.right)) - left0 + pad * 2, height: Math.max(...rects.map(r => r.bottom)) - top0 + pad * 2} : null;
    setBox(spot);
    const c = cardRef.current; if (!c) return;
    const cw = c.offsetWidth, ch = c.offsetHeight;
    if (!spot || vw <= 700) { setCard(null); return; }
    const below = spot.top + spot.height + gap, above = spot.top - gap - ch, right = spot.left + spot.width + gap;
    let left = spot.left + spot.width / 2 - cw / 2, top = below;
    if (below + ch > vh - margin) {
      if (above >= margin) top = above;
      else { top = spot.top + spot.height / 2 - ch / 2; left = right + cw <= vw - margin ? right : spot.left - gap - cw; }
    }
    setCard({left: Math.max(margin, Math.min(vw - cw - margin, left)), top: Math.max(margin, Math.min(vh - ch - margin, top))});
  }, [index]);
  useLayoutEffect(() => { place(); }, [place, prefs]);
  useEffect(() => {
    const observer = new ResizeObserver(() => place()); if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [place]);
  useEffect(() => { cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({focusVisible: false} as FocusOptions); }, [index]);
  const toggle = (key: 'resume' | 'autoAdvance' | 'hardware' | 'motion', label: string, note: string) => <label className="setting-row"><span>{label}<small>{note}</small></span><input type="checkbox" role="switch" aria-label={label} checked={prefs[key]} onChange={e => setPrefs({...prefs, [key]: e.target.checked})}/></label>;
  return <dialog ref={dialog} className="tour" aria-labelledby="tour-title" aria-describedby="tour-body" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className={`tour-spot${box ? '' : ' none'}`} style={box ? {left: box.left, top: box.top, width: box.width, height: box.height} : undefined} aria-hidden="true"/>
    <div ref={cardRef} className={`tour-card${card ? ' anchored' : ''}`} style={card ? {left: card.left, top: card.top} : undefined} key={index}>
      <div className="tour-head">
        <span className="tour-progress" aria-label={t('Step {n} of {total}', {n: index + 1, total: steps.length})}>{steps.map((_, i) => <i key={i} className={i === index ? 'on' : i < index ? 'done' : ''}/>)}</span>
        <button type="button" className="icon-button tour-skip" aria-label={t('Close tour')} title={t('Close tour')} onClick={onClose}><X size={16} aria-hidden="true"/></button>
      </div>
      {index === 0 && <span className="tour-hero" aria-hidden="true"><img src="./icon.png" width="44" height="44" alt=""/></span>}
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-body">{step.body}</p>
      {step.settings && <div className="settings-group tour-settings">
        <label className="setting-row"><span>{t('Appearance')}</span><select aria-label={t('Appearance')} value={prefs.theme} onChange={e => setPrefs({...prefs, theme: e.target.value as Preferences['theme']})}><option value="system">{t('System')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option></select></label>
        {toggle('resume', t('Resume playback'), t('Start where you stopped last time'))}
        {toggle('autoAdvance', t('Autoplay next'), t('Go on to the next video in the list'))}
        {desktop && toggle('hardware', t('Hardware acceleration'), t('Play and convert video with the GPU'))}
        {toggle('motion', t('Animations'), t('Motion between screens'))}
      </div>}
      {step.guide && <button type="button" className="secondary-button tour-guide" onClick={onOpenGuide}><BookOpen size={16} aria-hidden="true"/>{t('Open the quick guide')}</button>}
      <div className="tour-actions">
        {index === 0 ? <button type="button" className="secondary-button" onClick={onClose}>{t('Skip')}</button> : <button type="button" className="secondary-button" onClick={() => setIndex(index - 1)}>{t('Back')}</button>}
        <button type="button" className="primary-button" data-autofocus onClick={() => last ? onClose() : setIndex(index + 1)}>{index === 0 ? <><Sparkles size={15} aria-hidden="true"/>{t('Get started')}</> : last ? t('Done') : t('Next')}</button>
      </div>
    </div>
  </dialog>;
}
