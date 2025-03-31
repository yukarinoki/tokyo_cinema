import argparse
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.support.ui import  WebDriverWait
from selenium.webdriver.chrome.options import Options
import time

def toho_cinemas_scrape(theater_name, site_url):
    """
    TOHOシネマズの映画情報を取得する関数
    JavaScript実行後のページソースを取得して、映画の放映時間と映画名のレコードを抽出します。
    """
    # ヘッドレスモードでChromeを起動
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    # 必要に応じてパスなどを設定
    driver = webdriver.Chrome(options=chrome_options)

    # ページにアクセス
    driver.get(site_url)
    # JavaScriptの実行完了を待つ（適宜調整してください）
    wait = WebDriverWait(driver, 10)

    # ページソースを取得
    html = driver.page_source
    driver.quit()

    soup = BeautifulSoup(html, "html.parser")
    records = []

    # 例: 各映画情報が<section class="grid_main">内にあると仮定
    movie_items = soup.find_all("section", attrs={"class": "grid_main"})
    print("取得したmovie_items:", movie_items)
    for item in movie_items:
        # 映画名の取得（例: <span class="movie-title">タイトル</span>）
        title_elem = item.select_one(".movie-title")
        movie_title = title_elem.get_text(strip=True) if title_elem else "N/A"

        # 放映時間の取得（例: <span class="screening-time">時間</span>）
        time_elem = item.select_one(".screening-time")
        screening_time = time_elem.get_text(strip=True) if time_elem else "N/A"

        record = {"movie_title": movie_title, "screening_time": screening_time}
        records.append(record)
    
    return records



def scrape_movie_info(theater_name, site_url):
    """
    指定されたURLのページから、映画の放映時間と映画名のレコードを取得する
    ※ CSSセレクタは実際のサイトに合わせて調整してください
    """
    theater_series = get_theater_series(theater_name)

    if theater_series == TheaterSeries.TOHO:
        return toho_cinemas_scrape(theater_name, site_url)
    else: 
        raise ValueError("対応していない映画館のシリーズです。")
    

from enum import Enum
class TheaterSeries(Enum):
    TOHO = 1
    MOVIX = 2
    AEON = 3
    TJOI = 4
    UNITED = 5
    # 他の映画館の色を追加する場合はここに追加
    

def get_theater_series(theater_name):
    if "TOHOシネマズ" in theater_name:
        return TheaterSeries.TOHO
    elif theater_name.contains("MOVIX"):
        return TheaterSeries.MOVIX
    elif theater_name.contains("イオンシネマ"):
        return TheaterSeries.AEON
    elif theater_name.contains("ジョイ"):
        return TheaterSeries.TJOI
    elif theater_name.contains("ユナイテッド"):
        return TheaterSeries.UNITED
    else:
        raise ValueError("対応していない映画館名です。")

def main():
    parser = argparse.ArgumentParser(
        description="映画館の名前とサイトのアドレスから、映画の放映時間と映画名の組み合わせを取得して表示するプログラム"
    )
    parser.add_argument("theater_name", help="映画館の名前")
    parser.add_argument("site_url", help="映画館のサイトのアドレス")
    args = parser.parse_args()

    print(f"映画館名: {args.theater_name}")
    print(f"サイトURL: {args.site_url}")

    try:
        records = scrape_movie_info(args.theater_name, args.site_url)
        if records:
            print("取得したレコード:")
            for record in records:
                print(record)
        else:
            print("映画情報が見つかりませんでした。")
    except Exception as e:
        print("スクレイピング中にエラーが発生しました:", e)

if __name__ == "__main__":
    main()
