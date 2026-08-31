from __future__ import annotations

import hashlib
import random
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import SolidFillColorMask
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer


CANVAS = 1280
LAVENDER = (198, 184, 244)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def _centred(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.ImageFont, fill: tuple[int, ...], spacing: int = 0) -> None:
    if spacing <= 0:
        box = draw.textbbox((0, 0), text, font=font)
        draw.text(((CANVAS - (box[2] - box[0])) / 2, y), text, font=font, fill=fill)
        return
    widths = [draw.textlength(char, font=font) for char in text]
    total = sum(widths) + spacing * max(0, len(text) - 1)
    x = (CANVAS - total) / 2
    for char, width in zip(text, widths):
        draw.text((x, y), char, font=font, fill=fill)
        x += width + spacing


def _flower(canvas: Image.Image, source: Path, centre: tuple[int, int], width: int, rotation: float) -> None:
    flower = Image.open(source).convert("RGBA")
    ratio = width / flower.width
    flower = flower.resize((width, max(1, int(flower.height * ratio))), Image.Resampling.LANCZOS)
    flower = flower.rotate(rotation, expand=True, resample=Image.Resampling.BICUBIC)
    glow_alpha = flower.getchannel("A").filter(ImageFilter.GaussianBlur(22))
    glow = Image.new("RGBA", flower.size, (112, 80, 255, 0))
    glow.putalpha(glow_alpha.point(lambda value: int(value * 0.28)))
    x = int(centre[0] - flower.width / 2)
    y = int(centre[1] - flower.height / 2)
    canvas.alpha_composite(glow, (x, y))
    canvas.alpha_composite(flower, (x, y))


def render_qr_artwork(title: str, destination: str, output: Path, flowers_dir: Path, verify: bool = True) -> None:
    seed = int(hashlib.sha256((title + destination).encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)
    image = Image.new("RGBA", (CANVAS, CANVAS), (5, 5, 24, 255))
    pixels = image.load()
    for y in range(CANVAS):
        t = y / (CANVAS - 1)
        for x in range(CANVAS):
            radial = max(0.0, 1.0 - (((x - 640) / 780) ** 2 + ((y - 590) / 900) ** 2))
            pixels[x, y] = (
                int(4 + radial * 7),
                int(5 + radial * 6),
                int(22 + radial * 18 + t * 2),
                255,
            )
    draw = ImageDraw.Draw(image, "RGBA")
    for _ in range(92):
        x, y = rng.randrange(26, 1254), rng.randrange(24, 1228)
        radius = rng.choice((1, 1, 1, 2))
        color = rng.choice(((172, 191, 255, 90), (235, 185, 255, 66), (255, 255, 255, 58)))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    draw.ellipse((608, 65, 672, 129), outline=(202, 208, 235, 150), width=2)
    draw.line((621, 95, 659, 95), fill=(202, 208, 235, 150), width=2)
    draw.line((625, 84, 655, 106), fill=(202, 208, 235, 150), width=2)
    draw.line((625, 106, 655, 84), fill=(202, 208, 235, 150), width=2)

    display_title = " ".join(title.upper().split())
    title_size = 46 if len(display_title) < 22 else 36 if len(display_title) < 34 else 29
    _centred(draw, 150, display_title, _font(title_size), (248, 247, 255, 242), 13 if len(display_title) < 26 else 6)
    _centred(draw, 222, "TOUCH SOMETHING.", _font(18, True), (205, 202, 225, 178), 8)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=16, border=5)
    qr.add_data(destination)
    qr.make(fit=True)
    code = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(radius_ratio=0.9),
        color_mask=SolidFillColorMask(back_color=(7, 7, 29), front_color=LAVENDER),
    ).convert("RGBA")
    code = code.resize((650, 650), Image.Resampling.NEAREST)
    qr_x, qr_y = 315, 302
    draw.rounded_rectangle((qr_x - 18, qr_y - 18, qr_x + 668, qr_y + 668), radius=28, fill=(9, 9, 33, 238), outline=(200, 190, 246, 50), width=2)
    image.alpha_composite(code, (qr_x, qr_y))

    arrangements = [
        ("poppy.png", (145, 245), 235, -18),
        ("cosmos.png", (1125, 270), 235, 18),
        ("anemone.png", (128, 735), 245, -12),
        ("poppy.png", (1145, 760), 235, 16),
        ("anemone.png", (1035, 1040), 150, 8),
    ]
    for name, centre, width, rotation in arrangements:
        _flower(image, flowers_dir / name, centre, width, rotation)

    draw = ImageDraw.Draw(image, "RGBA")
    _centred(draw, 1092, "© CLEARLIGHT CREATIVE 2026", _font(18), (244, 241, 255, 218), 7)
    draw.line((480, 1158, 598, 1158), fill=(194, 172, 244, 150), width=2)
    draw.line((682, 1158, 800, 1158), fill=(194, 172, 244, 150), width=2)
    draw.polygon(((640, 1138), (646, 1152), (660, 1158), (646, 1164), (640, 1178), (634, 1164), (620, 1158), (634, 1152)), outline=(210, 186, 255, 190))

    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, "PNG", optimize=True)

    if verify:
        try:
            import zxingcpp
        except ImportError as error:
            raise RuntimeError("zxing-cpp is required for scan verification") from error
        result = zxingcpp.read_barcode(Image.open(output))
        if result is None or result.text != destination:
            raise RuntimeError("Generated QR artwork failed independent decode verification")
