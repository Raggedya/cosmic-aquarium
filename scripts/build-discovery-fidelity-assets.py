from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs" / "reference" / "two-screen-discovery" / "fidelity-2026-09-05"
OUTPUT = ROOT / "public" / "discovery-fidelity"


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
selector = Image.open(REFERENCE / "selector-canonical.jpg").convert("RGB")
broken = Image.open(REFERENCE / "selector-broken-dark-canonical.jpg").convert("RGB")
player = Image.open(REFERENCE / "player-canonical.jpg").convert("RGB")

for name, source in (("selector", selector), ("broken", broken), ("player", player)):
    if source.height != 1280 or not 700 <= source.width <= 750:
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

print(f"Exported canonical component skins to {OUTPUT}")
