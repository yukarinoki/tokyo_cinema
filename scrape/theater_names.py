import requests
from bs4 import BeautifulSoup
import csv
from geopy.geocoders import Nominatim
import asyncio
from googletrans import Translator

async def translate_text(text):
    translator = Translator()
    # ここで translate() の返り値が coroutine の場合、await で待機します
    translation = await translator.translate(text, src='ja', dest='en')
    return translation.text

def get_theater_location(theater_name):
    # user_agentは任意の文字列に設定してください
    geolocator = Nominatim(user_agent="movie_theater_locator")
    location = geolocator.geocode(theater_name)
    return location

def convert_to_alphabet(jp_string):
    # 変換ルールのリスト（置換前, 置換後）
    replacements = [
        ("TOHOシネマズ", "TOHO Cinemas "),
        ("六本木", "Roppongi"),
        # 必要に応じて追加の置換ルールを定義できます
    ]
    
    # 定義された順に文字列を置換する
    for old, new in replacements:
        jp_string = jp_string.replace(old, new)
    
    # 余分な空白があれば削除
    return jp_string.strip()

# 対象のURL
url = "https://movie.jorudan.co.jp/theater/tokyo/"

# ページを取得
response = requests.get(url)
response.raise_for_status()  # エラーがあれば例外を発生させる

# BeautifulSoupでHTMLを解析
soup = BeautifulSoup(response.content, "html.parser")

# CSSセレクタで指定のul要素を取得
ul_element = soup.select_one("#site-contents > main > ul")

if ul_element:
    # ul内の全てのli要素を取得
    li_elements = ul_element.find_all("li")
    

    with open("theater_names.csv", "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["theater_name"])  # ヘッダー行を書き込む

        # 各li要素のテキストを表示
        for li in li_elements:
            # theater_name = li.get_text(strip=True).replace("東京その他", "/").split("/")[-1]
            theater_name = li.find("img").get("alt")
            theater_name_en = asyncio.run(translate_text(theater_name))
            print(theater_name) 
            print(theater_name_en)
            location = get_theater_location(theater_name_en)
            if location is None:
                location = get_theater_location(theater_name)
                if location is None:
                    writer.writerow([theater_name, theater_name_en])  # 各劇場名を書き込む
                    continue
            print(location)
            writer.writerow([theater_name, theater_name_en, location.address, location.latitude, location.longitude])  # 各劇場名を書き込む

else:
    print("指定したul要素が見つかりませんでした。")
