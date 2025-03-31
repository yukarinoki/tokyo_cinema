from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# ヘッドレスモードを使わずに実行してみる
chrome_options = Options()
# chrome_options.add_argument("--headless")  # コメントアウト

# ChromeDriverのパスを指定する場合は、executable_pathパラメータを使います
driver = webdriver.Chrome(options=chrome_options)

driver.get("https://www.google.com")
print("Page Title:", driver.title)

driver.quit()
