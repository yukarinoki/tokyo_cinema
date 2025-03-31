# 東京映画館スケジュールファインダー (Tokyo Cinema Schedule Finder)

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
