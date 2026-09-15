from __future__ import annotations

import dataclasses
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Callable, Iterable

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from festival_discovery_service import clean_artist_name, clean_space, normalise_name


SUPPORTED_POSTER_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
PROJECT_SCHEMA_VERSION = 2

NON_LINEUP_PHRASES = {
    "tickets", "ticket", "buy tickets", "on sale", "doors open", "all ages", "licensed event",
    "festival", "music festival", "presented by", "presents", "sponsored by", "supported by",
    "venue", "location", "program", "programme", "lineup", "line up", "schedule", "timetable",
    "early bird", "general admission", "terms and conditions", "more information", "follow us",
    "official partners", "partners", "food and drink", "camping", "accommodation", "website",
}
NON_LINEUP_WORDS = {
    "ticket", "tickets", "festival", "venue", "sponsor", "partners", "presented", "presents",
    "admission", "doors", "stage", "schedule", "program", "programme", "lineup", "location",
    "www", "http", "com", "org", "au", "friday", "saturday", "sunday", "monday", "january",
    "february", "march", "april", "may", "june", "july", "august", "september", "october",
    "november", "december",
}


@dataclasses.dataclass(frozen=True)
class OcrBlock:
    text: str
    confidence: float
    left: float = 0
    top: float = 0
    width: float = 0
    height: float = 0
    provider: str = "unknown"

    def as_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", clean_space(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalized.casefold()).strip("-")[:72] or "festival"


def validate_poster(path: Path) -> Path:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise ValueError("Choose an existing festival poster image.")
    if path.suffix.casefold() not in SUPPORTED_POSTER_SUFFIXES:
        raise ValueError("Festival posters must be PNG, JPG, JPEG or WEBP images.")
    try:
        with Image.open(path) as image:
            image.verify()
    except Exception as error:
        raise ValueError("The selected poster could not be read as an image.") from error
    return path


def _rapidocr_blocks(image_path: Path) -> list[OcrBlock]:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise RuntimeError("The built-in poster reader is unavailable in this installation.") from error
    engine = RapidOCR()
    result, _elapsed = engine(str(image_path))
    blocks: list[OcrBlock] = []
    for item in result or []:
        if not isinstance(item, (list, tuple)) or len(item) < 3:
            continue
        box, text, confidence = item[:3]
        points = [point for point in (box or []) if isinstance(point, (list, tuple)) and len(point) >= 2]
        xs = [float(point[0]) for point in points] or [0.0]
        ys = [float(point[1]) for point in points] or [0.0]
        blocks.append(OcrBlock(
            text=clean_space(text), confidence=float(confidence or 0), left=min(xs), top=min(ys),
            width=max(xs) - min(xs), height=max(ys) - min(ys), provider="RapidOCR",
        ))
    return blocks


def _tesseract_executable() -> str | None:
    located = shutil.which("tesseract")
    if located:
        return located
    for candidate in (
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Tesseract-OCR" / "tesseract.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR" / "tesseract.exe",
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def _tesseract_blocks(image_path: Path) -> list[OcrBlock]:
    executable = _tesseract_executable()
    if not executable:
        raise RuntimeError("No local OCR engine was found.")
    process = subprocess.run(
        [executable, str(image_path), "stdout", "--psm", "11", "tsv"], check=True, capture_output=True,
        text=True, encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    blocks: list[OcrBlock] = []
    for line in process.stdout.splitlines()[1:]:
        fields = line.split("\t")
        if len(fields) < 12 or not clean_space(fields[11]):
            continue
        try:
            confidence = max(0.0, float(fields[10])) / 100
            left, top, width, height = map(float, fields[6:10])
        except ValueError:
            continue
        blocks.append(OcrBlock(clean_space(fields[11]), confidence, left, top, width, height, "Tesseract"))
    return blocks


def _enhanced_copy(source: Path, destination: Path) -> None:
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw).convert("RGB")
        maximum = max(image.size)
        if maximum < 2200:
            scale = min(3.0, 2200 / max(1, maximum))
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        image = ImageOps.autocontrast(ImageOps.grayscale(image))
        image = ImageEnhance.Contrast(image).enhance(1.5)
        image = image.filter(ImageFilter.SHARPEN)
        image.save(destination, format="PNG", optimize=True)


def read_poster(path: Path, *, provider: Callable[[Path], list[OcrBlock]] | None = None) -> list[OcrBlock]:
    source = validate_poster(path)
    engines: list[Callable[[Path], list[OcrBlock]]] = [provider] if provider else [_rapidocr_blocks, _tesseract_blocks]
    errors: list[str] = []
    combined: list[OcrBlock] = []
    with tempfile.TemporaryDirectory(prefix="aggits-poster-") as temporary:
        enhanced = Path(temporary) / "poster-enhanced.png"
        _enhanced_copy(source, enhanced)
        for engine in engines:
            if engine is None:
                continue
            try:
                combined.extend(engine(source))
                combined.extend(engine(enhanced))
                if combined:
                    break
            except Exception as error:
                errors.append(clean_space(error))
    if not combined:
        detail = "; ".join(dict.fromkeys(errors))
        raise RuntimeError("No readable text was found in the poster." + (f" {detail}" if detail else ""))
    best: dict[str, OcrBlock] = {}
    for block in combined:
        key = normalise_name(block.text)
        if key and (key not in best or block.confidence > best[key].confidence):
            best[key] = block
    return sorted(best.values(), key=lambda item: (round(item.top / 12), item.left))


def _split_artist_line(text: str) -> Iterable[str]:
    text = re.sub(r"\s+(?:\||•|·|/|—|–)\s+", "\n", clean_space(text))
    text = re.sub(r"\s{2,}", "\n", text)
    for value in text.splitlines():
        value = clean_artist_name(value)
        if value:
            yield value


def is_lineup_candidate(text: str, *, festival_name: str = "", year: str = "", location: str = "") -> bool:
    value = clean_space(text)
    normalized = normalise_name(value)
    if not normalized or len(value) < 2 or len(value) > 90 or len(value.split()) > 10:
        return False
    compact = normalized.replace(" ", "")
    if normalized in NON_LINEUP_PHRASES or any(phrase.replace(" ", "") in compact for phrase in ("buy tickets", "ticket", "sponsored by", "presented by", "doors open")):
        return False
    festival_compact = normalise_name(festival_name).replace(" ", "")
    identity_compact = re.sub(r"(?:19|20)\d{2}", "", compact)
    if festival_compact and identity_compact == festival_compact:
        return False
    if location and normalized == normalise_name(location):
        return False
    words = set(normalized.split())
    if words & NON_LINEUP_WORDS and not re.search(r"\b(?:the|and)\b", normalized):
        return False
    if re.search(r"(?:https?://|www\.|\.(?:com|org|net|com\.au)\b|@\w+)", value, flags=re.I):
        return False
    if re.search(r"(?:19|20)\d{2}|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\$\s*\d+", value, flags=re.I):
        return False
    if sum(character.isalpha() for character in value) < 2:
        return False
    return True


def extract_lineup_from_blocks(
    blocks: Iterable[OcrBlock], *, festival_name: str = "", year: str = "", location: str = "",
) -> tuple[list[dict[str, Any]], list[str]]:
    output: list[dict[str, Any]] = []
    rejected: list[str] = []
    best: dict[str, dict[str, Any]] = {}
    for block in blocks:
        for value in _split_artist_line(block.text):
            key = normalise_name(value).replace(" ", "")
            if block.confidence < 0.35 or not is_lineup_candidate(value, festival_name=festival_name, year=year, location=location):
                if value not in rejected:
                    rejected.append(value)
                continue
            candidate = {
                "artistName": value, "ocrConfidence": round(block.confidence, 3), "source": "poster",
                "ocrProvider": block.provider,
            }
            current = best.get(key)
            current_confidence = float(current.get("ocrConfidence") or 0) if current else -1.0
            current_spaces = str(current.get("artistName") or "").count(" ") if current else -1
            prefer_readable = value.count(" ") > current_spaces and block.confidence + 0.08 >= current_confidence
            prefer_confident = block.confidence > current_confidence + 0.08
            if current is None or prefer_readable or prefer_confident:
                best[key] = candidate
    keys = set(best)
    for key, candidate in best.items():
        # Multi-column OCR sometimes joins two otherwise independently detected names.
        joined = any(first != key and second != key and first + second == key for first in keys for second in keys)
        if joined:
            rejected.append(str(candidate["artistName"]))
            continue
        output.append(candidate)
    return output, rejected


def empty_project() -> dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    return {
        "schemaVersion": PROJECT_SCHEMA_VERSION,
        "mode": "festival",
        "projectId": "",
        "festival": {"name": "", "year": "", "website": "", "location": "", "description": ""},
        "poster": {"path": "", "originalName": ""},
        "rawExtractedLineup": [],
        "editedLineup": [],
        "rejectedPosterText": [],
        "bandcampMatches": [],
        "branding": {"logo": "", "headerImage": "", "posterImage": "", "backgroundImage": "", "primaryTitle": "", "subtitle": "", "showWebsiteButton": True},
        "festivalLibrary": None,
        "machineSettings": {},
        "publishedUrl": "",
        "reporting": {"posterArtistsFound": 0, "confirmed": 0, "manual": 0, "notFound": 0, "coveragePercent": 0},
        "createdAt": now,
        "updatedAt": now,
    }


class FestivalProjectStore:
    def __init__(self, root: Path) -> None:
        self.root = root.expanduser().resolve()

    def list_projects(self) -> list[dict[str, Any]]:
        projects: list[dict[str, Any]] = []
        if not self.root.is_dir():
            return projects
        for path in self.root.glob("*/project.json"):
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                if value.get("mode") == "festival":
                    projects.append(value)
            except (OSError, json.JSONDecodeError):
                continue
        return sorted(projects, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)

    def save(self, project: dict[str, Any], *, project_id: str | None = None) -> tuple[dict[str, Any], Path]:
        value = json.loads(json.dumps(project))
        festival = value.get("festival") or {}
        chosen_id = slugify(project_id or value.get("projectId") or f"{festival.get('name', '')}-{festival.get('year', '')}")
        value["schemaVersion"] = PROJECT_SCHEMA_VERSION
        value["mode"] = "festival"
        value["projectId"] = chosen_id
        value["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        value.setdefault("createdAt", value["updatedAt"])
        directory = self.root / chosen_id
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / "project.json"
        temporary = directory / "project.tmp"
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
        return value, destination

    def load(self, project_id: str) -> dict[str, Any]:
        path = self.root / slugify(project_id) / "project.json"
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("mode") != "festival":
            raise ValueError("This is not a Festival Mode project.")
        return value

    def duplicate(self, project_id: str) -> dict[str, Any]:
        source = self.load(project_id)
        copy_id = slugify(f"{project_id}-copy")
        counter = 2
        while (self.root / copy_id).exists():
            copy_id = slugify(f"{project_id}-copy-{counter}")
            counter += 1
        source["projectId"] = copy_id
        source["publishedUrl"] = ""
        source["createdAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        value, _path = self.save(source, project_id=copy_id)
        return value

    def delete(self, project_id: str) -> None:
        target = (self.root / slugify(project_id)).resolve()
        if target.parent != self.root or not target.is_dir():
            raise FileNotFoundError("Festival project not found.")
        shutil.rmtree(target)

    def import_asset(self, project_id: str, source: Path, role: str) -> str:
        source = validate_poster(source)
        safe_role = slugify(role)
        directory = self.root / slugify(project_id) / "assets"
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{safe_role}{source.suffix.casefold()}"
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        return str(destination)


def classification(match_status: str, confidence: float, bandcamp_url: str | None) -> str:
    if not bandcamp_url or match_status in {"not_found", "check_failed"}:
        return "NOT FOUND"
    if match_status == "matched" and confidence >= 0.93:
        return "CONFIRMED"
    if confidence >= 0.82:
        return "LIKELY"
    return "AMBIGUOUS"


def calculate_reporting(project: dict[str, Any]) -> dict[str, Any]:
    lineup = list(project.get("editedLineup") or [])
    matches = list(project.get("bandcampMatches") or [])
    approved = [item for item in matches if item.get("decision") == "approved" and item.get("bandcampUrl")]
    manual = [item for item in approved if item.get("matchMethod") == "manual"]
    not_found = [item for item in matches if item.get("status") == "NOT FOUND"]
    total = len(lineup)
    return {
        "posterArtistsFound": total,
        "confirmed": len(approved) - len(manual),
        "manual": len(manual),
        "notFound": len(not_found),
        "coveragePercent": round((len(approved) / total * 100) if total else 0),
    }


def approved_bandcamp_urls(project: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for item in project.get("bandcampMatches") or []:
        value = clean_space(item.get("bandcampUrl"))
        if item.get("decision") == "approved" and value and value not in urls:
            urls.append(value)
    return urls


def festival_request(project: dict[str, Any], *, header_artwork: str | None = None) -> dict[str, Any]:
    festival = project.get("festival") or {}
    branding = project.get("branding") or {}
    name = clean_space(festival.get("name"))
    year = clean_space(festival.get("year"))
    primary = clean_space(branding.get("primaryTitle")) or f"{name} {year}".strip()
    subtitle = clean_space(branding.get("subtitle")) or "DISCOVERY MACHINE"
    return {
        "title": clean_space(f"{primary} {subtitle}"),
        "slug": project.get("projectId") or slugify(f"{name}-{year}"),
        "festivalName": name,
        "festivalYear": int(year) if year else None,
        "festivalUrl": clean_space(festival.get("website")) or None,
        "festivalSourceUrl": clean_space(festival.get("website")) or None,
        "festivalLocation": clean_space(festival.get("location")) or None,
        "tickerText": clean_space(festival.get("description")),
        "festivalPrimaryTitle": primary,
        "festivalSubtitle": subtitle,
        "showFestivalWebsiteButton": bool(branding.get("showWebsiteButton", True)),
        "machineHeaderArtwork": header_artwork,
        "bandcampUrls": approved_bandcamp_urls(project),
    }
