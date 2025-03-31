from googlesearch import search
import requests

def get_place_details(api_key, place_name):
    # まず、findplacefromtext エンドポイントで候補を検索
    search_url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    search_params = {
        "input": place_name,
        "inputtype": "textquery",
        "fields": "place_id",
        "key": api_key
    }
    search_response = requests.get(search_url, params=search_params)
    search_data = search_response.json()
    
    if not search_data.get("candidates"):
        print("候補が見つかりませんでした。")
        return None
    
    place_id = search_data["candidates"][0]["place_id"]
    
    # 次に、place/details エンドポイントで詳細情報を取得
    details_url = "https://maps.googleapis.com/maps/api/place/details/json"
    details_params = {
        "place_id": place_id,
        "fields": "name,formatted_address,geometry",
        "key": api_key
    }
    details_response = requests.get(details_url, params=details_params)
    details_data = details_response.json()
    
    return details_data

def get_top_google_result(query):
    # num=1, stop=1 で最初の結果のみ取得
    results = list(search(query, num=1, stop=1, pause=2))
    return results[0] if results else None

if __name__ == "__main__":
    query = "Python programming"  # 任意の検索ワードに変更してください
    top_link = get_top_google_result(query)
    if top_link:
        print("Top result link:", top_link)
    else:
        print("No result found.")


if __name__ == "__main__":
    # ご自身のAPIキーを設定してください
    API_KEY = "AIzaSyC28ybVekZub9sj8maN8IQ0TKybMKmyN_g"
    place_name = "TOHOシネマズ六本木"  # 検索したい映画館名など
    
    details = get_place_details(API_KEY, place_name)
    if details:
        result = details.get("result", {})
        name = result.get("name")
        address = result.get("formatted_address")
        location = result.get("geometry", {}).get("location", {})
        print(f"Name: {name}")
        print(f"Address: {address}")
        print(f"Location: {location}")
    else:
        print("詳細情報が取得できませんでした。")
