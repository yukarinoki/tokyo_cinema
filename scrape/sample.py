import asyncio
from googletrans import Translator

async def translate_text(text):
    translator = Translator()
    # ここで translate() の返り値が coroutine の場合、await で待機します
    translation = await translator.translate(text, src='ja', dest='en')
    return translation.text

async def main():
    result = await translate_text("TOHOシネマズ六本木")
    print(result)  # 期待結果: "TOHO Cinemas Roppongi"

asyncio.run(main())
