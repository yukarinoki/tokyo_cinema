# Tokyo Cinema — 今から間に合う上映

出発地・徒歩／自転車／公共交通・到着余裕（既定10分）を指定し、今から24時間以内の上映を映画館横断で開始順に表示するReact/TypeScriptアプリです。

## 起動

Node.js 22以上、Python 3.10以上、requests、beautifulsoup4が必要です。

```powershell
cd C:\path\to\tokyo_cinema
python -m pip install requests beautifulsoup4
python scrape/verified_tjoy.py
cd webapp
npm install
npm run build
npm run server
```

**ホストPC上の** http://localhost:3001 を開きます。サーバーは127.0.0.1だけで待ち受けます。開発時は別ターミナルで `npm start`（3000番、APIは3001番へ転送）を使用できます。

Tailscale経由で利用する場合は、利用者が明示的に許可した待受アドレスとプレビューOriginを設定します。

## 現在の実データと更新

公式の公開HTMLを3秒間隔で読み取ります。ログイン、検索API、チケット操作、bot検出回避は使用しません。robots.txtを確認し、拒否・異常ページ・日付なし・解析失敗を通過させません。

対象：
- [新宿バルト9](https://tjoy.jp/shinjuku_wald9)
- [T・ジョイPRINCE品川](https://tjoy.jp/tjoy-prince-shinagawa)
- [T・ジョイSEIBU大泉](https://tjoy.jp/t-joy_seibu_oizumi)

2026-10-03 JST取得：190件の日付つき上映（将来のイベントを含む）、うち今から24時間以内178件。東京全館を網羅していないことを画面にも表示します。

各上映の公開予約リンクにある上映日と開始時刻を抽出します。終了時刻は開始として扱いません。公式ページURL、取得日時、選択日、HTMLのSHA-256、collectorバージョンを保存します。24:xx〜29:xxは営業日の翌日です。古い日付を今日に置き換えません。

`python scrape/verified_tjoy.py` で更新できます。30分以内のfeedならネットワーク要求を省略します。通常のアプリ検索時もfeedが30分以上古ければ自動更新します。更新は1件ずつ共有し、失敗後は5分間再試行しません。全件失敗なら既存feedを保持し、36時間以上古い情報は検索結果から除外します。取得したデータは原子的に公開します。

空席は保証せず、公式サイトへの確認リンクを表示します。従来のユーザー編集済みスクレイパーは残していますが、現在の本番データ経路は `verified_tjoy.py` です。

## 徒歩・自転車：APIキーなしで利用可能

[FOSSGIS / OpenStreetMap の公開OSRM](https://routing.openstreetmap.de/about.html) の実際のfoot / bikeプロファイルを使用します。直線距離ではなく道路上の経路と所要時間です。所要時間自体は目安で、現在の通行規制等を保証しません。

利用方針に沿って、識別可能なUser-Agent、全要求共通の1.1秒間隔、同時重複の統合、10分キャッシュ、1検索あたり最大10件の公開経路要求を実装しています。ローカルでの少量・対話的利用が対象です。大量利用や公開運用には自前サービスが必要です。地図の帰属表示と「地図を修正」リンクを表示しています。位置座標はFOSSGISへ送られます。

ユーザーが明示的に許可した場合のみ、経路取得失敗時に直線距離×1.4、徒歩4.5km/h／自転車12km/hの「概算」に戻ります。公共交通には使いません。

## 公共交通：残る必須条件

リポジトリの環境ファイルには従来の検索用 `GOOGLE_API_KEY` が存在しますが、Routes APIへの利用許可は不明のため流用していません。`GOOGLE_ROUTES_API_KEY` や既存のtransit/OTP/NAVITIME設定はありません。

Google Routesアダプターは実装済みです。利用するには、**すでに承認済みのRoutes APIプロジェクト／サーバー用キー、必要なAPI有効化・割当、課金対象リクエストへの許可、対象の東京経路が返ることの確認**が必要です。サーバーの `GOOGLE_ROUTES_API_KEY` に設定した場合に使用します。キーをブラウザーには送りません。資格情報設定・API購入・課金リクエストは行っていません。地域対応はキーがあっても保証できず、経路なしは正直に除外します。

無料で登録不要な、東京の列車を網羅する実用的な公開transit APIは確認できませんでした。OSRMのfoot/bikeは列車非対応です。[OpenTripPlanner](https://www.opentripplanner.org/) は無償ソフトウェアの選択肢ですが、別途サーバーと最新の利用許諾済みGTFS/OSMデータが必要で、既成の無料東京経路サービスではありません。[ODPT](https://ckan.odpt.org/) のデータもそのまま経路APIになるわけではありません。

## 位置情報と状態

現在地の取得は明示的なボタン操作のみ。拒否・非対応・タイムアウトは手入力へ案内します。主要6駅と「緯度, 経度」は通信なしで選択可能です。住所はNominatimに手動検索し、候補から選択します（自動補完なし、1.1秒間隔、キャッシュ）。
結果はフォーム変更で破棄、古い非同期応答は無視、検索から2分で再確認を要求します。表示時刻はブラウザーのタイムゾーンに関係なくJSTです。

## 独自feedと設定

`SHOWTIMES_FILE` を指定した場合、自動collectorは動かさず、そのファイルを毎回読みます。契約は `theater_name`, 数値座標, `schedule_date`, タイムゾーンつき `verified_at`, HTTPS `source_url`, `movies:[{title,showtimes}]`。showtimesは開始時刻文字列または[開始,終了]ペアです。

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

最終検証：
- Python：15件成功（既存12件＋日付／provenance／従来互換）
- Node：7件成功（日付、到着余裕、transit待ち、入力・障害、公開経路profile/cache/rate）
- TypeScript / ESLint / production build：成功。Browserslistの古いデータ警告のみ
- Chrome：17シナリオ成功（拒否・非対応・手入力・繰返し・絞込・API障害・古い応答・失効・390pxモバイル・Pacific timezone・実feed徒歩/自転車）
- 実住所検索：HTTP 200、Shinjuku Station 5候補
- 実検索：新宿駅、到着余裕10分、概算オフで徒歩174件／自転車178件、3館。公共交通は未設定3館除外、架空結果なし
- screenshots: `test-results/`（git対象外）

主要ファイル：`src/App.tsx`, `server/core.cjs`, `server/index.cjs`, `server/public-routing.cjs`, `scrape/verified_tjoy.py`。


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
