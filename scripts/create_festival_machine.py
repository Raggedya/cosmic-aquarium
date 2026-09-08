from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import time
import urllib.parse
from pathlib import Path
from typing import Any, Callable

from create_artist import artist_store_url, fetch_page, slugify, validate_bandcamp_url
from create_artist_machine import discover_complete_catalogue
from festival_discovery_service import MAX_FESTIVAL_ARTISTS, clean_space, validate_public_url
from qr_artwork import render_qr_artwork


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "automation" / "festival-machines"
QR_OUTPUT = ROOT / "github-pages" / "festival-qr"
PAGES_BASE = "https://raggedya.github.io/cosmic-aquarium"


def resolve_bandcamp_artist_name(url: str) -> str:
    profile, _ = fetch_page(url)
    for payload in profile.tralbum:
        for value in (payload.get("artist"), (payload.get("current") or {}).get("band_name"), payload.get("band_name")):
            name = clean_space(value)
            if name:
                return name
    title = clean_space(profile.og.get("og:title"))
    title = re.sub(r"\s*[|–-]\s*Bandcamp\s*$", "", title, flags=re.I)
    title = re.sub(r"^(?:Music|Albums|Tracks)\s*[|·–-]\s*", "", title, flags=re.I)
    if title:
        return title.split("|")[0].strip()
    host = urllib.parse.urlparse(url).hostname or ""
    return host.removesuffix(".bandcamp.com").replace("-", " ").replace("_", " ").title()


def normalise_request(value: dict[str, Any]) -> dict[str, Any]:
    title = clean_space(value.get("title"))
    if not title:
        raise ValueError("Title is required")
    if len(title) > 120:
        raise ValueError("Title must be 120 characters or fewer")
    ticker = clean_space(value.get("tickerText"))
    if len(ticker) > 1000:
        raise ValueError("Ticker text must be 1,000 characters or fewer")
    raw_urls = value.get("bandcampUrls")
    if not isinstance(raw_urls, list):
        raise ValueError("bandcampUrls must be a list")
    urls: list[str] = []
    for raw in raw_urls:
        validated = artist_store_url(validate_bandcamp_url(clean_space(raw)))
        if not validated:
            raise ValueError("Every entry must be an artist-owned Bandcamp URL")
        if validated not in urls:
            urls.append(validated)
    if not urls:
        raise ValueError("At least one Bandcamp URL is required")
    if len(urls) > MAX_FESTIVAL_ARTISTS:
        raise ValueError(f"A festival machine supports a maximum of {MAX_FESTIVAL_ARTISTS} Bandcamp artists")
    year = value.get("festivalYear")
    if year not in (None, ""):
        year = int(year)
        if not 1950 <= year <= 2100:
            raise ValueError("Festival year must be between 1950 and 2100")
    else:
        year = None
    festival_url = clean_space(value.get("festivalUrl"))
    source_url = clean_space(value.get("festivalSourceUrl"))
    header_artwork = clean_space(value.get("machineHeaderArtwork") or value.get("festivalPlaqueImage") or value.get("festivalHeroImage"))
    if festival_url:
        festival_url = validate_public_url(festival_url)
    if source_url:
        source_url = validate_public_url(source_url)
    if header_artwork:
        if header_artwork.startswith("/"):
            if not re.fullmatch(r"/assets/[A-Za-z0-9_./-]+\.(?:avif|jpe?g|png|webp)", header_artwork, flags=re.I):
                raise ValueError("Machine header artwork must be a valid published image path or HTTPS URL")
        else:
            header_artwork = validate_public_url(header_artwork)
    return {
        "title": title,
        "festivalSlug": slugify(clean_space(value.get("slug")) or title),
        "festivalName": clean_space(value.get("festivalName")) or title,
        "festivalYear": year,
        "festivalUrl": festival_url or None,
        "festivalSourceUrl": source_url or None,
        "festivalDates": clean_space(value.get("festivalDates")) or None,
        "festivalLocation": clean_space(value.get("festivalLocation")) or None,
        "festivalTickerText": ticker,
        "machineHeaderArtwork": header_artwork or None,
        "bandcampUrls": urls,
    }


def _import_artist(url: str) -> dict[str, Any]:
    artist_name = resolve_bandcamp_artist_name(url)
    songs, metadata = discover_complete_catalogue(url, artist_name)
    artist_slug = slugify(artist_name)
    normalized_songs: list[dict[str, Any]] = []
    for song in songs:
        normalized_songs.append({
            **song,
            "id": f"{artist_slug}-{song.get('id') or song.get('bandcampEmbedTrackId')}",
            "artist": artist_name,
            "artistBandcampUrl": url,
        })
    return {
        "artistName": artist_name,
        "bandcampUrl": url,
        "songCount": len(normalized_songs),
        "heroArtwork": metadata.get("heroArtwork"),
        "songs": normalized_songs,
    }


def build_festival_config(
    request: dict[str, Any],
    *,
    importer: Callable[[str], dict[str, Any]] = _import_artist,
) -> dict[str, Any]:
    normalized = normalise_request(request)
    imported: list[dict[str, Any] | None] = [None] * len(normalized["bandcampUrls"])
    failures: list[dict[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="festival-catalogue") as executor:
        futures = {executor.submit(importer, url): index for index, url in enumerate(normalized["bandcampUrls"])}
        for future in concurrent.futures.as_completed(futures):
            index = futures[future]
            url = normalized["bandcampUrls"][index]
            try:
                imported[index] = future.result()
            except Exception as error:
                failures.append({"bandcampUrl": url, "reason": clean_space(error)[:300]})
    successful = [item for item in imported if item]
    if not successful:
        raise ValueError("No playable Bandcamp catalogues could be imported")
    songs: list[dict[str, Any]] = []
    seen_track_ids: set[str] = set()
    for artist in successful:
        for song in artist["songs"]:
            embed_id = str(song.get("bandcampEmbedTrackId") or "")
            if not embed_id.isdigit() or embed_id in seen_track_ids:
                continue
            seen_track_ids.add(embed_id)
            songs.append(song)
    if not songs:
        raise ValueError("The selected Bandcamp profiles contain no playable tracks")
    return {
        "schemaVersion": 1,
        "machineMode": "festival",
        "festivalSlug": normalized["festivalSlug"],
        "title": normalized["title"],
        "festivalName": normalized["festivalName"],
        "festivalYear": normalized["festivalYear"],
        "festivalUrl": normalized["festivalUrl"],
        "festivalSourceUrl": normalized["festivalSourceUrl"],
        "festivalDates": normalized["festivalDates"],
        "festivalLocation": normalized["festivalLocation"],
        "festivalTickerText": normalized["festivalTickerText"],
        "machineHeaderArtwork": normalized["machineHeaderArtwork"],
        "tickerCopy": [normalized["festivalTickerText"]] if normalized["festivalTickerText"] else [],
        "bandcampUrls": normalized["bandcampUrls"],
        "artists": [{key: value for key, value in artist.items() if key != "songs"} for artist in successful],
        "songs": songs,
        "heroArtwork": next((artist.get("heroArtwork") for artist in successful if artist.get("heroArtwork")), None),
        "accentTheme": "emerald-gold",
        "importFailures": failures,
        "provenance": {
            "method": "festival-selected-bandcamp-catalogues",
            "source": normalized["festivalSourceUrl"] or normalized["festivalUrl"],
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


def create_festival_machine(request: dict[str, Any], *, generate_qr: bool = True) -> dict[str, Any]:
    config = build_festival_config(request)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / f"{config['festivalSlug']}.json"
    destination.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    edition = re.sub(r"[^A-Za-z0-9_-]", "", clean_space(request.get("cacheKey"))) or time.strftime("%Y%m%d%H%M%S", time.gmtime())
    page_url = f"{PAGES_BASE}/festival/?festival={urllib.parse.quote(config['festivalSlug'])}&edition={edition}"
    qr_path = QR_OUTPUT / f"{config['festivalSlug']}.png"
    if generate_qr:
        QR_OUTPUT.mkdir(parents=True, exist_ok=True)
        render_qr_artwork(config["title"], page_url, qr_path, ROOT / "public" / "flowers", visual_style="glass", verify=True)
    return {
        "slug": config["festivalSlug"],
        "title": config["title"],
        "page_url": page_url,
        "qr_path": str(qr_path.relative_to(ROOT)).replace("\\", "/") if generate_qr else "",
        "qr_url": f"{PAGES_BASE}/festival-qr/{urllib.parse.quote(config['festivalSlug'])}.png?edition={edition}",
        "artists": len(config["artists"]),
        "tracks": len(config["songs"]),
        "failedArtists": config["importFailures"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an AGGITS festival music machine from reviewed Bandcamp profiles")
    parser.add_argument("--request-json", required=True)
    parser.add_argument("--skip-qr", action="store_true")
    args = parser.parse_args()
    request = json.loads(Path(args.request_json).read_text(encoding="utf-8"))
    print(json.dumps(create_festival_machine(request, generate_qr=not args.skip_qr), ensure_ascii=False))


if __name__ == "__main__":
    main()
