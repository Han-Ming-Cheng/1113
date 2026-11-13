"""Embed the local rich-menu PNG in a downloadable static HTML asset."""
from base64 import b64encode
from pathlib import Path
root = Path(__file__).resolve().parents[1]
image = root / 'public' / 'line-richmenu-2500x843.png'
data = b64encode(image.read_bytes()).decode('ascii')
page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeHub 圖文選單下載</title><style>body{{font-family:system-ui,sans-serif;background:#f7f8f5;color:#314a38;max-width:900px;margin:35px auto;padding:20px}}img{{width:100%;height:auto;border-radius:16px}}a{{display:inline-block;background:#416b50;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;margin-top:18px}}</style></head><body><h1>LifeHub LINE 圖文選單</h1><p>2500 × 843 px PNG，三個點擊區域。</p><img id="preview" alt="生活管理、快速記錄、使用教學三格圖文選單"><p><a id="download" download="line-richmenu-2500x843.png">下載 PNG</a></p><script id="image-data" type="text/plain">{data}</script><script>const url='data:image/png;base64,'+document.getElementById('image-data').textContent;document.getElementById('preview').src=url;document.getElementById('download').href=url;</script></body></html>'''
(root / 'public' / 'menu.html').write_text(page, encoding='utf-8')
print('Wrote public/menu.html')
