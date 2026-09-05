from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "discovery-fidelity"
SOURCE = ASSETS / "player-chassis-clean.webp"
OUTPUT = ASSETS / "player-chassis-concise-actions-v3.webp"
FONT_CANDIDATES = (
    Path("C:/Windows/Fonts/bahnschrift.ttf"),
    Path("C:/Windows/Fonts/segoeui.ttf"),
)


def letterspaced_text_layer(size: tuple[int, int], label: str) -> Image.Image:
    font_path = next((candidate for candidate in FONT_CANDIDATES if candidate.exists()), None)
    if font_path is None:
        raise RuntimeError("No approved player-label font is available")

    font = ImageFont.truetype(str(font_path), 30)
    tracking = 5
    glyph_widths = [ImageDraw.Draw(Image.new("L", (1, 1))).textlength(character, font=font) for character in label]
    text_width = round(sum(glyph_widths) + tracking * max(0, len(label) - 1))
    x = round((size[0] - text_width) / 2)

    # The optical centre of the illuminated inner face is slightly above the
    # geometric crop centre. Keep one immutable, baked label layer so cached
    # CSS/HTML can never reveal the retired JUKEBOX wording underneath it.
    baseline_y = round(size[1] * 0.505)
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for character, width in zip(label, glyph_widths):
        draw.text((x, baseline_y), character, font=font, fill=255, anchor="lm")
        x += round(width + tracking)

    glow = mask.filter(ImageFilter.GaussianBlur(5.5)).point(lambda value: round(value * 0.72))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.alpha_composite(Image.merge("RGBA", (
        Image.new("L", size, 105),
        Image.new("L", size, 255),
        Image.new("L", size, 125),
        glow,
    )))
    crisp = Image.new("RGBA", size, (247, 255, 248, 0))
    crisp.putalpha(mask)
    layer.alpha_composite(crisp)
    return layer


def main() -> None:
    chassis = Image.open(SOURCE).convert("RGBA")
    if chassis.size != (941, 1671):
        raise RuntimeError(f"Unexpected player chassis dimensions: {chassis.size}")

    placements = (
        ("player-share-blank.webp", "SHARE", (0, 1017)),
        ("player-next-blank.webp", "NEXT", (627, 1017)),
    )
    for skin_name, label, position in placements:
        skin = Image.open(ASSETS / skin_name).convert("RGBA")
        if skin.size != (314, 347):
            raise RuntimeError(f"Unexpected {skin_name} dimensions: {skin.size}")
        skin.alpha_composite(letterspaced_text_layer(skin.size, label))
        chassis.alpha_composite(skin, position)

    chassis.convert("RGB").save(OUTPUT, "WEBP", lossless=True, method=6)


if __name__ == "__main__":
    main()
