from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs" / "reference" / "two-screen-discovery" / "fidelity-2026-09-05"
OUTPUT = ROOT / "public" / "discovery-fidelity"
GENERATED = REFERENCE / "generated"


def scaled_box(source: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Map design-space crop coordinates onto an unmodified canonical source."""
    width, height = source.size
    left, top, right, bottom = box
    return (
        round(left * width / 750),
        round(top * height / 1280),
        round(right * width / 750),
        round(bottom * height / 1280),
    )


def export(source: Image.Image, box: tuple[int, int, int, int], name: str) -> None:
    crop = source.crop(scaled_box(source, box))
    crop.save(OUTPUT / name, "WEBP", quality=94, method=6)


OUTPUT.mkdir(parents=True, exist_ok=True)
selector = Image.open(REFERENCE / "selector-canonical-v2.png").convert("RGB")
broken = Image.open(REFERENCE / "selector-broken-dark-canonical.jpg").convert("RGB")
player = Image.open(REFERENCE / "player-canonical-v2.png").convert("RGB")

expected_sizes = {"selector": (960, 1639), "broken": (749, 1280), "player": (941, 1671)}
for name, source in (("selector", selector), ("broken", broken), ("player", player)):
    if source.size != expected_sizes[name]:
        raise RuntimeError(f"Unexpected {name} canonical reference dimensions: {source.size}")

row_bounds = ((0, 267), (267, 535), (535, 801), (801, 1063))
categories = (("heavy", "dreamy"), ("quiet", "electronic"), ("dark", "loud"), ("strange", "anything"))
for row, names in enumerate(categories):
    top, bottom = row_bounds[row]
    export(selector, (0, top, 375, bottom), f"selector-{names[0]}.webp")
    export(selector, (375, top, 750, bottom), f"selector-{names[1]}.webp")

export(broken, (0, 535, 375, 801), "selector-dark-broken.webp")
export(selector, (0, 1063, 750, 1137), "selector-bandcamp.webp")
export(selector, (0, 1137, 750, 1280), "selector-go.webp")

export(player, (0, 0, 750, 211), "player-ticker-shell.webp")
export(player, (0, 208, 750, 781), "player-main-frame.webp")
export(player, (0, 779, 250, 1045), "player-share.webp")
export(player, (250, 779, 500, 1045), "player-buy.webp")
export(player, (500, 779, 750, 1045), "player-next.webp")
export(player, (0, 1041, 750, 1280), "player-footer.webp")


def remove_checkerboard(cell: Image.Image) -> Image.Image:
    """Recover useful emerald fracture pixels from the generated preview matte."""
    source = cell.convert("RGB")
    red, green, blue = source.split()
    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    minimum = ImageChops.darker(ImageChops.darker(red, green), blue)
    chroma = ImageChops.subtract(maximum, minimum).point(lambda value: max(0, min(255, round((value - 7) * 5.4))))
    green_bias = ImageChops.subtract(green, Image.blend(red, blue, 0.5))
    saturated_green = green_bias.point(lambda value: max(0, min(255, round((value - 3) * 8.2))))
    darkness = source.convert("L").point(lambda value: max(0, min(255, round((150 - value) * 3.2))))
    greenish = green_bias.point(lambda value: 255 if value >= 2 else 0)
    dark_emerald = ImageChops.multiply(darkness, greenish)
    alpha = ImageChops.lighter(ImageChops.lighter(chroma, saturated_green), dark_emerald)
    overlay = source.convert("RGBA")
    overlay.putalpha(alpha)
    return overlay


atlas = Image.open(GENERATED / "broken-glass-atlas-v2.png").convert("RGB")
if atlas.size != (1024, 1536):
    raise RuntimeError(f"Unexpected generated fracture atlas dimensions: {atlas.size}")
for index, category in enumerate(("heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange", "anything")):
    column, row = index % 2, index // 2
    damage = remove_checkerboard(atlas.crop((column * 512, row * 384, (column + 1) * 512, (row + 1) * 384)))
    damage = damage.resize((750, 532), Image.Resampling.LANCZOS)
    damage.save(OUTPUT / f"selector-break-{category}.webp", "WEBP", quality=94, method=6)

print(f"Exported canonical component skins to {OUTPUT}")
