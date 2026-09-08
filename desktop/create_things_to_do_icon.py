from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = Path(__file__).resolve().parents[1]
size = 512
image = Image.new("RGBA", (size, size), (31, 13, 6, 255))
glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
ImageDraw.Draw(glow, "RGBA").ellipse((48, 48, 464, 464), fill=(211, 137, 49, 105))
image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(50)))
draw = ImageDraw.Draw(image, "RGBA")
for inset, colour, width in ((22, (234, 181, 91, 240), 10), (48, (89, 48, 21, 255), 7), (70, (204, 132, 47, 230), 4)):
    draw.rounded_rectangle((inset, inset, size-inset, size-inset), radius=62, outline=colour, width=width)
draw.rounded_rectangle((94, 102, 418, 410), radius=42, fill=(14, 12, 9, 245), outline=(231, 180, 91, 220), width=5)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 172)
except OSError:
    font = ImageFont.load_default()
bounds = draw.textbbox((0, 0), "DO", font=font)
draw.text(((size-(bounds[2]-bounds[0]))/2, 156-bounds[1]), "DO", font=font, fill=(246, 221, 171, 255), stroke_width=2, stroke_fill=(82, 41, 15, 255))
output = root / "desktop" / "things-to-do-machine.ico"
image.save(output, format="ICO", sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
print(output)
