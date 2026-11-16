import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {ArrowLeft,Camera,Captions,Download,Ellipsis,FastForward,FolderOpen,FolderPlus,Info,Lightbulb,Heart,Keyboard,LayoutGrid,LifeBuoy,List,ListPlus,LockKeyhole,Maximize,MonitorCog,Play,Rewind,Scissors,Search,Settings2,ShieldCheck,Sparkles,Upload} from 'lucide-react';
import {Modal} from './Modal';
import shots from './guide/shots.json';
import {guideEdition} from './onboarding.mjs';
import {getLanguage,t,type Language} from './i18n.mjs';
import {ALTSTORE_JSON} from './altstore.mjs';

type Shot = keyof typeof shots;
type Edition = 'win' | 'mac' | 'ios';
type Scene = 'start' | 'library' | 'player' | 'editor' | 'settings';
/** x, y, width, height in percent of the image, then which edge carries the number. */
type Rect = [number, number, number, number, ('left' | 'right')?];
// Screenshots of each edition, in each language, e.g. ./guide/player-mac-ja.webp. Bundled, so the guide works offline.
const IMAGES = Object.fromEntries(Object.entries(import.meta.glob('./guide/*.webp', {eager: true, import: 'default', query: '?url'}) as Record<string, string>).map(([path, url]) => [path.replace(/^.*\/|\.webp$/g, ''), url])) as Record<Shot, string>;
/** The edition this app should show: Mac for the Mac app, iOS on iPhone and iPad, Windows otherwise. */
export const currentEdition = (): Edition => guideEdition({platform: window.videe?.platform, userAgent: navigator.userAgent, touch: navigator.maxTouchPoints > 1});
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

function steps(os: Edition, language: Language): Step[] {
  if (os === 'ios') return language === 'ja' ? stepsIosJa() : stepsIosEn();
  return language === 'ja' ? stepsJa(os) : stepsEn(os);
}

// iPhone and iPad: sideloaded with AltStore or Sideloadly; videos arrive from the Files app or the picker.
function stepsIosJa(): Step[] {
  return [
  {id: 'install', title: 'インストールと起動', icon: Download, lead: 'iPhone / iPad 版は App Store ではなく、AltStore か Sideloadly で入れます。', points: [
    {body: <>AltStore の <b>Browse</b> → <b>Sources</b> で <b>＋</b> を押し、<code>{ALTSTORE_JSON}</code> を追加して Videe を入手します。新しい版が出ると AltStore から更新できます。</>},
    {body: <>Sideloadly を使う場合は、リリースページの <code>Videe-バージョン-ios.ipa</code> をパソコンにダウンロードし、iPhone をつないで Sideloadly に読み込ませます。</>},
    {body: <>初回は iPhone の <b>設定</b> → <b>一般</b> → <b>VPN とデバイス管理</b> で自分の Apple ID を信頼してから、ホーム画面の Videe を開きます。</>},
  ], tip: <>無料の Apple ID で入れたアプリは 7 日ごとに再署名が必要です。AltStore の <b>My Apps</b> で <b>Refresh</b> を押してください。ライブラリや設定はそのまま残ります。</>},
  {id: 'open', title: '動画を開く', icon: Upload, shot: 'start', lead: '見たい動画をライブラリへ追加します。', points: [
    {mark: 'openVideo', body: <><UI icon={Upload}>{t('Open video')}</UI> で写真やファイルから動画を選びます。複数まとめて選べます。</>},
    {mark: 'openFolder', body: <><UI icon={FolderOpen}>{t('Open folder')}</UI> でフォルダーの動画をまとめて追加します。</>},
    {mark: 'drop', body: <><b>ファイル</b> アプリで動画を長押しし、<b>共有</b> → <b translate="no">Videe</b> を選んでも追加できます。</>},
  ]},
  {id: 'library', title: 'ライブラリを整理する', icon: LayoutGrid, shot: 'library', lead: '追加した動画はサムネイルで並びます。上のタブと検索で探せます。', points: [
    {mark: 'nav', body: <><b>{t('All videos')}</b>、<b>{t('Continue watching')}</b>、<b>{t('Favorites')}</b> をタブで切り替えます。</>},
    {mark: 'search', body: <><UI icon={Search}>{t('Search…')}</UI> にファイル名の一部を入力して絞り込みます。</>},
    {mark: 'layout', body: <><UI icon={LayoutGrid}/> サムネイル表示と <UI icon={List}/> リスト表示を切り替えます。</>},
    {mark: 'row', body: <>動画をタップすると再生します。<UI icon={Info}/> で情報の確認、お気に入り、フォルダーへの移動、削除ができます。長押しすると複数選択になります。</>},
  ]},
  {id: 'play', title: '再生する', icon: Play, shot: 'player', lead: '画面をタップすると操作バーが出ます。前回の続きから自動で再生されます。', points: [
    {mark: 'back', body: <><UI icon={ArrowLeft}/> でライブラリに戻ります。再生は画面下のミニプレイヤーで続きます。</>},
    {mark: 'seek', body: <>シークバーをドラッグして好きな位置へ移動します。</>},
    {mark: 'transport', body: <><UI icon={Play}/> 再生・一時停止、<UI icon={Rewind}/> <UI icon={FastForward}/> で 10 秒戻る・進む。前後の動画にも移動できます。</>},
    {mark: 'more', body: <><UI icon={Ellipsis}>{t('More controls')}</UI> から再生速度、<UI icon={Captions}/> 字幕、<UI icon={Camera}/> 静止画の保存、ズーム、操作ロックを使えます。</>},
    {mark: 'fullscreen', body: <><UI icon={Maximize}/> で全画面にします。iPhone を横向きにすると大きく見られます。</>},
  ]},
  {id: 'settings', title: '設定を確認する', icon: Settings2, shot: 'settings', lead: <>右上の <UI icon={Settings2}>{t('Settings')}</UI> から開きます。</>, points: [
    {mark: 'appearance', body: <><b>{t('Appearance')}</b> でライト、ダーク、システムに合わせるを選びます。<b>{t('Language')}</b> で日本語と英語を切り替えられます。</>},
    {mark: 'resume', body: <><b>{t('Resume playback')}</b> を有効にすると、前回止めた位置から再生します。</>},
  ], tip: <>ライブラリを人に見られたくないときは、設定の下にある <UI icon={LockKeyhole}>{t('Password lock')}</UI> で起動時のパスワードを設定できます。</>},
  {id: 'help', title: '困ったときは', icon: LifeBuoy, lead: 'よくある症状と対処です。', points: [
    {body: <><b>アプリが開かなくなった</b>：署名の期限（7 日）が切れています。AltStore の <b>My Apps</b> で <b>Refresh</b> を押すか、Sideloadly でもう一度入れます。</>},
    {body: <><b>再生できない動画がある</b>：AVI や一部の MKV など iPhone が対応していない形式は再生できません。Mac / Windows 版の Videe で再生するか、書き出しで MP4 に変換してください。</>},
    {body: <><b>「信頼されていないデベロッパ」と表示される</b>：<b>設定</b> → <b>一般</b> → <b>VPN とデバイス管理</b> で自分の Apple ID を信頼します。<UI icon={ShieldCheck}/></>},
  ]},
  ];
}

function stepsIosEn(): Step[] {
  return [
  {id: 'install', title: 'Install and open Videe', icon: Download, lead: 'The iPhone and iPad app is not on the App Store. Install it with AltStore or Sideloadly.', points: [
    {body: <>In AltStore, go to <b>Browse</b> → <b>Sources</b>, press <b>+</b>, add <code>{ALTSTORE_JSON}</code> and get Videe. New versions then update from AltStore.</>},
    {body: <>With Sideloadly, download <code>Videe-version-ios.ipa</code> from the releases page to your computer, connect the iPhone and load the file in Sideloadly.</>},
    {body: <>The first time, trust your Apple ID in <b>Settings</b> → <b>General</b> → <b>VPN &amp; Device Management</b>, then open Videe from the Home Screen.</>},
  ], tip: <>Apps installed with a free Apple ID must be re-signed every 7 days. Press <b>Refresh</b> in AltStore’s <b>My Apps</b>. Your library and settings stay.</>},
  {id: 'open', title: 'Open videos', icon: Upload, shot: 'start', lead: 'Add the videos you want to watch to the library.', points: [
    {mark: 'openVideo', body: <><UI icon={Upload}>{t('Open video')}</UI> picks videos from Photos or Files. You can choose several at once.</>},
    {mark: 'openFolder', body: <><UI icon={FolderOpen}>{t('Open folder')}</UI> adds the videos in a folder.</>},
    {mark: 'drop', body: <>In the <b>Files</b> app, touch and hold a video, then choose <b>Share</b> → <b translate="no">Videe</b>.</>},
  ]},
  {id: 'library', title: 'Organize the library', icon: LayoutGrid, shot: 'library', lead: 'Your videos appear as thumbnails. Use the tabs and search to find them.', points: [
    {mark: 'nav', body: <>Switch between <b>{t('All videos')}</b>, <b>{t('Continue watching')}</b> and <b>{t('Favorites')}</b> with the tabs.</>},
    {mark: 'search', body: <>Type part of a file name in <UI icon={Search}>{t('Search…')}</UI> to filter.</>},
    {mark: 'layout', body: <><UI icon={LayoutGrid}/> shows thumbnails and <UI icon={List}/> a list.</>},
    {mark: 'row', body: <>Tap a video to play it. <UI icon={Info}/> shows its details and lets you favorite, move or remove it. Touch and hold to select several.</>},
  ]},
  {id: 'play', title: 'Play', icon: Play, shot: 'player', lead: 'Tap the video to show the controls. Videos continue where you left off.', points: [
    {mark: 'back', body: <><UI icon={ArrowLeft}/> goes back to the library. Playback continues in the mini player at the bottom.</>},
    {mark: 'seek', body: <>Drag the seek bar to move through the video.</>},
    {mark: 'transport', body: <><UI icon={Play}/> plays and pauses; <UI icon={Rewind}/> <UI icon={FastForward}/> go back or forward 10 seconds. You can also skip to the previous or next video.</>},
    {mark: 'more', body: <><UI icon={Ellipsis}>{t('More controls')}</UI> holds speed, <UI icon={Captions}/> subtitles, <UI icon={Camera}/> save frame, zoom and the control lock.</>},
    {mark: 'fullscreen', body: <><UI icon={Maximize}/> goes full screen. Turn the iPhone sideways for a bigger picture.</>},
  ]},
  {id: 'settings', title: 'Check the settings', icon: Settings2, shot: 'settings', lead: <>Open <UI icon={Settings2}>{t('Settings')}</UI> at the top right.</>, points: [
    {mark: 'appearance', body: <><b>{t('Appearance')}</b> picks light, dark or system. <b>{t('Language')}</b> switches between Japanese and English.</>},
    {mark: 'resume', body: <>With <b>{t('Resume playback')}</b> on, videos continue where you stopped.</>},
  ], tip: <>To keep your library private, set a password in <UI icon={LockKeyhole}>{t('Password lock')}</UI> near the bottom of Settings.</>},
  {id: 'help', title: 'Troubleshooting', icon: LifeBuoy, lead: 'Common problems and what to do.', points: [
    {body: <><b>The app no longer opens</b>: its 7-day signature expired. Press <b>Refresh</b> in AltStore’s <b>My Apps</b>, or install it again with Sideloadly.</>},
    {body: <><b>Some videos don’t play</b>: formats the iPhone can’t decode, such as AVI and some MKV files, don’t play. Play them in Videe for Mac or Windows, or export them as MP4 there.</>},
    {body: <><b>“Untrusted Developer”</b>: trust your Apple ID in <b>Settings</b> → <b>General</b> → <b>VPN &amp; Device Management</b>. <UI icon={ShieldCheck}/></>},
  ]},
  ];
}

// Control names come from t() so the guide always matches the labels on screen.
function stepsJa(os: Edition): Step[] {
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
    {mark: 'openVideo', body: <><UI icon={Upload}>{t('Open video')}</UI> で動画ファイルを選びます。複数まとめて選べます。</>},
    {mark: 'openFolder', body: <><UI icon={FolderOpen}>{t('Open folder')}</UI> でフォルダーごと読み込みます。サブフォルダーの動画も、同じ名前のフォルダーに整理して追加されます。</>},
    {mark: 'drop', body: <>{fileApp}から動画やフォルダーをウィンドウにドラッグ＆ドロップしても追加できます。</>},
  ]},
  {id: 'library', title: 'ライブラリを整理する', icon: LayoutGrid, shot: 'library', lead: '追加した動画は一覧で管理できます。続きから見る、お気に入り、フォルダー、プレイリストで探しやすくしましょう。', points: [
    {mark: 'nav', body: <><b>{t('All videos')}</b>、<b>{t('Continue watching')}</b>（途中まで見た動画）、<b>{t('Favorites')}</b>（<UI icon={Heart}/> を付けた動画）を切り替えます。</>},
    {mark: 'collections', body: <><UI icon={FolderPlus}/> でフォルダー、<UI icon={ListPlus}/> でプレイリストを作ります。動画をドラッグして入れられます。</>},
    {mark: 'search', body: <><UI icon={Search}>{t('Search…')}</UI> にファイル名の一部を入力して絞り込みます。</>},
    {mark: 'layout', body: <><UI icon={LayoutGrid}/> サムネイル表示と <UI icon={List}/> リスト表示を切り替えます。リストでは列名を押すと並べ替えできます。</>},
    {mark: 'row', body: <>動画をクリックすると再生します。<UI icon={Info}/> で長さやサイズなどの情報を確認でき、フォルダーへの移動やライブラリからの削除もここからできます。</>},
  ]},
  {id: 'play', title: '再生する', icon: Play, shot: 'player', lead: 'プレイヤーの操作バーはマウスを動かすと表示されます。前回の続きから自動で再生されます。', points: [
    {mark: 'back', body: <><UI icon={ArrowLeft}/> でライブラリに戻ります。再生はミニプレイヤーで続きます。</>},
    {mark: 'seek', body: <>シークバーをクリックやドラッグで移動します。マウスを乗せるとその位置のプレビューが出ます。</>},
    {mark: 'transport', body: <><UI icon={Play}/> 再生・一時停止、<UI icon={Rewind}/> <UI icon={FastForward}/> で 10 秒戻る・進む。前後の動画にも移動できます。</>},
    {mark: 'options', body: <>再生速度、<UI icon={Captions}/> 字幕、<UI icon={Camera}/> 静止画の保存はここから。左側のボタンでループや操作ロックも使えます。</>},
    {mark: 'fullscreen', body: <><UI icon={Maximize}/> で全画面にします。ダブルクリックや <Keys keys={['F']}/> でも切り替えられます。</>},
  ]},
  {id: 'edit', title: '切り取って書き出す', icon: Scissors, shot: 'editor', lead: '不要な部分を取り除いて、新しい動画として保存できます。元のファイルは変更されません。', points: [
    {mark: 'toggle', body: <><UI icon={Scissors}>{t('Edit video')}</UI> でエディターを開きます（<Keys keys={['E']}/>）。</>},
    {mark: 'timeline', body: <>タイムラインで範囲を選び、<Keys keys={['I']}/> 開始点、<Keys keys={['O']}/> 終了点、<Keys keys={['S']}/> で分割します。<Keys keys={undo}/> で元に戻せます。</>},
    {mark: 'export', body: <><b>{t('Export…')}</b> で画質、解像度、コーデックを選んで保存します。対応する GPU があれば高速に書き出します。</>},
  ]},
  {id: 'settings', title: '設定を確認する', icon: Settings2, shot: 'settings', lead: <>右上の <UI icon={Settings2}>{t('Settings')}</UI> から開きます{mac ? <>（<Keys keys={['⌘', ',']}/>）</> : null}。{mac ? 'Mac' : 'Windows'} で特に確認しておきたい項目です。</>, points: [
    {mark: 'appearance', body: <><b>{t('Appearance')}</b> でライト、ダーク、システムに合わせるを選びます。<b>{t('Language')}</b> で日本語と英語を切り替えられます。</>},
    {mark: 'resume', body: <><b>{t('Resume playback')}</b> を有効にすると、前回止めた位置から再生します。</>},
    {mark: 'smooth', body: <><b>{t('Smooth playback')}</b> を <b>{t('Automatic')}</b> にすると、AVI や MKV など再生しにくい形式をその場で変換して滑らかに再生します。</>},
    {mark: 'hardware', body: <><b>{t('Hardware acceleration')}</b> は {mac ? 'Apple の VideoToolbox' : 'GPU'} で再生と変換を行います。通常はオンのままにします。</>},
    {mark: 'diagnostics', body: <><b>{t('Video diagnostics')}</b> で GPU が使われているかを確認できます。</>},
  ], tip: <>ライブラリを人に見られたくないときは、設定の下にある <UI icon={LockKeyhole}>{t('Password lock')}</UI> で起動時のパスワードを設定できます。</>},
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
    {body: <><b>再生がカクつく、映像が出ない</b>：<UI icon={Settings2}>{t('Settings')}</UI> の <b>{t('Smooth playback')}</b> を <b>{t('Automatic')}</b> にします。プレイヤー上部の <UI icon={Sparkles}>{t('Smooth playback')}</UI> 表示を押すと、再生方式の詳細が見られます。</>},
    mac ? {body: <><b>{t('Video decoding')}が「{t('Software fallback')}」になる</b>：macOS を最新にして Videe を再起動します。<b>{t('Hardware acceleration')}</b> がオンになっているかも確認してください。</>} :
    {body: <><b>{t('Video decoding')}が「{t('Software fallback')}」になる</b>：グラフィックドライバーを更新するか、Windows の <b>設定</b> → <b>システム</b> → <b>ディスプレイ</b> → <b>グラフィック</b> で Videe に「高パフォーマンス」を割り当てます。</>},
    {body: <><b>ディスクの空きが減った</b>：変換用のコピーは <b>{t('Playback copies')}</b> の <b>{t('Clear')}</b> で削除できます。必要になれば自動で作り直します。</>},
    ...(mac ? [{body: <><b>「壊れているため開けません」と表示される</b>：ターミナルで <code>xattr -cr /Applications/Videe.app</code> を実行してから開き直します。</>}] : []),
    mac ? {body: <><b>「開発元を確認できない」と表示される</b>：<b>システム設定</b> → <b>プライバシーとセキュリティ</b> の <b>このまま開く</b> で起動できます。ダウンロード元が GitHub の Videe リリースページか確認してください。<UI icon={ShieldCheck}/></>} :
    {body: <><b>SmartScreen で起動できない</b>：<b>詳細情報</b> → <b>実行</b> で起動できます。ダウンロード元が GitHub の Videe リリースページか確認してください。<UI icon={ShieldCheck}/></>},
  ]},
  ];
}

function stepsEn(os: Edition): Step[] {
  const mac = os === 'mac';
  const fileApp = mac ? 'Finder' : 'File Explorer';
  const undo = mac ? ['⌘', 'Z'] : ['Ctrl', 'Z'];
  const guideKeys = mac ? ['⌘', '?'] : ['F1'];
  return [
  mac ? {id: 'install', title: 'Install and open Videe', icon: Download, lead: 'Download the Mac disk image from the GitHub releases page. It is built for Macs with Apple silicon.', points: [
    {body: <>Open the downloaded <code>Videe-version-mac-arm64.dmg</code> and drag <b translate="no">Videe</b> to the <b>Applications</b> folder.</>},
    {body: <>In <b>Applications</b> in Finder, hold <Keys keys={['control']}/> and click Videe, then choose <b>Open</b>. Videe is distributed unsigned, so macOS asks once.</>},
    {body: <>If macOS says the app can’t be opened, go to <b>System Settings</b> → <b>Privacy &amp; Security</b> and press <b>Open Anyway</b>.</>},
  ], tip: <>To update, drag Videe from the new disk image onto the Applications folder again. Your library and settings stay.</>} :
  {id: 'install', title: 'Install and open Videe', icon: Download, lead: 'Download the Windows installer from the GitHub releases page and run it.', points: [
    {body: <>Double-click the downloaded <code>Videe-version-win-setup.exe</code>.</>},
    {body: <>If you see “Windows protected your PC”, press <b>More info</b>, then <b>Run anyway</b>. Videe is distributed unsigned, so this appears only the first time.</>},
    {body: <>Check the install location and press <b>Install</b>. When it finishes, start Videe from the Start menu or the desktop.</>},
  ], tip: <>To update, run the new installer the same way. Your library and settings stay.</>},
  {id: 'open', title: 'Open videos', icon: Upload, shot: 'start', lead: 'Start by adding the videos you want to watch to the library. Your files are never copied or moved.', points: [
    {mark: 'openVideo', body: <><UI icon={Upload}>{t('Open video')}</UI> picks video files. You can choose several at once.</>},
    {mark: 'openFolder', body: <><UI icon={FolderOpen}>{t('Open folder')}</UI> adds a whole folder. Videos in subfolders go into folders with the same names.</>},
    {mark: 'drop', body: <>You can also drag videos or folders from {fileApp} onto the window.</>},
  ]},
  {id: 'library', title: 'Organize the library', icon: LayoutGrid, shot: 'library', lead: 'Everything you add is listed here. Continue watching, favorites, folders and playlists make videos easy to find.', points: [
    {mark: 'nav', body: <>Switch between <b>{t('All videos')}</b>, <b>{t('Continue watching')}</b> (videos you stopped partway) and <b>{t('Favorites')}</b> (videos marked with <UI icon={Heart}/>).</>},
    {mark: 'collections', body: <><UI icon={FolderPlus}/> creates a folder and <UI icon={ListPlus}/> a playlist. Drag videos onto them to add them.</>},
    {mark: 'search', body: <>Type part of a file name in <UI icon={Search}>{t('Search…')}</UI> to filter the list.</>},
    {mark: 'layout', body: <><UI icon={LayoutGrid}/> shows thumbnails and <UI icon={List}/> a list. In the list, press a column name to sort.</>},
    {mark: 'row', body: <>Click a video to play it. <UI icon={Info}/> shows its length, size and other details, and moves it to a folder or removes it from the library.</>},
  ]},
  {id: 'play', title: 'Play', icon: Play, shot: 'player', lead: 'The player controls appear when you move the mouse. Videos pick up where you left off.', points: [
    {mark: 'back', body: <><UI icon={ArrowLeft}/> goes back to the library. Playback continues in the mini player.</>},
    {mark: 'seek', body: <>Click or drag the seek bar to move. Hover over it to preview that moment.</>},
    {mark: 'transport', body: <><UI icon={Play}/> plays and pauses, <UI icon={Rewind}/> <UI icon={FastForward}/> jump 10 seconds back or forward. You can also go to the previous or next video.</>},
    {mark: 'options', body: <>Playback speed, <UI icon={Captions}/> subtitles and <UI icon={Camera}/> save frame live here. The buttons on the left add a loop or lock the controls.</>},
    {mark: 'fullscreen', body: <><UI icon={Maximize}/> goes full screen. Double-click the video or press <Keys keys={['F']}/> to switch too.</>},
  ]},
  {id: 'edit', title: 'Trim and export', icon: Scissors, shot: 'editor', lead: 'Cut out the parts you don’t need and save the rest as a new video. The original file never changes.', points: [
    {mark: 'toggle', body: <><UI icon={Scissors}>{t('Edit video')}</UI> opens the editor (<Keys keys={['E']}/>).</>},
    {mark: 'timeline', body: <>Pick a range on the timeline: <Keys keys={['I']}/> sets the start, <Keys keys={['O']}/> the end and <Keys keys={['S']}/> splits. <Keys keys={undo}/> undoes.</>},
    {mark: 'export', body: <><b>{t('Export…')}</b> saves the result with the quality, resolution and codec you choose. A supported GPU makes it faster.</>},
  ]},
  {id: 'settings', title: 'Check the settings', icon: Settings2, shot: 'settings', lead: <>Open <UI icon={Settings2}>{t('Settings')}</UI> at the top right{mac ? <> (<Keys keys={['⌘', ',']}/>)</> : null}. These are the settings worth checking on {mac ? 'Mac' : 'Windows'}.</>, points: [
    {mark: 'appearance', body: <><b>{t('Appearance')}</b> chooses light, dark or the system setting. <b>{t('Language')}</b> switches between Japanese and English.</>},
    {mark: 'resume', body: <>With <b>{t('Resume playback')}</b> on, videos start where you stopped them.</>},
    {mark: 'smooth', body: <>Set <b>{t('Smooth playback')}</b> to <b>{t('Automatic')}</b> to convert hard-to-play formats such as AVI or MKV on the fly.</>},
    {mark: 'hardware', body: <><b>{t('Hardware acceleration')}</b> plays and converts video with {mac ? 'Apple VideoToolbox' : 'the GPU'}. Leave it on.</>},
    {mark: 'diagnostics', body: <><b>{t('Video diagnostics')}</b> shows whether the GPU is in use.</>},
  ], tip: <>To keep your library private, set a password under <UI icon={LockKeyhole}>{t('Password lock')}</UI> at the bottom of Settings.</>},
  mac ? {id: 'default-app', title: 'Always open videos in Videe', icon: MonitorCog, lead: 'Make videos you double-click in Finder play in Videe.', points: [
    {body: <>Select a video file in Finder and press <Keys keys={['⌘', 'I']}/> to open <b>Get Info</b>.</>},
    {body: <>Under <b>Open with</b>, choose <b translate="no">Videe</b>.</>},
    {body: <>Press <b>Change All…</b> so every video of that type opens in Videe. Repeat for each extension, such as mp4, mov and mkv.</>},
  ], tip: <>Even when Videe isn’t running, a video you open is added to the library and starts playing right away.</>} :
  {id: 'default-app', title: 'Always open videos in Videe', icon: MonitorCog, lead: 'Make videos you double-click in File Explorer play in Videe.', points: [
    {body: <>Right-click a video file in File Explorer and choose <b>Open with</b> → <b>Choose another app</b>.</>},
    {body: <>Pick <b translate="no">Videe</b> from the list and press <b>Always</b>.</>},
    {body: <>To change several extensions at once, go to Windows <b>Settings</b> → <b>Apps</b> → <b>Default apps</b> → <b translate="no">Videe</b>.</>},
  ], tip: <>Even when Videe isn’t running, a video you open is added to the library and starts playing right away.</>},
  {id: 'shortcuts', title: 'Keyboard shortcuts', icon: Keyboard, lead: <>These work while a video is playing. Press <Keys keys={guideKeys}/> any time to open this guide.</>, points: []},
  {id: 'help', title: 'Troubleshooting', icon: LifeBuoy, lead: 'Common problems and what to do.', points: [
    {body: <><b>Playback stutters or shows no picture</b>: set <b>{t('Smooth playback')}</b> in <UI icon={Settings2}>{t('Settings')}</UI> to <b>{t('Automatic')}</b>. Press the <UI icon={Sparkles}>{t('Smooth playback')}</UI> badge above the player for playback details.</>},
    mac ? {body: <><b>{t('Video decoding')} shows “{t('Software fallback')}”</b>: update macOS and restart Videe. Also check that <b>{t('Hardware acceleration')}</b> is on.</>} :
    {body: <><b>{t('Video decoding')} shows “{t('Software fallback')}”</b>: update the graphics driver, or assign “High performance” to Videe in Windows <b>Settings</b> → <b>System</b> → <b>Display</b> → <b>Graphics</b>.</>},
    {body: <><b>Disk space went down</b>: <b>{t('Clear')}</b> next to <b>{t('Playback copies')}</b> removes the converted copies. Videe makes them again when needed.</>},
    ...(mac ? [{body: <><b>macOS says the app “is damaged and can’t be opened”</b>: run <code>xattr -cr /Applications/Videe.app</code> in Terminal, then open it again.</>}] : []),
    mac ? {body: <><b>macOS can’t verify the developer</b>: open it with <b>Open Anyway</b> in <b>System Settings</b> → <b>Privacy &amp; Security</b>. Make sure you downloaded it from the Videe releases page on GitHub. <UI icon={ShieldCheck}/></>} :
    {body: <><b>SmartScreen blocks the app</b>: press <b>More info</b> → <b>Run anyway</b>. Make sure you downloaded it from the Videe releases page on GitHub. <UI icon={ShieldCheck}/></>},
  ]},
  ];
}

const shortcuts = (os: Edition): [string, string[]][] => [['Play / pause', ['Space']], ['Back / forward 10 seconds', ['←', '→']], ['Volume', ['↑', '↓']], ['Jump to 0–90%', ['0', '…', '9']], ['Slower / faster', ['[', ']']], ['Previous / next frame', [',', '.']], ['Full screen', ['F']], ['Mute', ['M']], ['Subtitles', ['C']], ['Save frame', [os === 'mac' ? '⇧' : 'Shift', 'S']], ['Editor', ['E']], ['Undo edit', os === 'mac' ? ['⌘', 'Z'] : ['Ctrl', 'Z']], ['Quick guide', os === 'mac' ? ['⌘', '?'] : ['F1']]];

function Figure({shot, points}: {shot: Shot; points: Point[]}) {
  if (!shots[shot] || !IMAGES[shot]) return null;
  const data = shots[shot] as unknown as {width: number; height: number; marks: Record<string, Rect>};
  const marks = points.map((point, index) => point.mark && data.marks[point.mark] ? {n: index + 1, rect: data.marks[point.mark]} : null).filter(Boolean) as {n: number; rect: Rect}[];
  return <figure className={`guide-figure${data.height > data.width ? ' portrait' : ''}`} style={{aspectRatio: `${data.width} / ${data.height}`}}>
    <img src={IMAGES[shot]} width={data.width} height={data.height} alt="" loading="lazy" decoding="async"/>
    {marks.map(({n, rect: [x, y, w, h, side = 'left']}) => <span key={n} className={`guide-mark ${side}`} style={{left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`}} aria-hidden="true"><Num n={n}/></span>)}
  </figure>;
}

/** Illustrated quick guide, in Windows, Mac and iPhone/iPad editions. Screenshots and callouts come from scripts/build-guide.mjs. */
export function QuickGuide({version, edition = currentEdition(), onClose, onStartTour}: {version: string; edition?: Edition; onClose: () => void; onStartTour?: () => void}) {
  const language = getLanguage();
  const STEPS = steps(edition, language);
  const body = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(STEPS[0].id);
  const meta = t(edition === 'mac' ? 'Mac edition · Videe {version}' : edition === 'ios' ? 'iPhone and iPad edition · Videe {version}' : 'Windows edition · Videe {version}', {version});
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
  const nav = (className: string) => <nav className={className} aria-label={t('Contents')}>{STEPS.map((step, index) => <button key={step.id} type="button" aria-current={current === step.id ? 'step' : undefined} onClick={() => jump(step.id)}><span className="guide-nav-num">{index + 1}</span><step.icon size={15} aria-hidden="true"/><span className="guide-nav-label">{step.title}</span></button>)}</nav>;
  return <Modal title={t('Quick guide')} className="guide-modal" onClose={onClose}>
    <div className="guide" ref={body}>
      <aside className="guide-side">
        <p className="guide-meta">{meta}</p>
        {nav('guide-nav')}
        {onStartTour && <button type="button" className="secondary-button guide-side-tour" onClick={onStartTour}><Sparkles size={15} aria-hidden="true"/>{t('Take the tour again')}</button>}
      </aside>
      <div className="guide-main">
        <div className="guide-top"><p className="guide-meta">{meta}</p>{nav('guide-toc')}</div>
        {STEPS.map((step, index) => <section key={step.id} id={`guide-${step.id}`} className="guide-step" aria-labelledby={`guide-${step.id}-title`}>
          <header><span className="guide-badge">{t('STEP {n}', {n: index + 1})}</span><h3 id={`guide-${step.id}-title`}><step.icon size={18} aria-hidden="true"/>{step.title}</h3></header>
          <p className="guide-lead">{step.lead}</p>
          {step.shot && <Figure shot={`${step.shot}-${edition}-${language}` as Shot} points={step.points}/>}
          {step.points.length > 0 && <ol className="guide-points">{step.points.map((point, i) => <li key={i}><Num n={i + 1}/><span>{point.body}</span></li>)}</ol>}
          {step.id === 'shortcuts' && <dl className="guide-shortcuts">{shortcuts(edition).map(([label, keys]) => <div key={label}><dt>{t(label)}</dt><dd><Keys keys={keys}/></dd></div>)}</dl>}
          {step.tip && <p className="guide-tip"><Lightbulb size={15} aria-hidden="true"/><span><b>{t('Tip')}</b>{step.tip}</span></p>}
        </section>)}
        <div className="guide-footer">
          {onStartTour && <button type="button" className="secondary-button guide-footer-tour" onClick={onStartTour}><Sparkles size={15} aria-hidden="true"/>{t('Take the tour again')}</button>}
          <button type="button" className="primary-button" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  </Modal>;
}
