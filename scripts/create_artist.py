from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from qr_artwork import render_qr_artwork


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "github-pages"
TEMPLATE = ROOT / "templates" / "artist-index.html"
COLORS = ("#c3b4f4", "#88d7ff", "#ff6f8f", "#ffb66d", "#8fd9c7", "#a492ff")
AUTOMATED_VISUAL_STYLES = ("cosmic", "violet")
CUSTOM_VISUAL_STYLES = (*AUTOMATED_VISUAL_STYLES, "chrome", "glass")
VISUAL_STYLES = CUSTOM_VISUAL_STYLES
MINIMUM_TRACK_COUNT = 1
USER_AGENT = "CosmicAquariumCreator/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"


class BandcampPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tralbum: list[dict[str, Any]] = []
        self.album_links: set[str] = set()
        self.has_merch_link = False
        self.og: dict[str, str] = {}
        self.tags: list[str] = []
        self._capture_tag = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if "data-tralbum" in values and values["data-tralbum"]:
            try:
                self.tralbum.append(json.loads(html.unescape(values["data-tralbum"] or "")))
            except (json.JSONDecodeError, TypeError):
                pass
        href = values.get("href") or ""
        if tag == "a" and re.match(r"^/(album|track)/[^?#]+$", href):
            self.album_links.add(href)
        if tag == "a" and (href == "/merch" or href.startswith("/merch/")):
            self.has_merch_link = True
        classes = set((values.get("class") or "").split())
        if tag == "a" and "tag" in classes:
            self._capture_tag = True
        if tag == "meta" and values.get("property", "").startswith("og:") and values.get("content"):
            self.og[values["property"] or ""] = values["content"] or ""

    def handle_data(self, data: str) -> None:
        if self._capture_tag:
            value = " ".join(data.split()).strip()
            if value and value not in self.tags:
                self.tags.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a":
            self._capture_tag = False


def slugify(value: str) -> str:
    normal = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normal.lower()).strip("-")
    if not slug:
        raise ValueError("Artist title must contain letters or numbers")
    return slug[:72].rstrip("-")


def validate_bandcamp_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username or parsed.password or not (host == "bandcamp.com" or host.endswith(".bandcamp.com")):
        raise ValueError("Enter a valid HTTPS Bandcamp URL")
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", ""))


def fetch_page(url: str) -> tuple[BandcampPageParser, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if "text/html" not in (response.headers.get_content_type() or ""):
            raise ValueError("Bandcamp did not return an HTML page")
        body = response.read(4_000_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
        final_url = response.geturl()
    parser = BandcampPageParser()
    parser.feed(body)
    return parser, final_url


def payload_offers_commerce(payload: dict[str, Any]) -> bool:
    current = payload.get("current") or {}
    has_price = any(current.get(key) is not None for key in ("minimum_price", "set_price", "purchase_url"))
    return bool(has_price or payload.get("packages"))


def page_offers_commerce(parser: BandcampPageParser) -> bool:
    return parser.has_merch_link or any(payload_offers_commerce(payload) for payload in parser.tralbum)


def artist_store_url(value: str) -> str | None:
    parsed = urllib.parse.urlparse(value)
    host = (parsed.hostname or "").lower()
    if host == "bandcamp.com" or not host.endswith(".bandcamp.com"):
        return None
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def duration_label(value: Any) -> str:
    try:
        seconds = max(0, int(float(value)))
    except (TypeError, ValueError):
        return ""
    return f"{seconds // 60}:{seconds % 60:02d}"


def year_from(value: Any) -> int:
    match = re.search(r"(19|20)\d{2}", str(value or ""))
    return int(match.group(0)) if match else 0


def release_date_from_payload(payload: dict[str, Any]) -> str:
    current = payload.get("current") or {}
    return str(current.get("release_date") or payload.get("album_release_date") or "").strip()


def normalize_release_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    iso_match = re.match(r"^(19|20)\d{2}-\d{2}-\d{2}", text)
    if iso_match:
        return f"{iso_match.group(0)} 00:00:00 UTC"
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError, OverflowError):
        return ""
    return parsed.strftime("%Y-%m-%d 00:00:00 UTC")


def halton(index: int, base: int) -> float:
    result, fraction, remaining = 0.0, 1.0, index
    while remaining > 0:
        fraction /= base
        result += fraction * (remaining % base)
        remaining //= base
    return result


def tracks_from_payload(payload: dict[str, Any], page_url: str, artist: str, start_index: int) -> list[dict[str, Any]]:
    current = payload.get("current") or {}
    album_title = str(current.get("title") or payload.get("album_title") or "Bandcamp")
    album_key = slugify(album_title)
    year = year_from(current.get("release_date") or payload.get("album_release_date"))
    tracks: list[dict[str, Any]] = []
    for offset, item in enumerate(payload.get("trackinfo") or []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        track_id = str(item.get("track_id") or "").strip()
        if not title:
            continue
        link = urllib.parse.urljoin(page_url, str(item.get("title_link") or ""))
        if not validate_possible_track_link(link):
            link = page_url
        index = start_index + len(tracks) + 1
        tracks.append({
            "id": f"{album_key}-{track_id or index}",
            "title": title,
            "artist": artist,
            "albumTitle": album_title,
            "albumKey": album_key,
            "year": year,
            "trackNumber": int(item.get("track_num") or offset + 1),
            "duration": duration_label(item.get("duration")),
            "x": round(0.075 + halton(index, 2) * 0.85, 6),
            "y": round(0.075 + halton(index, 3) * 0.85, 6),
            "zone": "Uncharted song field",
            "note": "Public Bandcamp track",
            "bandcampUrl": link,
            "bandcampEmbedTrackId": track_id if track_id.isdigit() else "",
            "sourcePage": page_url,
            "accent": COLORS[(index - 1) % len(COLORS)],
        })
    return tracks


def validate_possible_track_link(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and (host == "bandcamp.com" or host.endswith(".bandcamp.com"))
    except ValueError:
        return False


def discover_tracks(url: str, artist: str) -> tuple[list[dict[str, Any]], str, bool, str | None, str, list[str]]:
    parser, final_url = fetch_page(url)
    commerce_available = page_offers_commerce(parser)
    commerce_url = artist_store_url(final_url)
    tracks: list[dict[str, Any]] = []
    release_date = ""
    for payload in parser.tralbum:
        release_date = release_date or release_date_from_payload(payload)
        tracks.extend(tracks_from_payload(payload, final_url, artist, len(tracks)))
    page_tracks = deduplicate(tracks)
    if len(page_tracks) >= MINIMUM_TRACK_COUNT:
        return page_tracks, final_url, bool(commerce_url and commerce_available), commerce_url if commerce_available else None, release_date, parser.tags

    # A submitted release/track URL must prove that exact edition is playable.
    # Only an artist-root manual import may search the artist's wider catalogue.
    if re.match(r"^/(album|track)/", urllib.parse.urlparse(final_url).path):
        return [], final_url, bool(commerce_url and commerce_available), commerce_url if commerce_available else None, release_date, parser.tags

    origin = urllib.parse.urlunparse(urllib.parse.urlparse(final_url)._replace(path="", params="", query="", fragment=""))
    music_parser, _ = fetch_page(origin.rstrip("/") + "/music")
    commerce_available = commerce_available or page_offers_commerce(music_parser)
    candidates = sorted(music_parser.album_links)[:12]
    for path in candidates:
        time.sleep(0.35)
        page_url = urllib.parse.urljoin(origin + "/", path)
        try:
            album_parser, album_url = fetch_page(page_url)
        except Exception:
            continue
        commerce_available = commerce_available or page_offers_commerce(album_parser)
        for payload in album_parser.tralbum:
            release_date = release_date or release_date_from_payload(payload)
            tracks.extend(tracks_from_payload(payload, album_url, artist, len(tracks)))
        if len(tracks) >= 60:
            break
    return deduplicate(tracks[:60]), final_url, bool(commerce_url and commerce_available), commerce_url if commerce_available else None, release_date, parser.tags


def deduplicate(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for track in tracks:
        key = track["bandcampUrl"] + "|" + track["title"]
        if key not in seen:
            seen.add(key)
            result.append(track)
    return result


def render_html(slug: str, artist: str) -> str:
    template = TEMPLATE.read_text(encoding="utf-8")
    escaped = html.escape(artist)
    digest = hashlib.sha256()
    digest.update((ROOT / "app" / "cosmic-aquarium.css").read_bytes())
    digest.update((PAGES / "assets" / "site.js").read_bytes())
    asset_version = digest.hexdigest()[:12]
    return (template.replace("{{SLUG}}", html.escape(slug, quote=True))
            .replace("{{ARTIST}}", escaped)
            .replace("{{ARTIST_UPPER}}", html.escape(artist.upper()))
            .replace("{{BASE}}", "/cosmic-aquarium")
            .replace("{{ASSET_VERSION}}", asset_version))


def persist_artist_files(slug: str, artist: str, manifest: dict[str, Any]) -> None:
    manifest_directory = PAGES / "artists"
    page_directory = PAGES / slug
    manifest_directory.mkdir(parents=True, exist_ok=True)
    page_directory.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_directory / f"{slug}.json"
    page_path = page_directory / "index.html"
    manifest_temp = manifest_path.with_suffix(".json.tmp")
    page_temp = page_path.with_suffix(".html.tmp")
    manifest_temp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    page_temp.write_text(render_html(slug, artist), encoding="utf-8")
    manifest_temp.replace(manifest_path)
    page_temp.replace(page_path)


def create_artist(
    title: str,
    bandcamp_url: str,
    visual_style: str,
    base_url: str,
    verify_qr: bool = True,
    cache_key: str = "",
    slug_override: str = "",
    release_title: str = "",
    release_date: str = "",
    batch_id: str = "",
    generate_qr: bool = True,
    metadata_tags: list[str] | None = None,
    waters: list[str] | None = None,
    primary_location: str = "",
    persist: bool = True,
) -> dict[str, Any]:
    artist = " ".join(title.split())
    if not artist:
        raise ValueError("Artist title is required")
    destination_source = validate_bandcamp_url(bandcamp_url)
    if visual_style not in VISUAL_STYLES:
        raise ValueError("Unknown visual style")
    slug = slugify(slug_override) if slug_override else slugify(artist)
    try:
        tracks, resolved_url, commerce_available, commerce_url, discovered_release_date, discovered_tags = discover_tracks(destination_source, artist)
        import_status = "public-page-manifest" if tracks else "official-link-fallback"
    except Exception:
        tracks, resolved_url, commerce_available, commerce_url, discovered_release_date, discovered_tags, import_status = [], destination_source, False, None, "", [], "official-link-fallback"

    if len(tracks) < MINIMUM_TRACK_COUNT:
        raise ValueError(
            f"Cosmic Aquaria requires at least {MINIMUM_TRACK_COUNT} publicly available Bandcamp songs; "
            f"only {len(tracks)} could be verified for {artist}."
        )

    albums: dict[str, str] = {}
    for track in tracks:
        albums.setdefault(track["albumKey"], track["accent"])
    from water_classifier import classify_waters, valid_waters
    merged_tags = list(dict.fromkeys([*(metadata_tags or []), *discovered_tags]))
    assigned_waters = valid_waters(waters) or classify_waters(
        merged_tags, f"{artist} {release_title}", f"{artist}:{release_title}:{resolved_url}"
    )
    manifest = {
        "schemaVersion": 1,
        "slug": slug,
        "artist": artist,
        "bandcampUrl": resolved_url,
        "releaseTitle": release_title or (tracks[0]["albumTitle"] if tracks else "Bandcamp"),
        "releaseDate": normalize_release_date(release_date or discovered_release_date) or None,
        "dailyBatchId": batch_id or None,
        "status": "published",
        "metadataTags": merged_tags,
        "primaryLocation": " ".join(primary_location.split()) or None,
        "waters": assigned_waters,
        "commerceAvailable": commerce_available,
        "commerceUrl": commerce_url,
        "visualStyle": visual_style,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "importStatus": import_status,
        "albums": [{"key": key, "color": color} for key, color in albums.items()],
        "tracks": tracks,
    }
    if persist:
        persist_artist_files(slug, artist, manifest)

    edition_key = re.sub(r"[^A-Za-z0-9_-]", "", cache_key) or time.strftime("%Y%m%d%H%M%S", time.gmtime())
    destination = base_url.rstrip("/") + "/" + urllib.parse.quote(slug) + "/?edition=" + urllib.parse.quote(edition_key)
    qr_path = PAGES / slug / "cosmic-aquarium-qr.png"
    if generate_qr:
        render_qr_artwork(artist, destination, qr_path, ROOT / "public" / "flowers", visual_style=visual_style, verify=verify_qr)
    result = {
        "slug": slug,
        "artist": artist,
        "page_url": destination,
        "qr_path": str(qr_path.relative_to(ROOT)).replace("\\", "/") if generate_qr else "",
        "tracks": len(tracks),
        "import_status": import_status,
        "commerce_available": commerce_available,
        "visual_style": visual_style,
        "waters": assigned_waters,
        "metadata_tags": merged_tags,
        "_manifest": manifest if not persist else None,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Cosmic Aquaria artist edition")
    parser.add_argument("--title", required=True)
    parser.add_argument("--bandcamp-url", required=True)
    parser.add_argument("--visual-style", choices=VISUAL_STYLES, default="cosmic")
    parser.add_argument("--base-url", default="https://raggedya.github.io/cosmic-aquarium")
    parser.add_argument("--cache-key", default="")
    parser.add_argument("--release-title", default="")
    parser.add_argument("--release-date", default="")
    parser.add_argument("--location", default="")
    parser.add_argument("--water", action="append", choices=("heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange"), default=[])
    parser.add_argument("--skip-qr-verification", action="store_true")
    args = parser.parse_args()
    result = create_artist(
        args.title,
        args.bandcamp_url,
        args.visual_style,
        args.base_url,
        not args.skip_qr_verification,
        args.cache_key,
        release_title=args.release_title,
        release_date=args.release_date,
        waters=args.water,
        primary_location=args.location,
    )
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
