from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "automation" / "artist-machines"
PUBLIC = ROOT / "public"
MEDIA_ROOT = PUBLIC / "artist-machine-media"
QR_TEMPLATE = MEDIA_ROOT / "qr-card-template.jpg"
MARQUEE = PUBLIC / "music-machine" / "aggits-marquee-v2.webp"
PUBLIC_ORIGIN = "https://raggedya.github.io/cosmic-aquarium"


class ArtistMediaError(RuntimeError):
    pass


def _font(size: int, *, serif: bool = True, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = []
    if serif:
        names.extend([
            "C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        ])
    names.extend([
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ])
    for name in names:
        path = Path(name)
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _fit_font(draw: ImageDraw.ImageDraw, text: str, maximum_width: int, maximum_size: int, minimum_size: int, *, serif: bool = True) -> ImageFont.ImageFont:
    for size in range(maximum_size, minimum_size - 1, -2):
        font = _font(size, serif=serif, bold=True)
        box = draw.textbbox((0, 0), text, font=font, stroke_width=max(1, size // 38))
        if box[2] - box[0] <= maximum_width:
            return font
    return _font(minimum_size, serif=serif, bold=True)


def _draw_centred(draw: ImageDraw.ImageDraw, bounds: tuple[int, int, int, int], text: str, font: ImageFont.ImageFont, **kwargs: object) -> None:
    left, top, right, bottom = bounds
    box = draw.textbbox((0, 0), text, font=font, stroke_width=int(kwargs.get("stroke_width", 0)))
    width, height = box[2] - box[0], box[3] - box[1]
    x = left + (right - left - width) / 2 - box[0]
    y = top + (bottom - top - height) / 2 - box[1]
    draw.text((x, y), text, font=font, **kwargs)


def artist_public_url(slug: str) -> str:
    return f"{PUBLIC_ORIGIN}/artist/{slug}/"


def render_social_card(artist_name: str, cabinet_path: Path, output: Path, *, marquee_path: Path = MARQUEE) -> None:
    with Image.open(cabinet_path) as source:
        cabinet = source.convert("RGB")
    crop_height = max(1, round(cabinet.width * 630 / 1200))
    if cabinet.height < crop_height:
        raise ArtistMediaError(f"Cabinet artwork is too short for a social card: {cabinet_path}")
    image = cabinet.crop((0, 0, cabinet.width, crop_height)).resize((1200, 630), Image.Resampling.LANCZOS).convert("RGBA")

    with Image.open(marquee_path) as source:
        marquee = source.convert("RGBA")
    marquee_width = 1000
    marquee_height = round(marquee.height * marquee_width / marquee.width)
    marquee = marquee.resize((marquee_width, marquee_height), Image.Resampling.LANCZOS)
    image.alpha_composite(marquee, ((1200 - marquee_width) // 2, 18))

    draw = ImageDraw.Draw(image)
    display_name = " ".join(artist_name.upper().split())
    font = _fit_font(draw, display_name, 690, 78, 32, serif=True)
    _draw_centred(
        draw,
        (245, 392, 955, 519),
        display_name,
        font,
        fill=(42, 24, 15, 255),
        stroke_fill=(238, 206, 151, 150),
        stroke_width=1,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, "JPEG", quality=92, optimize=True, progressive=True)


def render_qr_card(artist_name: str, destination: str, output: Path, *, template_path: Path = QR_TEMPLATE, verify: bool = True) -> None:
    with Image.open(template_path) as source:
        image = source.convert("RGB")
    if image.size != (1254, 1254):
        raise ArtistMediaError(f"Canonical QR template must be 1254 × 1254 pixels, received {image.size}")

    draw = ImageDraw.Draw(image)
    # The supplied canonical artwork deliberately reserves these two variable areas.
    draw.rounded_rectangle((245, 143, 1009, 269), radius=12, fill=(3, 3, 8))
    display_name = " ".join(artist_name.upper().split())
    font = _fit_font(draw, display_name, 720, 86, 34, serif=True)
    _draw_centred(draw, (254, 145, 1000, 267), display_name, font, fill=(251, 232, 194), stroke_fill=(80, 46, 31), stroke_width=1)

    panel = (313, 326, 941, 932)
    draw.rectangle(panel, fill=(247, 245, 238))
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
    code.add_data(destination)
    code.make(fit=True)
    qr_image = code.make_image(fill_color=(12, 10, 15), back_color=(247, 245, 238)).convert("RGB")
    maximum = min(panel[2] - panel[0], panel[3] - panel[1])
    if qr_image.width > maximum:
        module_count = len(code.get_matrix())
        box_size = max(1, maximum // module_count)
        target = module_count * box_size
        qr_image = qr_image.resize((target, target), Image.Resampling.NEAREST)
    x = panel[0] + (panel[2] - panel[0] - qr_image.width) // 2
    y = panel[1] + (panel[3] - panel[1] - qr_image.height) // 2
    image.paste(qr_image, (x, y))

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "PNG", optimize=True)
    if verify:
        try:
            import zxingcpp
        except ImportError as error:
            raise ArtistMediaError("zxing-cpp is required to verify Artist Machine QR artwork") from error
        decoded = zxingcpp.read_barcode(Image.open(output))
        if decoded is None or decoded.text != destination:
            raise ArtistMediaError("Generated Artist Machine QR artwork failed independent decode verification")


def render_artist_media(
    config: dict[str, object],
    cabinet_path: Path,
    output_directory: Path,
    *,
    template_path: Path = QR_TEMPLATE,
    marquee_path: Path = MARQUEE,
    verify: bool = True,
) -> dict[str, str]:
    slug = str(config.get("artistSlug") or "")
    artist_name = str(config.get("artistName") or "").strip()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or not artist_name:
        raise ArtistMediaError("Artist media requires a canonical slug and artist name")
    destination = artist_public_url(slug)
    social = output_directory / "social-card.jpg"
    qr = output_directory / "qr-card.png"
    render_social_card(artist_name, cabinet_path, social, marquee_path=marquee_path)
    render_qr_card(artist_name, destination, qr, template_path=template_path, verify=verify)
    return {
        "publicUrl": destination,
        "socialCard": f"/assets/artist-machines/{slug}/social-card.jpg",
        "qrArtwork": f"/assets/artist-machines/{slug}/qr-card.png",
    }


def _cabinet_path(config: dict[str, object]) -> Path:
    value = str(config.get("cabinetArtwork") or "")
    if not value.startswith("/assets/music-machine/"):
        raise ArtistMediaError("Published artist configuration has no supported cabinet artwork")
    path = PUBLIC / "music-machine" / Path(value).name
    if not path.is_file():
        raise ArtistMediaError(f"Published cabinet artwork is missing: {path}")
    return path


def backfill_all(*, verify: bool = True) -> list[dict[str, str]]:
    results = []
    for path in sorted(PUBLISHED.glob("*.json")):
        config = json.loads(path.read_text(encoding="utf-8"))
        output = MEDIA_ROOT / str(config.get("artistSlug") or path.stem)
        results.append(render_artist_media(config, _cabinet_path(config), output, verify=verify))
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate per-band AGGITS social cards and scan-verified QR artwork.")
    parser.add_argument("--all", action="store_true", help="Generate media for every published Artist Machine")
    parser.add_argument("--slug", help="Generate media for one published Artist Machine")
    parser.add_argument("--skip-verify", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if bool(args.all) == bool(args.slug):
        parser.error("choose exactly one of --all or --slug")
    if args.all:
        result = backfill_all(verify=not args.skip_verify)
    else:
        path = PUBLISHED / f"{args.slug}.json"
        config = json.loads(path.read_text(encoding="utf-8"))
        result = render_artist_media(config, _cabinet_path(config), MEDIA_ROOT / args.slug, verify=not args.skip_verify)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
