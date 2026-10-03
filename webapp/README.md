# Tokyo Cinema — 今から間に合う上映

出発地・徒歩／自転車／公共交通・到着余裕（既定10分）を指定し、今から24時間以内の上映を映画館横断で開始順に表示するReact/TypeScriptアプリです。

## 起動

Node.js 22以上、Python 3.10以上、requests、beautifulsoup4が必要です。

```powershell
cd C:\path\to\tokyo_cinema
python -m pip install requests beautifulsoup4
python scrape/verified_tokyo.py
cd webapp
npm install
npm run build
npm run server
```

**ホストPC上の** http://localhost:3001 を開きます。サーバーは127.0.0.1だけで待ち受けます。開発時は別ターミナルで `npm start`（3000番、APIは3001番へ転送）を使用できます。

Tailscale経由で利用する場合は、利用者が明示的に許可した待受アドレスとプレビューOriginを設定します。

## 現在の実データと更新

公式の公開HTMLと、公開サイト自身が使用するJSONから取得します。対象台帳は `scrape/theaters_tokyo.json`（東京都内の主要チェーン40施設／錦糸町2拠点を分けて41館）。TOHO、イオン、109、ユナイテッド、松竹、シネマサンシャイン、HUMAX、T・ジョイに対応しています。館の位置は既存台帳・公式アクセスページ・公開地図を使い、出典を台帳に保存しています。

同一ホスト2.5秒間隔、同じ更新中のURLキャッシュ、robots.txt確認を行います。ログイン、チケット操作、bot検出回避はありません。robotsの4xxはRFC 9309 §2.3.1.3に従い未提供として扱いますが、429・5xx・上映ページ自身の拒否／異常は停止します。TOHO・AEONの公開サイト使用APIも同じ方針です。

上映日を明示したデータのみ取得し、各上映の取得元・本編尺の取得元を保持します。24:xx〜29:xxは営業日の翌日です。古い日付を今日に置き換えません。日付を証明できない上映は除外するため、公式サイトより少ない場合があります。空席は保証しません。

`python scrape/verified_tokyo.py` で更新します。30分以内のfeedなら通信を省略し、`--force` は明示的な再取得です。通常の検索では古いfeedの更新をバックグラウンドで開始し、直前の確認済みデータで応答します。更新中は共有し、30分以内の繰り返し取得を避けます。全館失敗なら前のfeedを保持します。一部失敗は成功館だけを公開し、`coverage_latest.json`・画面・`/api/status` で明示します。36時間以上古い情報は検索から除外します。

初回収集は低頻度の公開アクセスのため数分かかります。`movie_schedules_latest.json` の空配列はサンプル上映ではありません。初回取得が完了するまで空状態を表示します。従来のユーザー編集済みスクレイパーは保持し、現在のデータ経路は `verified_tokyo.py` です。

## 出発期限と本編開始の推定

出発期限の目安は「公式上映開始 − 経路所要時間 − 指定の到着余裕」。画面で残り分数が更新され、期限を過ぎたら再検索を促します。経路確認中に経過した時間も保守的に加味します。電車の発車時刻や道路状況は変わるため、遅い出発でも同じ経路を使える保証はありません。

本編開始は、同じ上映版の公式本編尺と終了予定が揃う場合だけ「終了予定 − 本編尺」で推定します。尺が欠ける、終了予定がない、不整合がある、イベント等で単純計算できない場合は算出不可です。広告や休憩、終映時刻の誤差を含みます。推定本編開始で到着条件を緩めず、必ず公式開始に間に合う条件を使います。

## 徒歩・自転車：APIキーなしで利用可能

[FOSSGIS / OpenStreetMap の公開OSRM](https://routing.openstreetmap.de/about.html) の実際のfoot / bikeプロファイルを使用します。直線距離ではなく道路上の経路と所要時間です。所要時間自体は目安で、現在の通行規制等を保証しません。

利用方針に沿って、識別可能なUser-Agent、全要求共通の1.1秒間隔、同時重複の統合、10分キャッシュ、1検索あたり最大10館の公開経路要求を実装しています。日をまたぐ同じ映画館は統合し、出発地に直線距離で近い10館を選びます。未検索の館を画面に明示し、「検索対象の映画館名」で遠方の館も指定できます。概算を許可した場合だけ残りの館を概算します。ローカルでの少量・対話的利用が対象です。大量利用や公開運用には自前サービスが必要です。地図の帰属表示と「地図を修正」リンクを表示しています。位置座標はFOSSGISへ送られます。

ユーザーが明示的に許可した場合のみ、経路取得失敗時に直線距離×1.4、徒歩4.5km/h／自転車12km/hの「概算」に戻ります。公共交通には使いません。

## 公共交通：残る必須条件

リポジトリの環境ファイルには従来の検索用 `GOOGLE_API_KEY` が存在しますが、Routes APIへの利用許可は不明のため流用していません。`GOOGLE_ROUTES_API_KEY` や既存のtransit/OTP/NAVITIME設定はありません。

Google Routesアダプターは実装済みです。利用するには、**すでに承認済みのRoutes APIプロジェクト／サーバー用キー、必要なAPI有効化・割当、課金対象リクエストへの許可、対象の東京経路が返ることの確認**が必要です。サーバーの `GOOGLE_ROUTES_API_KEY` に設定した場合に使用します。キーをブラウザーには送りません。資格情報設定・API購入・課金リクエストは行っていません。地域対応はキーがあっても保証できず、経路なしは正直に除外します。

無料で登録不要な、東京の列車を網羅する実用的な公開transit APIは確認できませんでした。OSRMのfoot/bikeは列車非対応です。[OpenTripPlanner](https://www.opentripplanner.org/) は無償ソフトウェアの選択肢ですが、別途サーバーと最新の利用許諾済みGTFS/OSMデータが必要で、既成の無料東京経路サービスではありません。[ODPT](https://ckan.odpt.org/) のデータもそのまま経路APIになるわけではありません。

## 位置情報と状態

現在地の取得は明示的なボタン操作のみ。拒否・非対応・タイムアウトは手入力へ案内します。主要6駅と「緯度, 経度」は通信なしで選択可能です。住所はNominatimに手動検索し、候補から選択します（自動補完なし、1.1秒間隔、キャッシュ）。
結果はフォーム変更で破棄、古い非同期応答は無視、検索から2分で再確認を要求します。表示時刻はブラウザーのタイムゾーンに関係なくJSTです。

## 独自feedと設定

`SHOWTIMES_FILE` を指定した場合、自動collectorは動かさず、そのファイルを毎回読みます。契約は `theater_name`, 数値座標, `schedule_date`, タイムゾーンつき `verified_at`, HTTPS `source_url`, `movies:[{title,showtimes}]`。showtimesは開始時刻文字列、[開始,終了]ペア、または `{start,end,runtime_minutes,screen,source_data_url,runtime_source_url}` オブジェクトです。

`node server/publish.cjs <verified-feed.json>` は検証済みfeedを原子的に公開します。古い／未確認データは拒否します。
環境変数 `DISABLE_PUBLIC_ROUTING=1` / `DISABLE_SHOWTIME_REFRESH=1` はテスト・オフライン用。`PYTHON_EXECUTABLE` でPythonのパスを指定できます。`.env.example` は説明用で自動読込しません。

## 検証

```powershell
python -m unittest discover -s scrape -p "test_*.py"
cd webapp
npm run typecheck
node node_modules/eslint/bin/eslint.js src --ext .ts,.tsx
npm run test:server
npm run build
node tests/ui.cjs
```

Pythonの従来テストはrootの依存に加えpython-dotenvを必要とします。今回、不足していたpython-dotenvはタスク用ディレクトリへ分離導入し、既存環境の変更を避けました。title_normalizeの既存enumインターフェイスを保持し、normalize_titleは複数形式の配列を返すよう契約を整理しました。

ChromeテストはPlaywrightが必要です。外部インストールの場合は `PLAYWRIGHT_MODULE` にその絶対パスを指定します。3001番プレビュー起動中に実行してください。3101番に独立fixtureサーバーを作り、テスト終了時に停止します。fixture作品にはTESTを付け、実feedは書き換えません。

テストは公式HTML／JSONの構造、明示日付、JST深夜、尺の欠落・不整合、全件失敗時のfeed保護、一部失敗、経路の待ち時間、近い10館の選択、位置情報拒否、繰り返し検索、出発期限経過、モバイル表示を検証します。実取得・実経路の結果件数は時刻で変化します。未設定の公共交通は架空結果を返しません。画面記録は `test-results/`（git対象外）に保存します。

主要ファイル：`src/App.tsx`, `server/core.cjs`, `server/index.cjs`, `server/public-routing.cjs`, `scrape/verified_tokyo.py`, `scrape/adapters_*.py`, `scrape/theaters_tokyo.json`。

検索ボタンの前に、出発地・目的地の座標をFOSSGISへ送信しサービス側で記録される旨を表示。利用条件と公式プライバシーへのリンク、aria-describedbyを追加し、ブラウザーテストで表示・順序・リンク先を検証しています。

## 許可済みTailscaleプレビューの再起動

```powershell
cd C:\path\to\tokyo_cinema\webapp
$env:HOST="0.0.0.0"
$env:PREVIEW_ORIGINS="http://YOUR_TAILSCALE_IP:3001,http://YOUR_TAILSCALE_HOSTNAME:3001"
npm run server
```

URL: http://YOUR_TAILSCALE_IP:3001 または http://YOUR_TAILSCALE_HOSTNAME:3001 。ホストPC上のChromeから両方のHTTP 200・検索API・手入力検索を検証しています。実iPhoneからの通信は未検証です。HTTPではブラウザーの現在地取得に制限があるため、駅名・住所・座標を手入力してください。画面にもHTTPSが必要な旨を表示します。

`tests/tailscale.cjs <URL>...` は公開の新宿駅座標でHTTP経由の手入力と非HTTPS時の位置取得案内を検証します。

## 統合検証スナップショット（2026-10-03 JST）

公式41拠点すべて成功、10/3–4計3,571上映。確認時の次24時間は1,852上映、本編開始推定1,604／尺不明等248。取得件数は時刻で変化します。Python32件、Node11件、TypeScript・ESLint・production build、Chrome21シナリオ成功。Chromeは実feed徒歩／自転車も検証し、架空の電車結果は返しません。Browserslistデータの古さの警告のみ残ります。

`SKIP_LIVE_UI=1` を設定すると `tests/ui.cjs` の公開経路への実通信を省略し、独立fixtureの18シナリオのみ実行します。実iPhoneそのものからの接続は未検証です。

## tokyo cinema の作品画像と観た登録

タイトル・タブ・ホーム画面名を `tokyo cinema` に統一。暗い背景と、読み込み済みの公式画像そのものをぼかしたambient lightを使います。Canvasの画素読取りや画像プロキシは使わず、CORS制限を回避しません。元画像は切り抜かず、縦横比を維持し、遅延読込・失敗時の代替表示・出典リンクを備えます。画像ファイルはリポジトリへ保存しません。

私的プレビューで、利用条件の個人利用例外を確認した松竹・T・ジョイの画像のみ表示します。TOHOも有効な公式画像URLが提供された場合に対応しますが、確認時の上映APIの画像欄は空でした。AEON・109・HUMAX・Sunshine・Unitedは再利用条件を満たす根拠が不足するため画像なしとし、勝手な画像パスや別作品画像で補いません。各上映の同じ公式作品ID／DOM作品ブロックにある画像だけを結びつけます。`DISABLE_PERSONAL_ARTWORK=1` で全画像を無効化できます。公開配信の画像利用許諾を取得したものではありません。

根拠： [松竹](https://www.smt-cinema.com/aboutsite/) / [T・ジョイ](https://tjoy.jp/about_company/sitepolicy_foot) / [TOHO](https://www.tohotheater.jp/info/help.html) / [AEON](https://www.aeoncinema.com/sitepolicy/) / [109が参照する条件](https://www.tokyu-rec.co.jp/company/sitepolicy/) / [HUMAX](https://humax-cinema.co.jp/sitepolicy/) / [Sunshine](https://www.cinemasunshine.co.jp/sitepolicy/)。画像は公式配信元からブラウザーで直接読み込みます。

「＋ 観た」で作品を登録し、「観た映画を非表示」で同じ作品の上映をまとめて除外します。登録一覧で解除でき、直前の操作は「元に戻す」で取り消せます。字幕・吹替・IMAX等の表示用ラベルだけを除いた正式タイトルを使い、続編・別編集版・明記された公開年を保ちます。省略タイトルは系列の作品IDに限定し、不確かな系列間の同一視を行いません。画像はこのタイトル照合では共有しません。

保存先は `localStorage` の `tokyo-cinema:watched:v1`。アカウント同期やサーバー送信はなく、同じブラウザー・同じURLのオリジンで有効です（IPとホスト名のURLは別保存）。保存禁止・容量不足時は画面内だけで動作して案内を表示し、不正な保存値でもアプリを止めません。

`node tests/watched.cjs` は3102番の独立fixtureで観た登録・映画館横断・解除・undo・reload・保存拒否・不正保存値・絞込・繰返し・画像成功／失敗・遅延読込・320/390/768/1280px・reduced motionを検証します。公式ドメインのテスト画像要求はローカルTEST画像で置換し、外部通信・現在地取得を禁止します。従来の21 UIシナリオも維持します。

今回の確認：Python41件、Node19件、既存Chrome21シナリオ＋観た／画像17チェック、TypeScript・ESLint・build成功。新宿駅の固定座標だけで実際の公式ポスター読み込みとambient lightを確認し、Tailscale両URLもHTTP/API/手入力検索200でした。現在地は取得・送信していません。実iPhone端末からの確認は未実施です。画像・スクリーンショット・取得feedは今回のcommitに含めません。
