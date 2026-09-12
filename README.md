# Videe

ローカル動画のためのプレイヤー。提供された `videe.heic` をアイコンとして採用。OS標準フォントを使い、動画一覧と再生画面を分けたシンプルなUIに整理しています。初回画面の操作は「動画を開く」の1つだけ。再生中の操作は映像の下にまとめています。Appleのサイドバー・ツールバーの設計を参考に、デスクトップではカテゴリ別サイドバー、モバイルでは切り替えタブを採用しています。

## 今回確認した不足機能と実装結果

- [x] 視聴途中だけを表示するカテゴリと動画件数
- [x] 最近開いた順・名前順・再生時間順・サイズ順の並べ替え
- [x] グリッド／リスト表示の切り替えと設定保存
- [x] ライト／ダーク／システム連動の外観設定
- [x] 一覧の表示順を引き継ぐ前後の動画再生（再生開始時に順序を固定）
- [x] 動画情報（サイズ、時間、位置、追加日、保存方法）
- [x] 動画ごとの再生履歴リセットと永続化
- [x] デスクトップのサイドバー、モバイルのタブ、検索・表示ツールバー、初回画面の更新

検証: `npm run build`、`npm test`、`npm run test:browser`、`npm run test:library`、`npm run test:desktop`。
追加テストは複数の実動画を使用し、絞り込み・名前順・前後再生・設定復元・情報表示・履歴リセットの永続化・390px表示を確認します。
デスクトップ／ブラウザの既存機能も回帰検証済みです。Windows／iPhone実機と署名配布の検証状況は下記の制約が引き続き適用されます。

デザイン参照: [Apple — Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Apple — Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)。

## アイコンと再生設定の追加改善

- リピートを「オフ／1本／一覧全体」から選択し、端末内に保存。再生画面のリピートボタンでも順に切り替えられます。
- 「自動再生」は動画を開いた直後、「次の動画を自動再生」は再生終了後の動作です。個別に設定できます。
- 一覧全体のリピートは、再生開始時の検索・カテゴリ・並べ替えを反映した順序で再生し、最後から先頭へ戻ります。1本だけの一覧にも対応します。リピートは「次の動画を自動再生」より優先されます。
- 連続再生で移動した動画は先頭から再生し、手動で開いた動画は「続きから再生」設定に従います。
- 古い設定は以前の動作を引き継ぎ、不正な値は既定値・有効範囲に修復します。
- 設定画面にアイコンとバージョン情報を追加。モバイルでは操作部の高さに合わせて映像領域を調整します。
- 既存の1024pxの絵柄から、Mac用ICNS、Windows用ICO、ブラウザ・ホーム画面用PNGを生成。MacのDockにも設定しています。
- Webマニフェストを追加。ホーム画面への追加可否はブラウザに依存します。オフライン起動用サービスワーカーは追加していません。

アイコンの再生成はMac上で `npm run icons:build`。元画像は `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`、生成先は `public/icon.png` と `public/icons/` です。生成済みアセットを同梱するので、Windowsのパッケージ時に再生成は不要です。

今回の検証: 単体テスト11件、実動画での1本／一覧全体リピート・最後で停止・連続再生の分離・再読込後の設定復元・不正設定の修復・390px幅の操作部表示、既存ブラウザ／Electron回帰検証。追加検証は `npm run test:playback` で実行できます。Mac arm64パッケージの再作成と隔離ストレージでの起動・ICNS同梱・設定画面の検証も成功しました（`node scripts/verify-package.mjs`）。iOSには最新Webアセットを同期済みです。Windows／iPhone実機の確認と配布用署名・公証は引き続き未実施です。

## macOS Tahoeを参考にしたUI改修

- 半透明のサイドバーをウィンドウ内側に配置し、検索・表示切替・追加操作を丸いツールバー部品に統一。
- 一覧、リスト、初回画面、メニュー、字幕／情報／削除ダイアログの角丸・余白・文字色を共通トークンで整理。
- 再生画面の下部にガラス調の操作領域を配置。映像と重ならず、縦横の画面サイズに合わせて伸縮。
- 設定を「表示」「再生」にグループ化。ライト／ダークの配色、OSの透明度低減・コントラスト増加・動きの低減設定に対応。
- Mac版ではOSのウィンドウボタンを使った統合タイトルバーを採用。上部をドラッグして移動でき、ボタンは通常操作できます。
- CSSの重複した旧デザインを統合し、狭い画面でのファイルメニューのはみ出しも修正。

Web／Electron上でTahoeのデザインを参考にした表現です。AppleのネイティブLiquid Glass APIによる描画ではありません。
参照: [Apple WWDC25 — Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)、[Apple HIG — Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)。

`npm run test:ui` でライト／ダーク、320・390・768・1440px幅、横向き再生、メニュー境界、ダイアログ、透明度低減時の不透明背景を確認します。既存のブラウザ・リピート・Electron実動画テストも成功しています。

## 文字サイズの仕様と適用

参照元は [Apple HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography) の「macOS built-in text styles」「iOS, iPadOS Dynamic Type sizes — Large (default)」です。

- Macの本文・設定項目・操作ラベル: Body 13、行高16。画面タイトル: Title 1 22／26。設定タイトル: Title 2 17／22。
- Macの補足: Callout 12／15を使用。最小許容サイズ10を通常の説明文には使用しません。複数行の日本語説明は読みやすさのため行間1.6に調整。
- コンパクト／タッチ画面: iOSの本文17／22、補足Callout 16／21、短いメタデータFootnote 13／18、タイトル28／34を基準にします。
- 固定pxによる文字指定を役割別のremトークンに置換。上記のネイティブpt値を、標準表示時のCSS論理サイズへ対応づけています。印刷用のCSS `pt` を指定しているわけではありません。
- 小さい画面で文字を縮小せず、設定のラベルと選択欄の縦積み、動画一覧の1列化、長い動画名の折り返しで対応。見出しの独自の負の字間指定も撤去。
- 検証では計算済みスタイルの本文13／17、設定タイトル17、文字200%時の本文26を確認し、ダイアログの横スクロールがないことと実画面の可読性を確認します。

これはWebの相対文字サイズ・折り返しへの対応です。iOSネイティブのDynamic Type連携を実装したものではありません。

## English-first cinema UI

UIの表示文言、アクセシビリティラベル、通知・エラー、ネイティブのファイル選択、日付表記を英語に統一しました。動画のファイル名と字幕の内容は変えません。

- [IINA](https://iina.io/) の映像を中心にした操作配置と、[Apple TV](https://www.apple.com/newsroom/2023/12/redesigned-apple-tv-app-elevates-the-viewing-experience/) のライブラリ／サイドバー構成を参考に、Videe独自の配色とレイアウトへ再構成。
- チャコール／アイボリーとコーラルのアクセント、簡潔なワードマーク、控えめな操作部に統一。
- 初回画面は元のVideeアイコンとOpen videoを中心に整理。仮のプレイヤー装飾は撤去しています。
- 直近動画の大型バナーは撤去。通常のサムネイルに残り時間を表示し、各動画のメニューからResumeできます。
- 通常の再生・字幕・リピート・検索・設定保存を維持。既存の外観設定も引き継ぎます。

ビルド、単体テスト11件、英語UIでの全画面・モバイル・字幕・リピート・ライブラリ操作・Electron変換を検証済みです。`npm run test:library` にはResumeカードとUI言語の検証を追加しました。

## 起動

Node.js 22.12以降が必要です。依存バージョンは `package-lock.json` に固定しています。

```sh
npm ci
npm run dev       # ブラウザで確認: http://127.0.0.1:5173
npm run desktop   # Windows / Macのデスクトップアプリ
```

npmのスクリプト実行制限によってランタイムが取得されなかった場合は、`npm rebuild electron ffmpeg-static` を実行してください。初回セットアップ時はダウンロードのためネット接続が必要です。アプリの通常利用に通信・アカウントは不要です。

## 実装した機能

- 複数動画の追加、ドラッグ＆ドロップ、端末内ライブラリ
- 実際の動画再生・一時停止・シーク・10秒スキップ・次の動画
- 再生速度 0.5〜2倍、音量、ミュート、リピート、次の動画の自動再生
- 再生履歴と続きから再生、お気に入り、検索（最近開いた動画を上に表示）
- 動画サムネイルの一覧と再生位置の表示
- SRT／WebVTT字幕の読み込み、表示切替
- 全画面表示、ピクチャ・イン・ピクチャ（利用可否は端末依存）
- キーボード操作: Space、左右矢印、F、M
- Windows／Mac: 通常再生できない動画をFFmpegでH.264 / AAC MP4へ変換。中止可能。元ファイルは変更しません。

## 対応範囲と未完了項目

これは実行可能な初期版であり、「この世の全形式」「全機能が完全に動作」を達成した製品版ではありません。拡張子が同じでも映像・音声コーデックにより再生可否が異なります。

Windows／MacはElectronの再生機能とFFmpegの変換機能を使用します。変換は最初の映像・音声トラックを対象とし、時間と追加ディスク容量が必要です。元動画のHDR、複数トラック、添付ファイル、埋め込み字幕などをすべて保持するものではありません。

iOSはCapacitor / WKWebViewで動作し、OSが対応する動画のみ再生します。iOS向けのFFmpeg／VLC／mpv統合は未実装です。DRM解除、破損ファイル修復、埋め込み字幕・複数音声の選択、ネットワークストリーム、AirPlay専用UI、バックグラウンド再生制御、クラウド同期は未実装です。iPhoneの音量調整は本体ボタンを使用してください。

Windows実機、iPhone実機、多様なコーデック・HDR・長時間／大容量動画の検証、および配布用署名・公証・App Store提出はまだ行っていません。

## 保存方法

デスクトップ版は元ファイルへの参照をアプリ用のライブラリに記録します。移動・削除されたファイルは再追加してください。変換結果はアプリのデータ領域内 `converted/` に保存します。ライブラリから削除すると変換キャッシュも削除しますが、元ファイルは削除しません。

ブラウザ／iOS版は選択した動画をIndexedDBに保存します。空き容量が足りないときは通知し、そのセッションでのみ再生できます。ストレージの削除・OSによる消去・アンインストールでアプリ内データは失われます。元ファイルをバックアップしてください。ブラウザとデスクトップのライブラリは別々です。

## アプリのビルド

```sh
npm run package:mac  # Mac上で実行。release/mac-*/Videe.app を作成
npm run package:win  # Windows上で実行。release/ にインストーラーを作成
npm run ios:sync     # iOSプロジェクトへUIを反映
npm run ios:open     # Xcodeで開く
npm run ios:build    # Mac + Xcode: iOSシミュレーター用の署名なしビルド
```

FFmpegバイナリがOS／CPU固有のため、各デスクトップ版は対象OSとCPU上で依存関係をインストールして作成します。iOS実機インストールにはXcodeで開発チーム・署名設定が必要です。iOSアプリアイコンにも提供画像を設定済みです。

## 検証

```sh
npm test
npm run build
npm run test:fixtures
npx playwright install chromium
# 別のターミナルで npm run dev を起動した上で:
npm run test:browser
npm run test:library
npm run test:playback
npm run test:desktop
```

ブラウザ検証は本物のMP4を用い、再生・シーク・字幕・検索・保存後の復元・削除・390px表示を確認します。デスクトップ検証は隔離した一時ライブラリにAVIを読み込み、FFmpeg変換と再生・シークを確認します。元のユーザーライブラリには触れません。テスト動画はFFmpegのテストパターンから生成します。

## この環境での検証結果

- TypeScript・本番ビルド: 成功
- 単体テスト: 11件成功（動画の部分読み込み、設定修復、リピート方針、アイコンを含む）
- Chromiumでの実再生・字幕・永続化・検索・削除・モバイル幅: 成功
- Mac / ElectronでのAVI変換・実再生・シーク・復元: 成功
- Mac arm64アプリのパッケージ作成: 成功（配布用署名・公証なし）
- 実行時依存関係: `npm audit --omit=dev` で既知の脆弱性0件
- iOS: `cap sync ios` 成功。Xcode 26.0.1の `IDESimulatorFoundation` とシステム側 `DVTDownloads` 間でシンボル不整合が発生し、ネイティブビルドは開始前に停止。アプリコードのコンパイル結果は未確認です。Xcode側の修復後に `npm run ios:build` で再検証してください。

## 主な構成

- `src/App.tsx`: プレイヤー、ライブラリ、設定
- `src/style.css`: レスポンシブUIとデザイントークン
- `src/store.ts`: IndexedDB保存
- `electron/`: 隔離されたデスクトップブリッジ、ローカル動画配信、FFmpeg変換
- `ios/`: iOSネイティブプロジェクト

デスクトップではNode.jsを画面から隔離し、選択済み動画を専用URL経由で配信します。外部ウィンドウと画面遷移を制限しています。

参照: [ElectronのContext Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、[Capacitor](https://capacitorjs.com/docs)、[FFmpeg](https://ffmpeg.org/documentation.html)。FFmpeg等の第三者ソフトウェアにはそれぞれのライセンスが適用されます。配布時は同梱バイナリのライセンス・ソース提供条件も満たす必要があります。

## Playback tools とサムネイルの整理

元のアプリアイコンをヘッダーにも復元し、アイコンファイル自体は変更していません。大型の直近動画バナーを撤去し、サムネイルは16:9の枠内で切り抜かずに表示します。

機能の参照元は [IINAの再生キュー](https://docs.iina.io/) と [VLCのA–B repeat](https://docs.videolan.me/vlc-user/android/3.X/en/video/video_player.html) です。再生画面のPlayback toolsから使用できます。

- Play queue: 再生開始時の表示順を確認し、任意の動画へ切り替え。
- A–B loop: 現在位置をA／Bに設定して区間を繰り返し。BはAより0.25秒以上後に指定。Clear loopで解除し、動画切り替え時も自動解除。HTML動画のtimeupdateを使うためフレーム単位の厳密な境界指定ではありません。
- Resume: 各動画のメニューから保存位置へ復帰。

検証: `npm run test:tools`、既存のUI・ライブラリ・リピートテスト。

### Library storage and interface refinement

- IndexedDB v2 separates video bytes from library metadata. Existing libraries migrate transactionally, preserving favorites and resume positions. Videos load on demand; progress updates only write metadata. Removing a library item also removes its stored media copy.
- The app uses system typography, a continuous sidebar, static uncropped previews and restrained controls. Original app icons remain unchanged. System Reduce Motion takes precedence over the app animation preference.
- `npm run test:storage` verifies legacy migration, resumed playback after reload, metadata-only writes and media deletion in Chromium.

### Icon export

The original opaque 1024px artwork remains the source for iOS and Apple touch icons, whose corners are masked by the OS. Legacy desktop ICNS/ICO and web `any` icons use an explicit rounded-square alpha mask, exported by `scripts/round-icon.swift`. No artwork is regenerated. `npm run icons:build` produces all sizes and checks corner/center alpha before packaging. The master uses a 32px inset and 210px corner radius; these are app-specific choices, not a claim to reproduce Icon Composer’s exact system curve. See [Apple App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons).

### Library organization and locks

- **Folders:** Create, rename and remove folders in **Organize**. Select cards and use **Destination → Add selected** to move them. Each video belongs to at most one folder; removing a folder keeps its videos. **Unfiled** shows videos outside folders.
- **Playlists:** Create a playlist, add selected videos, reorder with the up/down buttons, and choose **Play playlist**. The stored order becomes the playback queue; playlist order overrides library sorting.
- **Rename:** Select videos, enter a prefix and starting number, inspect **Preview names**, then **Apply rename**. The batch is committed atomically. **Auto rename on import** assigns persistent `Video 001` numbering. Extensions and original filenames are retained. These are library display names: source files and filesystem folders are not changed.
- **Thumbnails:** Compatible unplayed videos are scanned sequentially while browsing. Preview generation pauses when a video is opened. Unsupported sources retain a placeholder; normal playback can supply a preview later.
- **A–B loop:** Playback tools supports current-position markers and explicit start/end seconds, validates the range, and resets points when switching videos. Timing follows browser media events and is not frame-accurate.
- **Control lock:** The player padlock blocks on-screen controls, taps and app shortcuts without stopping playback. Choose **Unlock controls → Confirm unlock** to restore controls. OS media controls remain under system control.
- **Password lock:** Settings supports setup, change and removal with current-password verification. The library locks on launch and with **Lock now**. Password verification uses Web Crypto PBKDF2-SHA-256, a random 16-byte salt and 600,000 iterations; plaintext passwords are not stored. This is an app privacy screen, not encrypted media storage or protection against someone with filesystem/developer-tools access. There is no password recovery. Implementation reference: [MDN deriveBits](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits).
- `npm run test:organization` covers persisted folders, playlist ordering, renaming, previews, both locks and mobile layout with isolated test data.

Folder and playlist creation are available directly from the folder-plus and list-plus buttons, including before any video is imported. Saved collections appear as named icon buttons. Open a collection and choose **Add videos** to select from the entire library, even when that collection is empty. New imports are added to the currently open collection. Playback tools now contains an explicit **Lock screen** action in addition to the player padlock; **Screen locked** confirms the state. `npm run test:collections` checks these entry points end to end.
