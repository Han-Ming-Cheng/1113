from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
W,H=2500,843
img=Image.new('RGB',(W,H),'#eaf0e9'); d=ImageDraw.Draw(img)
colors=['#e8efe5','#f2ede2','#e7eef0']; ink='#36513f'; muted='#75877a'
for i in range(3):
    x=i*W//3; end=(i+1)*W//3
    d.rectangle((x,0,end,H),fill=colors[i])
    if i: d.line((x,90,x,H-90),fill='#d4dfd4',width=3)
    # decorative round symbol medallion
    cx=x+120;cy=140
    d.rounded_rectangle((cx,cy,cx+130,cy+130),radius=40,fill='#ffffff')
    font_path='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
    try:
      symbol=ImageFont.truetype(font_path,72); title=ImageFont.truetype(font_path,61); small=ImageFont.truetype(font_path,28)
    except OSError:
      symbol=title=small=ImageFont.load_default()
    symbols=['✳','＋','？']; titles=['生活管理','快速記錄','使用教學']; desc=['打開五合一生活工具','LINE 對話框直接記錄','看操作步驟與常見問題']
    d.text((cx+31,cy+22),symbols[i],font=symbol,fill='#63866a')
    d.text((x+120,370),titles[i],font=title,fill=ink)
    d.text((x+122,485),desc[i],font=small,fill=muted)
    d.rounded_rectangle((x+120,585,x+530,660),radius=28,fill='#416b50')
    d.text((x+155,604),'LIFEHUB　→',font=small,fill='#ffffff')
# bottom rule
out=Path(__file__).resolve().parents[1]/'public'/'line-richmenu-2500x843.png'
img.save(out,optimize=True)
print(f'Wrote {out} ({W}x{H})')
