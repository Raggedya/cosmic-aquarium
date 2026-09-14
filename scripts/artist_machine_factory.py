from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from create_artist import artist_store_url, slugify, validate_bandcamp_url
from create_artist_machine import discover_complete_catalogue

ROOT = Path(__file__).resolve().parents[1]
FACTORY = ROOT / "automation" / "artist-machine-factory"
CANDIDATES = FACTORY / "candidates"
PUBLISHED = ROOT / "automation" / "artist-machines"
PUBLIC_SKINS = ROOT / "public" / "music-machine"
SKIN_CONTRACT = FACTORY / "skin-contract.json"
BASE_JUKEBOX = ROOT / "public" / "music-machine" / "aggits-cabinet.webp"
ENGINE_VERSION = "artist-machine-v1"
PUBLIC_BASE_URL = "https://raggedya.github.io/cosmic-aquarium/artist/?artist="
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
PREVIEW_RUNTIME_FILES = (
    "discovery-machine.css",
    "discovery-machine.js",
    "discovery-machine-core.js",
    "machine-mechanics-core.js",
    "single-reel-engine.js",
)


class FactoryError(ValueError):
    pass


def configure_workspace(workspace: Path) -> Path:
    """Point the reusable factory engine at an explicit project checkout.

    The command-line factory continues to default to this repository.  The
    Windows dashboard uses an isolated managed checkout so private reference
    images and candidate reports never enter the public working tree.
    """
    global ROOT, FACTORY, CANDIDATES, PUBLISHED, PUBLIC_SKINS, SKIN_CONTRACT, BASE_JUKEBOX
    resolved = Path(workspace).expanduser().resolve()
    if not (resolved / "automation" / "artist-machine-factory" / "skin-contract.json").is_file():
        raise FactoryError("The selected Factory workspace is missing the locked machine contract")
    ROOT = resolved
    FACTORY = ROOT / "automation" / "artist-machine-factory"
    CANDIDATES = FACTORY / "candidates"
    PUBLISHED = ROOT / "automation" / "artist-machines"
    PUBLIC_SKINS = ROOT / "public" / "music-machine"
    SKIN_CONTRACT = FACTORY / "skin-contract.json"
    BASE_JUKEBOX = ROOT / "public" / "music-machine" / "aggits-cabinet.webp"
    return ROOT


def clean_text(value: Any, maximum: int, field: str, required: bool = False) -> str:
    text = " ".join(str(value or "").split()).strip()
    if required and not text:
        raise FactoryError(f"{field} is required")
    if len(text) > maximum:
        raise FactoryError(f"{field} must be {maximum} characters or fewer")
    return text


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise FactoryError(f"File not found: {path}") from error
    except json.JSONDecodeError as error:
        raise FactoryError(f"Invalid JSON in {path}: {error.msg}") from error
    if not isinstance(value, dict):
        raise FactoryError(f"Expected a JSON object in {path}")
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    temporary.replace(path)


def resolve_input_path(value: str, intake_path: Path) -> Path:
    candidate = Path(os.path.expandvars(os.path.expanduser(value)))
    if not candidate.is_absolute():
        candidate = intake_path.parent / candidate
    candidate = candidate.resolve()
    if not candidate.is_file():
        raise FactoryError(f"Image file not found: {candidate}")
    if candidate.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
        raise FactoryError("Artwork must be a JPG, PNG or WebP image")
    return candidate


def image_dimensions(path: Path) -> tuple[int, int]:
    try:
        from PIL import Image

        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return image.size
    except ImportError as error:
        raise FactoryError("Pillow is required to verify artwork; install requirements-automation.txt") from error
    except Exception as error:
        raise FactoryError(f"Artwork cannot be decoded: {path.name}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_artwork(path: Path, *, cabinet_skin: bool) -> dict[str, Any]:
    contract = load_json(SKIN_CONTRACT)
    width, height = image_dimensions(path)
    maximum = int(contract["canvas"]["maximumBytes"])
    if path.stat().st_size > maximum:
        raise FactoryError(f"{path.name} exceeds the {maximum // 1_000_000} MB artwork limit")
    ratio = width / height
    target_ratio = float(contract["canvas"]["aspectRatio"])
    if cabinet_skin and (width < 700 or height < 1200 or abs(ratio - target_ratio) > 0.006):
        raise FactoryError("Jukebox skin must use the locked 747:1280 portrait geometry (minimum 700 by 1200 pixels)")
    return {
        "file": path.name,
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "geometryCompliant": not cabinet_skin or abs(ratio - target_ratio) <= 0.006,
    }


def _mix_colour(first: tuple[int, int, int], second: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(a * (1 - amount) + b * amount) for a, b in zip(first, second))


def _colour_hex(colour: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in colour)


def reference_palette(path: Path) -> list[tuple[int, int, int]]:
    try:
        from PIL import Image

        with Image.open(path) as source:
            sample = source.convert("RGB")
            sample.thumbnail((96, 96))
            quantized = sample.quantize(colors=12, method=Image.Quantize.MEDIANCUT).convert("RGB")
            colours = quantized.getcolors(maxcolors=96 * 96) or []
    except ImportError as error:
        raise FactoryError("Pillow is required to generate the jukebox skin; install requirements-automation.txt") from error
    except Exception as error:
        raise FactoryError(f"Reference image cannot be read: {path.name}") from error
    ranked = sorted(
        colours,
        key=lambda item: item[0]
        * (1 + ((max(item[1]) - min(item[1])) / 32) ** 1.5)
        * (0.3 + max(item[1]) / 255),
        reverse=True,
    )
    palette: list[tuple[int, int, int]] = []
    for _count, colour in ranked:
        rgb = tuple(int(channel) for channel in colour)
        value = max(rgb)
        saturation = value - min(rgb)
        if value < 8:
            continue
        if value < 112 and saturation >= 6:
            scale = 112 / value
            rgb = tuple(min(255, round(channel * scale)) for channel in rgb)
        if all(sum((a - b) ** 2 for a, b in zip(rgb, existing)) >= 32 ** 2 for existing in palette):
            palette.append(rgb)
        if len(palette) == 4:
            break
    if not palette:
        dominant = tuple(int(channel) for channel in max(colours, key=lambda item: item[0])[1]) if colours else (0, 0, 0)
        palette.append(dominant if max(dominant) >= 8 else (28, 28, 28))
    seed = palette[0]
    derived = [
        _mix_colour(seed, (3, 4, 7), 0.68),
        _mix_colour(seed, (245, 224, 190), 0.48),
        _mix_colour(seed, (255, 255, 255), 0.7),
    ]
    for colour in derived:
        if len(palette) == 4:
            break
        if all(sum((a - b) ** 2 for a, b in zip(colour, existing)) >= 24 ** 2 for existing in palette):
            palette.append(colour)
    while len(palette) < 4:
        palette.append(_mix_colour(seed, (255, 255, 255), len(palette) / 5))
    return palette


def _reference_visual_profile(image: Any) -> dict[str, float]:
    from PIL import ImageFilter, ImageStat

    sample = image.copy()
    sample.thumbnail((160, 160))
    grayscale = sample.convert("L")
    hsv = sample.convert("HSV")
    edges = grayscale.filter(ImageFilter.FIND_EDGES)
    return {
        "brightness": round(ImageStat.Stat(grayscale).mean[0] / 255, 3),
        "contrast": round(ImageStat.Stat(grayscale).stddev[0] / 128, 3),
        "saturation": round(ImageStat.Stat(hsv).mean[1] / 255, 3),
        "texture": round(ImageStat.Stat(edges).mean[0] / 255, 3),
    }


def _boost_reference(image: Any) -> Any:
    from PIL import ImageEnhance, ImageOps

    grayscale = image.convert("L")
    histogram = grayscale.histogram()
    target = max(1, round(sum(histogram) * 0.9))
    running = 0
    percentile = 1
    for value, count in enumerate(histogram):
        running += count
        if running >= target:
            percentile = max(1, value)
            break
    boosted = image
    if percentile < 118:
        boosted = ImageEnhance.Brightness(boosted).enhance(min(3.2, 142 / percentile))
    boosted = ImageOps.autocontrast(boosted, cutoff=0.5, preserve_tone=True)
    return ImageEnhance.Color(boosted).enhance(1.18)


def _reference_motif(base: Any, reference: Any, box: tuple[int, int, int, int], opacity: float) -> Any:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat

    left, top, right, bottom = box
    region_size = (right - left, bottom - top)
    artwork = ImageOps.contain(reference, region_size, Image.Resampling.LANCZOS)
    field = Image.new("RGB", region_size, (0, 0, 0))
    offset = ((region_size[0] - artwork.width) // 2, (region_size[1] - artwork.height) // 2)
    field.paste(artwork, offset)
    original = base.crop(box)
    brightness = ImageStat.Stat(field.convert("L")).mean[0]
    blended = ImageChops.screen(original, field) if brightness < 112 else ImageChops.multiply(original, field)
    mask = Image.new("L", region_size, 0)
    ImageDraw.Draw(mask).ellipse((4, 2, region_size[0] - 4, region_size[1] - 2), fill=round(255 * opacity))
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(8, region_size[1] // 10)))
    result = base.copy()
    result.paste(blended, box, mask)
    return result


def generate_reference_jukebox_skin(
    reference_path: Path,
    destination: Path,
    art_direction: str = "",
) -> dict[str, Any]:
    try:
        from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps
    except ImportError as error:
        raise FactoryError("Pillow is required to generate the jukebox skin; install requirements-automation.txt") from error
    if not BASE_JUKEBOX.is_file():
        raise FactoryError("The locked AGGITS jukebox artwork is missing")
    contract = load_json(SKIN_CONTRACT)
    width = int(contract["canvas"].get("width") or 747)
    height = int(contract["canvas"].get("height") or 1280)
    palette = reference_palette(reference_path)
    primary = palette[0]
    accent = max(palette[1:], key=lambda colour: sum((a - b) ** 2 for a, b in zip(primary, colour)))
    shadow = _mix_colour(primary, (4, 5, 8), 0.82)
    middle = _mix_colour(primary, accent, 0.28)
    highlight = _mix_colour(accent, (248, 225, 174), 0.62)
    try:
        with Image.open(BASE_JUKEBOX) as source:
            base = source.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
        with Image.open(reference_path) as source:
            reference = source.convert("RGB")
        profile = _reference_visual_profile(reference)
        boosted_reference = _boost_reference(reference)
        greyscale = ImageOps.grayscale(base)
        colour_layer = ImageOps.colorize(greyscale, black=shadow, mid=middle, white=highlight)
        generated = Image.blend(base, colour_layer, 0.72)

        reference_field = ImageOps.fit(boosted_reference, (width, height), Image.Resampling.LANCZOS)
        atmosphere = reference_field.filter(ImageFilter.GaussianBlur(radius=max(18, width // 18)))
        atmosphere_transfer = ImageChops.soft_light(generated, atmosphere)
        generated = Image.blend(generated, atmosphere_transfer, 0.3)
        generated = _reference_motif(
            generated,
            boosted_reference,
            (round(width * 0.16), round(height * 0.015), round(width * 0.84), round(height * 0.19)),
            0.42,
        )
        generated = _reference_motif(
            generated,
            boosted_reference,
            (round(width * 0.17), round(height * 0.8), round(width * 0.83), round(height * 0.985)),
            0.3,
        )

        reference_gray = ImageOps.fit(boosted_reference.convert("L"), (width, height), Image.Resampling.LANCZOS)
        texture = ImageChops.difference(reference_gray, reference_gray.filter(ImageFilter.GaussianBlur(radius=5)))
        texture = ImageEnhance.Contrast(texture).enhance(1.8)
        texture_rgb = Image.merge("RGB", (texture, texture, texture))
        generated = Image.blend(generated, ImageChops.soft_light(generated, texture_rgb), 0.16)
        direction = art_direction.lower()
        if any(word in direction for word in ("dark", "moody", "black", "noir", "deep")):
            generated = ImageEnhance.Brightness(generated).enhance(0.86)
        if any(word in direction for word in ("bright", "light", "airy")):
            generated = ImageEnhance.Brightness(generated).enhance(1.1)
        if any(word in direction for word in ("vivid", "vibrant", "neon", "saturated")):
            generated = ImageEnhance.Color(generated).enhance(1.25)
        if any(word in direction for word in ("gritty", "rough", "distressed", "grain")):
            generated = Image.blend(generated, ImageChops.overlay(generated, texture_rgb), 0.12)
        generated = ImageEnhance.Contrast(generated).enhance(1.06 + min(0.1, profile["contrast"] * 0.08))
        protected = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(protected)
        for zone in contract.get("protectedZones", []):
            x = round(float(zone["x"]) * width)
            y = round(float(zone["y"]) * height)
            right = round((float(zone["x"]) + float(zone["width"])) * width)
            bottom = round((float(zone["y"]) + float(zone["height"])) * height)
            margin_x = max(4, round(width * 0.012))
            margin_y = max(4, round(height * 0.008))
            draw.rounded_rectangle((x - margin_x, y - margin_y, right + margin_x, bottom + margin_y), radius=12, fill=235)
        protected = protected.filter(ImageFilter.GaussianBlur(radius=max(4, width // 120)))
        generated = Image.composite(base, generated, protected)
        generated = ImageEnhance.Sharpness(generated).enhance(1.08)
        destination.parent.mkdir(parents=True, exist_ok=True)
        generated.save(destination, format="JPEG", quality=93, subsampling=0, optimize=True)
    except FactoryError:
        raise
    except Exception as error:
        raise FactoryError(f"The reference-driven jukebox skin could not be generated: {error}") from error
    audit = validate_artwork(destination, cabinet_skin=True)
    return {
        "method": "reference-composition-jukebox-v2",
        "baseArtwork": BASE_JUKEBOX.name,
        "referenceSha256": sha256(reference_path),
        "palette": [_colour_hex(colour) for colour in palette],
        "visualProfile": profile,
        "artDirectionApplied": clean_text(art_direction, 500, "artwork.notes") or None,
        "output": audit,
    }


def normalise_intake(value: dict[str, Any], intake_path: Path) -> dict[str, Any]:
    allowed_top = {"schemaVersion", "artist", "editorial", "artwork", "request"}
    unknown = set(value) - allowed_top
    if unknown:
        raise FactoryError(f"Unknown intake field(s): {', '.join(sorted(unknown))}")
    if value.get("schemaVersion") != 1:
        raise FactoryError("Only Artist Machine intake schemaVersion 1 is supported")
    artist = value.get("artist")
    editorial = value.get("editorial")
    artwork = value.get("artwork")
    request = value.get("request") or {}
    if not isinstance(artist, dict) or not isinstance(editorial, dict) or not isinstance(artwork, dict) or not isinstance(request, dict):
        raise FactoryError("artist, editorial, artwork and request must be JSON objects")
    name = clean_text(artist.get("name"), 100, "artist.name", True)
    supplied_slug = clean_text(artist.get("slug"), 72, "artist.slug")
    slug = slugify(supplied_slug or name)
    if supplied_slug and supplied_slug != slug:
        raise FactoryError("artist.slug must contain lowercase letters, numbers and single hyphens only")
    bandcamp = artist_store_url(validate_bandcamp_url(clean_text(artist.get("bandcampUrl"), 500, "artist.bandcampUrl", True)))
    if not bandcamp:
        raise FactoryError("artist.bandcampUrl must be an artist-owned Bandcamp address")
    ticker = editorial.get("tickerCopy") or []
    if not isinstance(ticker, list) or len(ticker) > 24:
        raise FactoryError("editorial.tickerCopy must contain at most 24 entries")
    ticker = [clean_text(item, 500, "editorial.tickerCopy") for item in ticker]
    ticker = list(dict.fromkeys(item for item in ticker if item))
    reference_value = clean_text(artwork.get("referenceImage"), 1000, "artwork.referenceImage", True)
    skin_value = clean_text(artwork.get("cabinetSkin"), 1000, "artwork.cabinetSkin")
    reference_path = resolve_input_path(reference_value, intake_path)
    skin_path = resolve_input_path(skin_value, intake_path) if skin_value else None
    skin_variant = clean_text(artwork.get("skinVariant"), 72, "artwork.skinVariant") or f"{slug}-custom"
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", skin_variant):
        raise FactoryError("artwork.skinVariant must contain lowercase letters, numbers and single hyphens only")
    email = clean_text(request.get("deliveryEmail"), 254, "request.deliveryEmail")
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise FactoryError("request.deliveryEmail is not a valid email address")
    return {
        "artistName": name,
        "artistSlug": slug,
        "bandcampArtistUrl": bandcamp,
        "city": clean_text(artist.get("city"), 100, "artist.city"),
        "bio": clean_text(editorial.get("bio"), 4000, "editorial.bio"),
        "tickerCopy": ticker,
        "referencePath": reference_path,
        "skinPath": skin_path,
        "skinVariant": skin_variant,
        "artworkNotes": clean_text(artwork.get("notes"), 2000, "artwork.notes"),
        "requestedBy": clean_text(request.get("requestedBy"), 100, "request.requestedBy"),
        "deliveryEmail": email,
        "requestNotes": clean_text(request.get("notes"), 2000, "request.notes"),
    }


def track_errors(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    songs = config.get("songs")
    if not isinstance(songs, list) or not songs:
        return ["No playable songs"]
    ids: set[str] = set()
    for index, song in enumerate(songs, 1):
        if not isinstance(song, dict):
            errors.append(f"Song {index} is not an object")
            continue
        track_id = str(song.get("bandcampEmbedTrackId") or "")
        if not track_id.isdigit():
            errors.append(f"Song {index} has no Bandcamp embed track ID")
        if track_id in ids:
            errors.append(f"Duplicate Bandcamp track ID: {track_id}")
        ids.add(track_id)
        if not clean_text(song.get("title"), 500, f"song {index} title"):
            errors.append(f"Song {index} has no title")
        try:
            validate_bandcamp_url(str(song.get("bandcampUrl") or ""))
        except ValueError:
            errors.append(f"Song {index} has an invalid Bandcamp URL")
    return errors


def validate_machine_config(config: dict[str, Any], skin_path: Path | None = None) -> dict[str, Any]:
    errors: list[str] = []
    if config.get("machineMode") != "artist":
        errors.append("machineMode must be artist")
    if not clean_text(config.get("artistName"), 100, "artistName"):
        errors.append("artistName is missing")
    try:
        expected_slug = slugify(str(config.get("artistSlug") or ""))
        if expected_slug != config.get("artistSlug"):
            errors.append("artistSlug is not canonical")
    except ValueError:
        errors.append("artistSlug is missing")
    try:
        if not artist_store_url(validate_bandcamp_url(str(config.get("bandcampArtistUrl") or ""))):
            errors.append("bandcampArtistUrl is not artist-owned")
    except ValueError:
        errors.append("bandcampArtistUrl is invalid")
    errors.extend(track_errors(config))
    skin = None
    if skin_path:
        try:
            skin = validate_artwork(skin_path, cabinet_skin=True)
        except FactoryError as error:
            errors.append(str(error))
    return {
        "passed": not errors,
        "errors": errors,
        "songCount": len(config.get("songs") or []),
        "skin": skin,
    }


def run_spin_audit(config: dict[str, Any], spins: int = 30) -> dict[str, Any]:
    songs = list(config.get("songs") or [])
    if not songs:
        return {"passed": False, "spins": 0, "errors": ["No songs available"]}
    rng = random.Random(f"{config.get('artistSlug')}:{len(songs)}:{spins}")
    bag: list[dict[str, Any]] = []
    previous = ""
    selected: list[str] = []
    errors: list[str] = []
    for spin in range(spins):
        if not bag:
            bag = songs.copy()
            rng.shuffle(bag)
            if len(bag) > 1 and str(bag[-1].get("id")) == previous:
                bag[0], bag[-1] = bag[-1], bag[0]
        choice = bag.pop()
        current = str(choice.get("id") or "")
        if len(songs) > 1 and current == previous:
            errors.append(f"Immediate repeat on spin {spin + 1}")
        selected.append(current)
        previous = current
    return {"passed": not errors, "spins": spins, "errors": errors, "selectedTrackIds": selected}


def paths_for_candidate_root(root: Path) -> dict[str, Path]:
    return {
        "root": root,
        "config": root / "machine.json",
        "status": root / "status.json",
        "report": root / "report.json",
        "reference": root / "reference",
        "skin": root / "cabinet-skin",
        "brief": root / "skin-brief.json",
    }


def candidate_paths(slug: str) -> dict[str, Path]:
    return paths_for_candidate_root(CANDIDATES / slug)


def copy_named_image(source: Path, stem: Path) -> Path:
    destination = stem.with_suffix(source.suffix.lower())
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return destination


def prepare(intake_path: Path, replace: bool) -> dict[str, Any]:
    intake_path = intake_path.resolve()
    intake = normalise_intake(load_json(intake_path), intake_path)
    target_paths = candidate_paths(intake["artistSlug"])
    if target_paths["root"].exists() and not replace:
        raise FactoryError(f"Candidate {intake['artistSlug']} already exists; use --replace to rebuild it")
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    staging_root = Path(tempfile.mkdtemp(prefix=f".{intake['artistSlug']}-", dir=CANDIDATES))
    paths = paths_for_candidate_root(staging_root)
    backup_root = CANDIDATES / f".{intake['artistSlug']}.previous"
    try:
        reference_path = copy_named_image(intake["referencePath"], paths["reference"])
        reference_audit = validate_artwork(reference_path, cabinet_skin=False)
        tracks, metadata = discover_complete_catalogue(intake["bandcampArtistUrl"], intake["artistName"])
        if intake["skinPath"]:
            skin_path = copy_named_image(intake["skinPath"], paths["skin"])
            skin_generation = {"method": "operator-supplied", "referenceSha256": sha256(reference_path)}
        else:
            skin_path = paths["skin"].with_suffix(".jpg")
            skin_generation = generate_reference_jukebox_skin(reference_path, skin_path, intake["artworkNotes"])
        config = {
            "machineMode": "artist",
            "artistSlug": intake["artistSlug"],
            "artistName": intake["artistName"],
            "city": intake["city"] or metadata.get("location") or None,
            "bandcampArtistUrl": intake["bandcampArtistUrl"],
            "songs": tracks,
            "bio": intake["bio"] or metadata.get("bio") or None,
            "tickerCopy": intake["tickerCopy"],
            "heroArtwork": metadata.get("heroArtwork"),
            "accentTheme": "artist-custom",
            "skinVariant": intake["skinVariant"],
            "provenance": {
                "source": metadata.get("source") or intake["bandcampArtistUrl"],
                "method": "artist-machine-factory-v1",
                "engineVersion": ENGINE_VERSION,
            },
        }
        validation = validate_machine_config(config, skin_path)
        spin_audit = run_spin_audit(config)
        ready = validation["passed"] and spin_audit["passed"]
        status = "ready_for_approval" if ready else "blocked"
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        report = {
            "schemaVersion": 1,
            "engineVersion": ENGINE_VERSION,
            "artistSlug": intake["artistSlug"],
            "artistName": intake["artistName"],
            "status": status,
            "createdAt": now,
            "catalogue": {
                "source": metadata.get("source"),
                "releasePageCount": metadata.get("catalogueAudit", {}).get("releasePageCount"),
                "candidateTrackCount": metadata.get("catalogueAudit", {}).get("candidateTrackCount"),
                "playableSongCount": len(tracks),
                "excluded": metadata.get("catalogueAudit", {}).get("excluded", {}),
            },
            "referenceImage": reference_audit,
            "cabinetSkin": validation["skin"],
            "skinGeneration": skin_generation,
            "configuration": validation,
            "thirtySpinAudit": spin_audit,
            "previewUrlAfterApproval": PUBLIC_BASE_URL + intake["artistSlug"],
            "deliveryEmail": intake["deliveryEmail"] or None,
        }
        contract = load_json(SKIN_CONTRACT)
        brief = {
            "schemaVersion": 1,
            "artistName": intake["artistName"],
            "referenceImage": reference_path.name,
            "artDirection": intake["artworkNotes"] or "Use the supplied image for colour, tone and visual character.",
            "generation": skin_generation,
            "canvas": contract["canvas"],
            "protectedZones": contract["protectedZones"],
            "rules": contract["rules"],
        }
        write_json_atomic(paths["config"], config)
        write_json_atomic(paths["status"], {"status": status, "updatedAt": now, "approved": False})
        write_json_atomic(paths["report"], report)
        write_json_atomic(paths["brief"], brief)
        if backup_root.exists():
            shutil.rmtree(backup_root)
        if target_paths["root"].exists():
            target_paths["root"].replace(backup_root)
        staging_root.replace(target_paths["root"])
        if backup_root.exists():
            shutil.rmtree(backup_root)
        return report
    except Exception:
        if staging_root.exists():
            shutil.rmtree(staging_root)
        if backup_root.exists() and not target_paths["root"].exists():
            backup_root.replace(target_paths["root"])
        raise


def find_candidate_image(slug: str, stem: str) -> Path | None:
    root = candidate_paths(slug)["root"]
    matches = [path for path in root.glob(f"{stem}.*") if path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES]
    if len(matches) > 1:
        raise FactoryError(f"Candidate has multiple {stem} images")
    return matches[0] if matches else None


def attach_skin(slug: str, source: Path) -> dict[str, Any]:
    slug = slugify(slug)
    paths = candidate_paths(slug)
    config = load_json(paths["config"])
    source = source.resolve()
    validate_artwork(source, cabinet_skin=True)
    old_skin = find_candidate_image(slug, "cabinet-skin")
    temporary_skin = paths["root"] / f".cabinet-skin{source.suffix.lower()}"
    shutil.copy2(source, temporary_skin)
    skin_path = paths["skin"].with_suffix(source.suffix.lower())
    temporary_skin.replace(skin_path)
    if old_skin and old_skin != skin_path:
        old_skin.unlink()
    validation = validate_machine_config(config, skin_path)
    spin_audit = run_spin_audit(config)
    status = "ready_for_approval" if validation["passed"] and spin_audit["passed"] else "blocked"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    report = load_json(paths["report"])
    report.update({
        "status": status,
        "cabinetSkin": validation["skin"],
        "skinGeneration": {"method": "operator-supplied", "sourceSha256": sha256(source)},
        "configuration": validation,
        "thirtySpinAudit": spin_audit,
        "updatedAt": now,
    })
    write_json_atomic(paths["report"], report)
    write_json_atomic(paths["status"], {"status": status, "updatedAt": now, "approved": False})
    return report


def check(slug: str, candidate: bool) -> dict[str, Any]:
    slug = slugify(slug)
    if candidate:
        paths = candidate_paths(slug)
        config_path = paths["config"]
        skin_path = find_candidate_image(slug, "cabinet-skin")
    else:
        config_path = PUBLISHED / f"{slug}.json"
        config = load_json(config_path)
        artwork = str(config.get("cabinetArtwork") or "")
        skin_name = artwork.removeprefix("/assets/music-machine/")
        skin_path = PUBLIC_SKINS / skin_name if artwork.startswith("/assets/music-machine/") else None
    config = load_json(config_path)
    validation = validate_machine_config(config, skin_path)
    spin_audit = run_spin_audit(config)
    return {
        "schemaVersion": 1,
        "engineVersion": ENGINE_VERSION,
        "artistSlug": slug,
        "source": "candidate" if candidate else "published",
        "passed": validation["passed"] and spin_audit["passed"],
        "configuration": validation,
        "thirtySpinAudit": spin_audit,
    }


def run_quality_commands() -> None:
    node = shutil.which("node")
    if not node and os.name == "nt":
        bundled_node = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node" / "bin" / "node.exe"
        if bundled_node.is_file():
            node = str(bundled_node)
    if not node:
        raise FactoryError("Node.js is required for the production quality checks")
    node_tests = [str(path.relative_to(ROOT)) for path in sorted((ROOT / "tests").glob("*.test.ts"))]
    commands = [
        [node, "--experimental-strip-types", "scripts/build-github-pages.mjs"],
        [node, "--experimental-strip-types", "--test", *node_tests],
        [sys.executable, "-m", "unittest", "tests.artist_machine_factory_test"],
    ]
    for command in commands:
        completed = subprocess.run(command, cwd=ROOT)
        if completed.returncode:
            raise FactoryError(f"Quality check failed: {' '.join(command)}")


def validate_preview_bundle(public_root: Path, slug: str) -> dict[str, Any]:
    missing = [name for name in PREVIEW_RUNTIME_FILES if not (public_root / "assets" / name).is_file()]
    if missing:
        raise FactoryError(f"Private preview is missing runtime file(s): {', '.join(missing)}")
    registry = load_json(public_root / "artist-machines.json")
    configs = registry.get("artists") or []
    config = next((item for item in configs if isinstance(item, dict) and item.get("artistSlug") == slug), None)
    if not config:
        raise FactoryError(f"Private preview does not contain the {slug} machine configuration")
    catalogue_path = str(config.get("cataloguePath") or "").lstrip("/")
    catalogue = load_json(public_root / catalogue_path)
    tracks = catalogue.get("tracks") or []
    if not tracks:
        raise FactoryError(f"Private preview does not contain playable songs for {slug}")
    artwork_path = str(config.get("cabinetArtwork") or "").lstrip("/")
    if not artwork_path or not (public_root / artwork_path).is_file():
        raise FactoryError(f"Private preview does not contain the generated jukebox skin for {slug}")
    return {
        "artistSlug": slug,
        "artistName": config.get("artistName"),
        "playableSongCount": len(tracks),
        "bandcampArtistUrl": config.get("bandcampArtistUrl"),
        "skin": artwork_path,
        "runtimeFiles": list(PREVIEW_RUNTIME_FILES),
    }


def build_preview(slug: str, output: Path | None = None) -> dict[str, Any]:
    slug = slugify(slug)
    paths = candidate_paths(slug)
    config = load_json(paths["config"])
    skin_path = find_candidate_image(slug, "cabinet-skin")
    validation = validate_machine_config(config, skin_path)
    if not validation["passed"] or skin_path is None:
        raise FactoryError(f"Candidate {slug} needs a passing jukebox skin before preview")
    source_pages = ROOT / "github-pages"
    required = [source_pages / "artist" / "index.html"] + [source_pages / "assets" / name for name in PREVIEW_RUNTIME_FILES]
    if any(not path.is_file() for path in required):
        raise FactoryError("Run the normal site build once before creating a factory preview")
    preview_root = (output or (ROOT / "artifacts" / "artist-machine-factory" / slug / "preview")).resolve()
    public_root = preview_root / "cosmic-aquarium"
    if public_root.exists():
        shutil.rmtree(public_root)
    (public_root / "artist").mkdir(parents=True)
    (public_root / "assets").mkdir(parents=True)
    shutil.copy2(source_pages / "artist" / "index.html", public_root / "artist" / "index.html")
    for name in PREVIEW_RUNTIME_FILES:
        shutil.copy2(source_pages / "assets" / name, public_root / "assets" / name)
    for directory in ("music-machine", "audio", "ticker"):
        source = source_pages / "assets" / directory
        if source.exists():
            shutil.copytree(source, public_root / "assets" / directory)
    try:
        shutil.copy2(source_pages / "discovery.webmanifest", public_root / "discovery.webmanifest")
    except FileNotFoundError:
        pass
    public_skin = public_root / "assets" / "music-machine" / f"{slug}-cabinet{skin_path.suffix.lower()}"
    public_skin.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(skin_path, public_skin)
    preview_config = dict(config)
    preview_config["cabinetArtwork"] = f"/assets/music-machine/{public_skin.name}"
    preview_config["cataloguePath"] = f"/artist-machine-catalogues/{slug}.json"
    preview_config["songCount"] = len(config["songs"])
    preview_config["status"] = "preview"
    catalogue = {
        "schemaVersion": 1,
        "slug": f"artist-machine-{slug}",
        "artist": config["artistName"],
        "releaseTitle": "Bandcamp catalogue",
        "bandcampUrl": config["bandcampArtistUrl"],
        "commerceAvailable": True,
        "commerceUrl": config["bandcampArtistUrl"],
        "bioShort": config.get("bio"),
        "heroArtwork": config.get("heroArtwork"),
        "tracks": config["songs"],
    }
    write_json_atomic(public_root / "artist-machines.json", {"schemaVersion": 1, "artists": [preview_config]})
    write_json_atomic(public_root / "artist-machine-catalogues" / f"{slug}.json", catalogue)
    preview_audit = validate_preview_bundle(public_root, slug)
    return {
        "schemaVersion": 1,
        "artistSlug": slug,
        "previewRoot": str(preview_root),
        "previewPath": f"/cosmic-aquarium/artist/?artist={slug}",
        "previewAudit": preview_audit,
        "passed": True,
    }


def approve(slug: str, approved_by: str, skip_quality_commands: bool) -> dict[str, Any]:
    slug = slugify(slug)
    paths = candidate_paths(slug)
    status = load_json(paths["status"])
    if status.get("status") != "ready_for_approval":
        raise FactoryError(f"Candidate {slug} is not ready for approval")
    config = load_json(paths["config"])
    skin_path = find_candidate_image(slug, "cabinet-skin")
    validation = validate_machine_config(config, skin_path)
    spin_audit = run_spin_audit(config)
    if not validation["passed"] or not spin_audit["passed"] or skin_path is None:
        raise FactoryError("Candidate failed the final approval checks")
    approved_by = clean_text(approved_by, 100, "approved-by", True)
    extension = skin_path.suffix.lower()
    public_skin = PUBLIC_SKINS / f"{slug}-cabinet{extension}"
    destination = PUBLISHED / f"{slug}.json"
    previous_config = destination.read_bytes() if destination.exists() else None
    previous_skin = public_skin.read_bytes() if public_skin.exists() else None
    approved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    config["cabinetArtwork"] = f"/assets/music-machine/{public_skin.name}"
    config["factory"] = {
        "engineVersion": ENGINE_VERSION,
        "approvedAt": approved_at,
        "approvedBy": approved_by,
        "candidateReport": f"automation/artist-machine-factory/candidates/{slug}/report.json",
        "skinSha256": sha256(skin_path),
    }
    try:
        PUBLIC_SKINS.mkdir(parents=True, exist_ok=True)
        PUBLISHED.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skin_path, public_skin)
        write_json_atomic(destination, config)
        if not skip_quality_commands:
            run_quality_commands()
    except Exception:
        if previous_config is None:
            destination.unlink(missing_ok=True)
        else:
            destination.write_bytes(previous_config)
        if previous_skin is None:
            public_skin.unlink(missing_ok=True)
        else:
            public_skin.write_bytes(previous_skin)
        raise
    write_json_atomic(paths["status"], {"status": "approved", "updatedAt": approved_at, "approved": True, "approvedBy": approved_by})
    report = load_json(paths["report"])
    report.update({"status": "approved", "approvedAt": approved_at, "approvedBy": approved_by, "publicUrl": PUBLIC_BASE_URL + slug})
    write_json_atomic(paths["report"], report)
    return report


def print_result(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Create, validate and approve locked-engine Artist Music Machines.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare", help="Build an isolated candidate from a standard intake file")
    prepare_parser.add_argument("--intake", required=True, type=Path)
    prepare_parser.add_argument("--replace", action="store_true")
    skin_parser = subparsers.add_parser("attach-skin", help="Attach and validate an approved jukebox skin")
    skin_parser.add_argument("--slug", required=True)
    skin_parser.add_argument("--skin", required=True, type=Path)
    check_parser = subparsers.add_parser("check", help="Audit a candidate or published machine without changing it")
    check_parser.add_argument("--slug", required=True)
    check_parser.add_argument("--candidate", action="store_true")
    preview_parser = subparsers.add_parser("preview", help="Assemble an isolated local approval preview")
    preview_parser.add_argument("--slug", required=True)
    preview_parser.add_argument("--output", type=Path)
    approve_parser = subparsers.add_parser("approve", help="Promote a passing candidate into the locked live engine")
    approve_parser.add_argument("--slug", required=True)
    approve_parser.add_argument("--approved-by", required=True)
    approve_parser.add_argument("--skip-quality-commands", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = prepare(args.intake, args.replace)
        elif args.command == "attach-skin":
            result = attach_skin(args.slug, args.skin)
        elif args.command == "check":
            result = check(args.slug, args.candidate)
        elif args.command == "preview":
            result = build_preview(args.slug, args.output)
        else:
            result = approve(args.slug, args.approved_by, args.skip_quality_commands)
        print_result(result)
    except (FactoryError, ValueError) as error:
        parser.exit(2, f"Artist Machine Factory stopped safely: {error}\n")


if __name__ == "__main__":
    main()
