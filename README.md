# 東京映画館スケジュールファインダー (Tokyo Cinema Schedule Finder)

## 現在の起動方法（2026-10）

所在地・徒歩／自転車／公共交通・到着余裕から、今から24時間以内に間に合う上映を全館横断で開始順に探します。主要チェーン40施設／41拠点の公式データに対応し、出発期限と条件付きの本編開始推定を表示します。公共交通は承認済みRoutes API設定が別途必要です。

```powershell
python -m pip install requests beautifulsoup4
python scrape/verified_tokyo.py
cd webapp
npm install
npm run build
npm run server
```

http://localhost:3001 を開いてください。初回取得は数分かかります。対応館・データの限界・更新・経路・Tailscale・テストは **[webapp/README.md](webapp/README.md)** を参照してください。

以下は旧スクレイパーの資料です。既存コードは保持していますが、現在のアプリは `verified_tokyo.py` の日付確認済みfeedを使います。


このプロジェクトは、東京の映画館の上映スケジュールを取得し、ユーザーの現在位置から最も近い映画館の映画を表示するアプリケーションです。

## プロジェクト構成

プロジェクトは2つの主要部分から構成されています：

1. **Python スクレイピングスクリプト** - 映画館の上映スケジュールを取得してJSONファイルに保存します
2. **TypeScript Webアプリケーション** - ユーザーの現在位置から映画館までの距離を計算し、最も近い映画館から順に映画を表示します

## Python スクレイピングスクリプト

`scrape/movie_scraper.py` は、`theater_names.csv` に記載されている東京の映画館から上映スケジュールを取得します。

### 機能

- 映画館のウェブサイトから映画のタイトルと上映時間を取得
- 映画館の種類（TOHOシネマズなど）に基づいて適切なスクレイピング方法を選択
- 結果をJSON形式で保存

### 使用方法

```bash
# すべての映画館のスケジュールを取得
python scrape/movie_scraper.py

# スクレイピングする映画館の数を制限
python scrape/movie_scraper.py --limit 5

# 特定の映画館のみスクレイピング
python scrape/movie_scraper.py --theater "TOHOシネマズ新宿"
```

## TypeScript Webアプリケーション

`webapp/` ディレクトリには、React TypeScriptで作成されたWebアプリケーションが含まれています。

### 機能

- ユーザーの現在位置を取得
- 映画館までの距離を計算
- 映画を距離順に表示
- 映画館の位置を地図上に表示
- 映画名または映画館名での検索機能

### 開発環境のセットアップ

```bash
cd webapp
npm install
npm start
```

### ビルド方法

```bash
cd webapp
npm run build
```

## データフロー

1. Python スクリプトが映画館のウェブサイトから上映スケジュールを取得
2. スクレイピングしたデータは `data/movie_schedules_YYYYMMDD.json` に保存
3. Webアプリケーションがこのデータを読み込み、ユーザーの現在位置からの距離を計算
4. 映画は距離順に表示され、ユーザーは映画名や映画館名で検索可能

## 必要条件

### Python スクリプト

- Python 3.8以上
- 必要なパッケージ: requests, beautifulsoup4, selenium, webdriver-manager

### Webアプリケーション

- Node.js 14以上
- npm 6以上

## 定期実行の設定

映画のスケジュールを毎日更新するには、以下のようにcronジョブを設定します：

```bash
# 毎日午前1時にスクリプトを実行
0 1 * * * cd /path/to/project && python scrape/movie_scraper.py


## 今から間に合う上映の検索

新しいローカルAPI・検索画面の起動と、確認済み上映データ／経路サービスの設定は [webapp/README.md](webapp/README.md) を参照してください。既存の古いサンプルは現在の上映として表示されません。
