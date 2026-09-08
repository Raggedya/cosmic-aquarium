from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


root = Path(__file__).resolve().parents[1]
size = 512
image = Image.new("RGBA", (size, size), (3, 18, 14, 255))
glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow, "RGBA")
glow_draw.ellipse((55, 55, 457, 457), fill=(210, 151, 54, 105))
image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(52)))

draw = ImageDraw.Draw(image, "RGBA")
for inset, colour, width in (
    (24, (242, 202, 120, 235), 9),
    (45, (108, 70, 24, 255), 6),
    (65, (222, 171, 79, 220), 4),
):
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=82, outline=colour, width=width)
draw.rounded_rectangle((96, 102, 416, 410), radius=56, fill=(4, 42, 31, 245), outline=(232, 190, 105, 220), width=5)

try:
    font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 238)
except OSError:
    font = ImageFont.load_default()
bounds = draw.textbbox((0, 0), "F", font=font)
draw.text(((size - (bounds[2] - bounds[0])) / 2, 116 - bounds[1]), "F", font=font, fill=(246, 224, 172, 255), stroke_width=3, stroke_fill=(91, 55, 17, 255))

output = root / "desktop" / "festivals.ico"
image.save(output, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print(output)
