from pathlib import Path
import math
import random

from PIL import Image, ImageChops, ImageFilter


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


def save_lossless(source: Image.Image, name: str) -> None:
    source.save(OUTPUT / name, "WEBP", lossless=True, method=6)


def export(source: Image.Image, box: tuple[int, int, int, int], name: str) -> Image.Image:
    crop = source.crop(scaled_box(source, box))
    crop.save(OUTPUT / name, "WEBP", quality=94, method=6)
    return crop


def erase_horizontal_detail(source: Image.Image, box: tuple[int, int, int, int], feather: int = 10) -> None:
    """Replace live-copy regions with interpolated glass while retaining the photographed shell."""
    left, top, right, bottom = scaled_box(source, box)
    top_sample = source.crop((left, max(0, top - 3), right, max(1, top - 1))).resize(
        (right - left, bottom - top), Image.Resampling.BICUBIC
    )
    bottom_sample = source.crop((left, min(source.height - 2, bottom + 1), right, min(source.height, bottom + 3))).resize(
        (right - left, bottom - top), Image.Resampling.BICUBIC
    )
    vertical_blend = Image.new("L", (right - left, bottom - top))
    vertical_blend.putdata(
        [round(255 * y / max(1, bottom - top - 1)) for y in range(bottom - top) for _ in range(right - left)]
    )
    fill = Image.composite(bottom_sample, top_sample, vertical_blend).filter(ImageFilter.GaussianBlur(2.2))
    mask = Image.new("L", source.size)
    mask.paste(255, (left, top, right, bottom))
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    plate = source.copy()
    plate.paste(fill, (left, top))
    source.paste(plate, mask=mask)


def paint_glass_field(
    source: Image.Image,
    box: tuple[int, int, int, int],
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
    glow: int,
    feather: int,
    seed: int,
) -> None:
    """Paint a clean, non-repeating liquid-glass field into a dynamic-content aperture."""
    left, top, right, bottom = scaled_box(source, box)
    width, height = right - left, bottom - top
    rng = random.Random(seed)
    patch = Image.new("RGB", (width, height))
    pixels: list[tuple[int, int, int]] = []
    for y in range(height):
        ny = y / max(1, height - 1)
        for x in range(width):
            nx = x / max(1, width - 1)
            base = tuple(top_color[index] * (1 - ny) + bottom_color[index] * ny for index in range(3))
            radial = math.exp(-(((nx - .5) / .48) ** 2 + ((ny - .38) / .62) ** 2) * 1.55)
            edge_depth = max(0, (abs(nx - .5) * 2 - .72) / .28)
            caustic = math.sin(nx * 8.4 + ny * 3.1) * 1.15 + math.sin(nx * 3.2 - ny * 6.7) * .8
            grain = rng.uniform(-1.4, 1.4)
            red = base[0] + radial * glow * .035 - edge_depth * 2 + grain * .22
            green = base[1] + radial * glow + caustic - edge_depth * 13 + grain
            blue = base[2] + radial * glow * .12 - edge_depth * 2 + grain * .28
            pixels.append(tuple(max(0, min(255, round(value))) for value in (red, green, blue)))
    patch.putdata(pixels)
    plate = source.copy()
    plate.paste(patch, (left, top))
    mask = Image.new("L", source.size)
    mask.paste(255, (left, top, right, bottom))
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    source.paste(plate, mask=mask)


def clean_selector_label(tile: Image.Image, category: str) -> Image.Image:
    clean = tile.copy()
    width, height = clean.size
    inset = 0.12 if category == "electronic" else 0.2
    left, right = round(width * inset), round(width * (1 - inset))
    top, bottom = round(height * 0.36), round(height * 0.64)
    top_sample = clean.crop((left, top - 4, right, top - 1)).resize((right - left, bottom - top), Image.Resampling.BICUBIC)
    bottom_sample = clean.crop((left, bottom + 1, right, bottom + 4)).resize((right - left, bottom - top), Image.Resampling.BICUBIC)
    blend = Image.new("L", (right - left, bottom - top))
    blend.putdata([round(255 * y / max(1, bottom - top - 1)) for y in range(bottom - top) for _ in range(right - left)])
    fill = Image.composite(bottom_sample, top_sample, blend).filter(ImageFilter.GaussianBlur(2))
    plate = clean.copy()
    plate.paste(fill, (left, top))
    mask = Image.new("L", clean.size)
    mask.paste(255, (left, top, right, bottom))
    mask = mask.filter(ImageFilter.GaussianBlur(max(5, round(height * 0.035))))
    clean.paste(plate, mask=mask)
    return clean


OUTPUT.mkdir(parents=True, exist_ok=True)
selector = Image.open(REFERENCE / "selector-canonical-v2.png").convert("RGB")
broken = Image.open(REFERENCE / "selector-broken-dark-canonical.jpg").convert("RGB")
player = Image.open(REFERENCE / "player-canonical-v2.png").convert("RGB")

expected_sizes = {"selector": (960, 1639), "broken": (749, 1280), "player": (941, 1671)}
for name, source in (("selector", selector), ("broken", broken), ("player", player)):
    if source.size != expected_sizes[name]:
        raise RuntimeError(f"Unexpected {name} canonical reference dimensions: {source.size}")

# Continuous lossless plates eliminate component seams and lossy ringing at inspection zoom.
save_lossless(selector, "selector-chassis.webp")
player_clean = player.copy()
paint_glass_field(player_clean, (58, 106, 692, 184), (0, 16, 5), (0, 7, 3), 7, 5, 1701)
paint_glass_field(player_clean, (43, 274, 707, 772), (0, 52, 7), (0, 27, 4), 28, 35, 3407)
erase_horizontal_detail(player_clean, (120, 296, 630, 350), 6)
erase_horizontal_detail(player_clean, (25, 345, 725, 415), 14)
paint_glass_field(player_clean, (25, 654, 128, 735), (0, 46, 5), (0, 29, 4), 10, 8, 5101)
paint_glass_field(player_clean, (622, 654, 725, 735), (0, 46, 5), (0, 29, 4), 10, 8, 5107)
save_lossless(player_clean, "player-chassis-clean.webp")

row_bounds = ((0, 267), (267, 535), (535, 801), (801, 1063))
categories = (("heavy", "dreamy"), ("quiet", "electronic"), ("dark", "loud"), ("strange", "anything"))
selector_tiles: dict[str, Image.Image] = {}
for row, names in enumerate(categories):
    top, bottom = row_bounds[row]
    selector_tiles[names[0]] = export(selector, (0, top, 375, bottom), f"selector-{names[0]}.webp")
    selector_tiles[names[1]] = export(selector, (375, top, 750, bottom), f"selector-{names[1]}.webp")

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
    if category != "dark":
        clean_tile = clean_selector_label(selector_tiles[category], category).convert("RGBA")
        fitted_damage = damage.resize(clean_tile.size, Image.Resampling.LANCZOS)
        clean_tile.alpha_composite(fitted_damage)
        save_lossless(clean_tile.convert("RGB"), f"selector-selected-{category}.webp")

# DARK is the exact approved photographic break, not a procedural approximation.
dark_selected = broken.crop(scaled_box(broken, (0, 535, 375, 801)))
save_lossless(dark_selected, "selector-selected-dark.webp")

print(f"Exported canonical component skins to {OUTPUT}")
