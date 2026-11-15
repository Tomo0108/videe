import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {ArrowLeft,Camera,Captions,Download,Ellipsis,FastForward,FolderOpen,FolderPlus,Lightbulb,Heart,Keyboard,LayoutGrid,LifeBuoy,List,ListPlus,LockKeyhole,Maximize,MonitorCog,Play,Rewind,Scissors,Search,Settings2,ShieldCheck,Sparkles,Upload} from 'lucide-react';
import {Modal} from './Modal';
import shots from './guide/shots.json';
import {guideEdition} from './onboarding.mjs';

type Shot = keyof typeof shots;
type Edition = 'win' | 'mac';
type Scene = 'start' | 'library' | 'player' | 'editor' | 'settings';
/** x, y, width, height in percent of the image, then which edge carries the number. */
type Rect = [number, number, number, number, ('left' | 'right')?];
// Screenshots of each edition, e.g. ./guide/player-mac.webp. Bundled, so the guide works offline.
const IMAGES = Object.fromEntries(Object.entries(import.meta.glob('./guide/*.webp', {eager: true, import: 'default', query: '?url'}) as Record<string, string>).map(([path, url]) => [path.replace(/^.*\/|\.webp$/g, ''), url])) as Record<Shot, string>;
/** The edition this app should show: Mac for the Mac app, Windows otherwise. */
export const currentEdition = (): Edition => guideEdition({platform: window.videe?.platform, userAgent: navigator.userAgent});
/** Opens the guide: F1 on Windows, ⌘? on Mac (F1 works on both). */
export const isGuideShortcut = (e: KeyboardEvent) => e.key === 'F1' || ((e.metaKey || e.ctrlKey) && e.key === '?');

/** An app control shown inline in the text: its real icon plus the label it carries in Videe. */
export function UI({icon: Icon, children}: {icon: LucideIcon; children?: ReactNode}) {
  return <span className="guide-ui"><span className="guide-ui-icon" aria-hidden="true"><Icon size={13} strokeWidth={2}/></span>{children && <b translate="no">{children}</b>}</span>;
}
function Keys({keys}: {keys: string[]}) { return <span className="guide-keys">{keys.map(key => <kbd key={key}>{key}</kbd>)}</span>; }
function Num({n}: {n: number}) { return <span className="guide-num" aria-hidden="true">{n}</span>; }

type Point = {mark?: string; body: ReactNode};
type Step = {id: string; title: string; icon: LucideIcon; lead: ReactNode; shot?: Scene; points: Point[]; tip?: ReactNode};

function steps(os: Edition): Step[] {
  const mac = os === 'mac';
  const fileApp = mac ? 'Finder' : 'エクスプローラー';
  const undo = mac ? ['⌘', 'Z'] : ['Ctrl', 'Z'];
  const guideKeys = mac ? ['⌘', '?'] : ['F1'];
  return [
  mac ? {id: 'install', title: 'インストールと起動', icon: Download, lead: 'GitHub のリリースページから Mac 版のディスクイメージをダウンロードします。Apple シリコン搭載の Mac 用です。', points: [
    {body: <>ダウンロードした <code>Videe-バージョン-mac-arm64.dmg</code> を開き、<b translate="no">Videe</b> を <b>アプリケーション</b> フォルダーにドラッグします。</>},
    {body: <>Finder の <b>アプリケーション</b> で Videe を <Keys keys={['control']}/> を押しながらクリックし、<b>開く</b> を選びます。Videe は署名なしで配布しているため、初回だけ確認が表示されます。</>},
    {body: <>「開けません」と表示されたときは、<b>システム設定</b> → <b>プライバシーとセキュリティ</b> の下にある <b>このまま開く</b> を押します。</>},
  ], tip: <>アップデートは新しい dmg から Videe をアプリケーションフォルダーに上書きでドラッグするだけです。ライブラリや設定はそのまま残ります。</>} :
  {id: 'install', title: 'インストールと起動', icon: Download, lead: 'GitHub のリリースページから Windows 版インストーラーをダウンロードして実行します。', points: [
    {body: <>ダウンロードした <code>Videe-バージョン-win-setup.exe</code> をダブルクリックします。</>},
    {body: <>「Windows によって PC が保護されました」と表示されたら <b>詳細情報</b> を押し、<b>実行</b> を選びます。Videe は署名なしで配布しているため、初回だけ表示されます。</>},
    {body: <>インストール先を確認して <b>インストール</b> を押します。終わったらスタートメニューかデスクトップの Videe から起動します。</>},
  ], tip: <>アップデートも同じ手順で、新しいインストーラーを上書きで実行するだけです。ライブラリや設定はそのまま残ります。</>},
  {id: 'open', title: '動画を開く', icon: Upload, shot: 'start', lead: 'はじめに見たい動画をライブラリへ追加します。元のファイルはコピーも移動もされません。', points: [
    {mark: 'openVideo', body: <><UI icon={Upload}>Open video</UI> で動画ファイルを選びます。複数まとめて選べます。</>},
    {mark: 'openFolder', body: <><UI icon={FolderOpen}>Open folder</UI> でフォルダーごと読み込みます。サブフォルダーの動画も、同じ名前のフォルダーに整理して追加されます。</>},
    {mark: 'drop', body: <>{fileApp}から動画やフォルダーをウィンドウにドラッグ＆ドロップしても追加できます。</>},
  ]},
  {id: 'library', title: 'ライブラリを整理する', icon: LayoutGrid, shot: 'library', lead: '追加した動画は一覧で管理できます。続きから見る、お気に入り、フォルダー、プレイリストで探しやすくしましょう。', points: [
    {mark: 'nav', body: <><b translate="no">All videos</b>（すべて）、<b translate="no">Continue watching</b>（途中まで見た動画）、<b translate="no">Favorites</b>（<UI icon={Heart}/> を付けた動画）を切り替えます。</>},
    {mark: 'collections', body: <><UI icon={FolderPlus}/> でフォルダー、<UI icon={ListPlus}/> でプレイリストを作ります。動画をドラッグして入れられます。</>},
    {mark: 'search', body: <><UI icon={Search}>Search…</UI> にファイル名の一部を入力して絞り込みます。</>},
    {mark: 'layout', body: <><UI icon={LayoutGrid}/> サムネイル表示と <UI icon={List}/> リスト表示を切り替えます。リストでは列名を押すと並べ替えできます。</>},
    {mark: 'row', body: <>動画をクリックすると再生します。<UI icon={Ellipsis}/> から名前の確認、フォルダーへの移動、ライブラリからの削除ができます。</>},
  ]},
  {id: 'play', title: '再生する', icon: Play, shot: 'player', lead: 'プレイヤーの操作バーはマウスを動かすと表示されます。前回の続きから自動で再生されます。', points: [
    {mark: 'back', body: <><UI icon={ArrowLeft}/> でライブラリに戻ります。再生はミニプレイヤーで続きます。</>},
    {mark: 'seek', body: <>シークバーをクリックやドラッグで移動します。マウスを乗せるとその位置のプレビューが出ます。</>},
    {mark: 'transport', body: <><UI icon={Play}/> 再生・一時停止、<UI icon={Rewind}/> <UI icon={FastForward}/> で 10 秒戻る・進む。前後の動画にも移動できます。</>},
    {mark: 'options', body: <>再生速度、<UI icon={Captions}/> 字幕、<UI icon={Camera}/> 静止画の保存はここから。左側のボタンでループや操作ロックも使えます。</>},
    {mark: 'fullscreen', body: <><UI icon={Maximize}/> で全画面にします。ダブルクリックや <Keys keys={['F']}/> でも切り替えられます。</>},
  ]},
  {id: 'edit', title: '切り取って書き出す', icon: Scissors, shot: 'editor', lead: '不要な部分を取り除いて、新しい動画として保存できます。元のファイルは変更されません。', points: [
    {mark: 'toggle', body: <><UI icon={Scissors}>Edit video</UI> でエディターを開きます（<Keys keys={['E']}/>）。</>},
    {mark: 'timeline', body: <>タイムラインで範囲を選び、<Keys keys={['I']}/> 開始点、<Keys keys={['O']}/> 終了点、<Keys keys={['S']}/> で分割します。<Keys keys={undo}/> で元に戻せます。</>},
    {mark: 'export', body: <><b translate="no">Export</b> で画質、解像度、コーデックを選んで保存します。対応する GPU があれば高速に書き出します。</>},
  ]},
  {id: 'settings', title: '設定を確認する', icon: Settings2, shot: 'settings', lead: <>右上の <UI icon={Settings2}>Settings</UI> から開きます{mac ? <>（<Keys keys={['⌘', ',']}/>）</> : null}。{mac ? 'Mac' : 'Windows'} で特に確認しておきたい項目です。</>, points: [
    {mark: 'appearance', body: <><b translate="no">Appearance</b> でライト、ダーク、システムに合わせるを選びます。</>},
    {mark: 'resume', body: <><b translate="no">Resume playback</b> を有効にすると、前回止めた位置から再生します。</>},
    {mark: 'smooth', body: <><b translate="no">Smooth playback</b> を <b translate="no">Automatic</b> にすると、AVI や MKV など再生しにくい形式をその場で変換して滑らかに再生します。</>},
    {mark: 'hardware', body: <><b translate="no">Hardware acceleration</b> は {mac ? 'Apple の VideoToolbox' : 'GPU'} で再生と変換を行います。通常はオンのままにします。</>},
    {mark: 'diagnostics', body: <><b translate="no">Video diagnostics</b> で GPU が使われているかを確認できます。</>},
  ], tip: <>ライブラリを人に見られたくないときは、設定の下にある <UI icon={LockKeyhole}>Password lock</UI> で起動時のパスワードを設定できます。</>},
  mac ? {id: 'default-app', title: '動画をいつも Videe で開く', icon: MonitorCog, lead: 'Finder で動画をダブルクリックしたときに Videe で再生されるようにします。', points: [
    {body: <>Finder で動画ファイルを選び、<Keys keys={['⌘', 'I']}/> で <b>情報を見る</b> を開きます。</>},
    {body: <><b>このアプリケーションで開く</b> で <b translate="no">Videe</b> を選びます。</>},
    {body: <><b>すべてを変更…</b> を押すと、同じ種類の動画がすべて Videe で開くようになります。mp4、mov、mkv など拡張子ごとに設定します。</>},
  ], tip: <>Videe が起動していないときも、開いた動画はすぐにライブラリに追加されて再生が始まります。</>} :
  {id: 'default-app', title: '動画をいつも Videe で開く', icon: MonitorCog, lead: 'エクスプローラーで動画をダブルクリックしたときに Videe で再生されるようにします。', points: [
    {body: <>エクスプローラーで動画ファイルを右クリックし、<b>プログラムから開く</b> → <b>別のプログラムを選択</b> を選びます。</>},
    {body: <>一覧から <b translate="no">Videe</b> を選び、<b>常に使う</b> を押します。</>},
    {body: <>拡張子ごとにまとめて変えるときは、Windows の <b>設定</b> → <b>アプリ</b> → <b>既定のアプリ</b> → <b translate="no">Videe</b> から指定します。</>},
  ], tip: <>Videe が起動していないときも、開いた動画はすぐにライブラリに追加されて再生が始まります。</>},
  {id: 'shortcuts', title: 'キーボードショートカット', icon: Keyboard, lead: <>再生中に使えます。<Keys keys={guideKeys}/> を押すと、いつでもこのガイドを開けます。</>, points: []},
  {id: 'help', title: '困ったときは', icon: LifeBuoy, lead: 'よくある症状と対処です。', points: [
    {body: <><b>再生がカクつく、映像が出ない</b>：<UI icon={Settings2}>Settings</UI> の <b translate="no">Smooth playback</b> を <b translate="no">Automatic</b> にします。プレイヤー上部の <UI icon={Sparkles}>Smooth playback</UI> 表示を押すと、再生方式の詳細が見られます。</>},
    mac ? {body: <><b>Video decoding が Software fallback になる</b>：macOS を最新にして Videe を再起動します。<b translate="no">Hardware acceleration</b> がオンになっているかも確認してください。</>} :
    {body: <><b>Video decoding が Software fallback になる</b>：グラフィックドライバーを更新するか、Windows の <b>設定</b> → <b>システム</b> → <b>ディスプレイ</b> → <b>グラフィック</b> で Videe に「高パフォーマンス」を割り当てます。</>},
    {body: <><b>ディスクの空きが減った</b>：変換用のコピーは <b translate="no">Optimized copies</b> の <b translate="no">Clear</b> で削除できます。必要になれば自動で作り直します。</>},
    ...(mac ? [{body: <><b>「壊れているため開けません」と表示される</b>：ターミナルで <code>xattr -cr /Applications/Videe.app</code> を実行してから開き直します。</>}] : []),
    mac ? {body: <><b>「開発元を確認できない」と表示される</b>：<b>システム設定</b> → <b>プライバシーとセキュリティ</b> の <b>このまま開く</b> で起動できます。ダウンロード元が GitHub の Videe リリースページか確認してください。<UI icon={ShieldCheck}/></>} :
    {body: <><b>SmartScreen で起動できない</b>：<b>詳細情報</b> → <b>実行</b> で起動できます。ダウンロード元が GitHub の Videe リリースページか確認してください。<UI icon={ShieldCheck}/></>},
  ]},
  ];
}

const shortcuts = (os: Edition): [string, string[]][] => [['再生 / 一時停止', ['Space']], ['10 秒戻る / 進む', ['←', '→']], ['音量', ['↑', '↓']], ['0〜90% の位置へ', ['0', '…', '9']], ['速度を下げる / 上げる', ['[', ']']], ['1 コマ戻る / 進む', [',', '.']], ['全画面', ['F']], ['ミュート', ['M']], ['字幕', ['C']], ['静止画を保存', [os === 'mac' ? '⇧' : 'Shift', 'S']], ['エディター', ['E']], ['編集を元に戻す', os === 'mac' ? ['⌘', 'Z'] : ['Ctrl', 'Z']], ['クイックガイド', os === 'mac' ? ['⌘', '?'] : ['F1']]];

function Figure({shot, points}: {shot: Shot; points: Point[]}) {
  if (!shots[shot] || !IMAGES[shot]) return null;
  const data = shots[shot] as unknown as {width: number; height: number; marks: Record<string, Rect>};
  const marks = points.map((point, index) => point.mark && data.marks[point.mark] ? {n: index + 1, rect: data.marks[point.mark]} : null).filter(Boolean) as {n: number; rect: Rect}[];
  return <figure className={`guide-figure${data.height > data.width ? ' portrait' : ''}`} style={{aspectRatio: `${data.width} / ${data.height}`}}>
    <img src={IMAGES[shot]} width={data.width} height={data.height} alt="" loading="lazy" decoding="async"/>
    {marks.map(({n, rect: [x, y, w, h, side = 'left']}) => <span key={n} className={`guide-mark ${side}`} style={{left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`}} aria-hidden="true"><Num n={n}/></span>)}
  </figure>;
}

/** Illustrated quick guide, in a Windows and a Mac edition. Screenshots and callouts come from scripts/build-guide.mjs. */
export function QuickGuide({version, edition = currentEdition(), onClose, onStartTour}: {version: string; edition?: Edition; onClose: () => void; onStartTour?: () => void}) {
  const STEPS = steps(edition);
  const body = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(STEPS[0].id);
  const jump = (id: string) => { setCurrent(id); body.current?.querySelector(`#guide-${id}`)?.scrollIntoView({behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth', block: 'start'}); };
  // Highlights the step being read in the side panel.
  useEffect(() => {
    const root = body.current?.closest('dialog'); const sections = [...(body.current?.querySelectorAll<HTMLElement>('.guide-step') || [])];
    if (!root || !sections.length) return;
    const sync = () => {
      const top = root.getBoundingClientRect().top + 120;
      const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
      const passed = sections.filter(section => section.getBoundingClientRect().top <= top);
      setCurrent((atEnd ? sections[sections.length - 1] : passed[passed.length - 1] || sections[0]).id.replace(/^guide-/, ''));
    };
    root.addEventListener('scroll', sync, {passive: true});
    return () => root.removeEventListener('scroll', sync);
  }, [edition]);
  const nav = (className: string) => <nav className={className} aria-label="目次">{STEPS.map((step, index) => <button key={step.id} type="button" aria-current={current === step.id ? 'step' : undefined} onClick={() => jump(step.id)}><span className="guide-nav-num">{index + 1}</span><step.icon size={15} aria-hidden="true"/><span className="guide-nav-label">{step.title}</span></button>)}</nav>;
  return <Modal title="クイックガイド" className="guide-modal" onClose={onClose}>
    <div className="guide" ref={body}>
      <aside className="guide-side">
        <p className="guide-meta">{edition === 'mac' ? 'Mac' : 'Windows'} 版 · Videe {version}</p>
        {nav('guide-nav')}
        {onStartTour && <button type="button" className="secondary-button guide-side-tour" onClick={onStartTour}><Sparkles size={15} aria-hidden="true"/>ツアーをもう一度見る</button>}
      </aside>
      <div className="guide-main">
        <div className="guide-top"><p className="guide-meta">{edition === 'mac' ? 'Mac' : 'Windows'} 版 · Videe {version}</p>{nav('guide-toc')}</div>
        {STEPS.map((step, index) => <section key={step.id} id={`guide-${step.id}`} className="guide-step" aria-labelledby={`guide-${step.id}-title`}>
          <header><span className="guide-badge">STEP {index + 1}</span><h3 id={`guide-${step.id}-title`}><step.icon size={18} aria-hidden="true"/>{step.title}</h3></header>
          <p className="guide-lead">{step.lead}</p>
          {step.shot && <Figure shot={`${step.shot}-${edition}` as Shot} points={step.points}/>}
          {step.points.length > 0 && <ol className="guide-points">{step.points.map((point, i) => <li key={i}><Num n={i + 1}/><span>{point.body}</span></li>)}</ol>}
          {step.id === 'shortcuts' && <dl className="guide-shortcuts">{shortcuts(edition).map(([label, keys]) => <div key={label}><dt>{label}</dt><dd><Keys keys={keys}/></dd></div>)}</dl>}
          {step.tip && <p className="guide-tip"><Lightbulb size={15} aria-hidden="true"/><span><b>ポイント</b>{step.tip}</span></p>}
        </section>)}
        <div className="guide-footer">
          {onStartTour && <button type="button" className="secondary-button guide-footer-tour" onClick={onStartTour}><Sparkles size={15} aria-hidden="true"/>ツアーをもう一度見る</button>}
          <button type="button" className="primary-button" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  </Modal>;
}
