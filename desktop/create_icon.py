from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root=Path(__file__).resolve().parents[1]
size=512
image=Image.new("RGBA",(size,size),(6,6,27,255))
glow=Image.new("RGBA",(size,size),(0,0,0,0))
draw=ImageDraw.Draw(glow,"RGBA")
draw.ellipse((62,62,450,450),fill=(112,75,210,70))
glow=glow.filter(ImageFilter.GaussianBlur(45))
image.alpha_composite(glow)
flower=Image.open(root/"public"/"flowers"/"anemone.png").convert("RGBA")
scale=360/flower.width
flower=flower.resize((360,int(flower.height*scale)),Image.Resampling.LANCZOS)
image.alpha_composite(flower,((size-flower.width)//2,(size-flower.height)//2))
draw=ImageDraw.Draw(image,"RGBA")
draw.ellipse((28,28,484,484),outline=(205,192,244,150),width=4)
draw.ellipse((211,211,301,301),fill=(7,7,28,170),outline=(230,220,255,200),width=3)
draw.line((229,256,283,256),fill=(236,228,255,220),width=4)
draw.line((236,238,276,274),fill=(236,228,255,220),width=4)
draw.line((236,274,276,238),fill=(236,228,255,220),width=4)
output=root/"desktop"/"cosmic-aquarium.ico"
image.save(output,format="ICO",sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
print(output)
