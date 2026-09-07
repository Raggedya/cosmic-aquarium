from pathlib import Path

from PIL import Image, ImageDraw


target = Path(__file__).with_name("artist-machine-factory.ico")
size = 256
image = Image.new("RGBA", (size, size), "#100906")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((18, 18, 238, 238), radius=46, fill="#26130d", outline="#b98439", width=12)
draw.ellipse((47, 47, 209, 209), fill="#691522", outline="#e0b65f", width=10)
draw.ellipse((76, 76, 180, 180), fill="#180b08", outline="#8d552b", width=7)
draw.regular_polygon((128, 128, 23), n_sides=8, fill="#f4dfae", rotation=22.5)
draw.ellipse((115, 115, 141, 141), fill="#6f1423", outline="#f4dfae", width=4)
image.save(target, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(target)
