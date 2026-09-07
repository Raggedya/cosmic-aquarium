from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
from pathlib import Path
from typing import Any

from create_artist import (
    fetch_page,
    tracks_from_payload,
    artist_store_url,
    concise_bio,
    location_from_json_ld,
    page_offers_commerce,
    slugify,
    validate_bandcamp_url,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "automation" / "artist-machines"


def track_key(track: dict[str, Any]) -> str:
    """Collapse repeated single/album representations while retaining distinct versions."""
    title = re.sub(r"\s+", " ", str(track.get("title") or "")).strip().casefold()
    duration = str(track.get("duration") or "")
    return f"{title}|{duration}"


def discover_complete_catalogue(root_url: str, artist: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    root_url = validate_bandcamp_url(root_url)
    root = artist_store_url(root_url)
    if not root:
        raise ValueError("Use an artist-owned Bandcamp URL such as https://yourband.bandcamp.com/")
    profile, final_root = fetch_page(root)
    music, _ = fetch_page(urllib.parse.urljoin(final_root, "/music"))
    release_paths = sorted(profile.album_links | music.album_links)
    if not release_paths:
        raise ValueError("No public Bandcamp releases were found for this artist")
    candidates: list[dict[str, Any]] = []
    release_artwork: dict[str, str] = {}
    bios: list[str] = []
    failed_release_pages: list[str] = []
    for index, release_path in enumerate(release_paths):
        if index:
            time.sleep(0.35)
        page_url = urllib.parse.urljoin(final_root, release_path)
        try:
            parser, final_url = fetch_page(page_url)
        except Exception:
            failed_release_pages.append(page_url)
            continue
        artwork = str(parser.og.get("og:image") or "").strip()
        for payload in parser.tralbum:
            bio = concise_bio((payload.get("current") or {}).get("about"), artist)
            if bio and bio not in bios:
                bios.append(bio)
            tracks = tracks_from_payload(payload, final_url, artist, len(candidates))
            for track in tracks:
                if artwork:
                    track["artworkUrl"] = artwork
                candidates.append(track)
                release_artwork[str(track.get("albumTitle") or "")] = artwork
    if failed_release_pages:
        raise ValueError(
            "The complete Bandcamp catalogue could not be verified. Retry before approval. "
            f"Unavailable release page(s): {', '.join(failed_release_pages[:5])}"
        )
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    excluded_duplicate = 0
    excluded_missing_embed_id = 0
    for track in candidates:
        track_id = str(track.get("bandcampEmbedTrackId") or "")
        if not track_id.isdigit():
            excluded_missing_embed_id += 1
            continue
        key = f"bandcamp-track:{track_id}"
        if key in seen:
            excluded_duplicate += 1
            continue
        seen.add(key)
        unique.append(track)
    if not unique:
        raise ValueError("No playable Bandcamp tracks were found")
    metadata = {
        "bio": bios[0] if bios else concise_bio(profile.og.get("og:description"), artist),
        "location": location_from_json_ld(profile),
        "heroArtwork": next((value for value in release_artwork.values() if value), None),
        "commerceAvailable": page_offers_commerce(profile) or page_offers_commerce(music),
        "source": final_root,
        "catalogueAudit": {
            "releasePageCount": len(release_paths),
            "candidateTrackCount": len(candidates),
            "playableTrackCount": len(unique),
            "excluded": {
                "duplicateTrackId": excluded_duplicate,
                "missingEmbedTrackId": excluded_missing_embed_id,
            },
        },
    }
    return unique, metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a reusable Artist Music Machine configuration from a public Bandcamp catalogue.")
    parser.add_argument("--artist", required=True)
    parser.add_argument("--bandcamp", required=True)
    parser.add_argument("--city", default="")
    parser.add_argument("--slug", default="")
    args = parser.parse_args()
    artist = " ".join(args.artist.split()).strip()
    artist_slug = slugify(args.slug or artist)
    tracks, metadata = discover_complete_catalogue(args.bandcamp, artist)
    config = {
        "machineMode": "artist",
        "artistSlug": artist_slug,
        "artistName": artist,
        "city": " ".join(args.city.split()).strip() or metadata["location"] or None,
        "bandcampArtistUrl": artist_store_url(validate_bandcamp_url(args.bandcamp)),
        "songs": tracks,
        "bio": metadata["bio"] or None,
        "tickerCopy": [],
        "heroArtwork": metadata["heroArtwork"],
        "accentTheme": "amber-burgundy",
        "provenance": {"source": metadata["source"], "method": "public-bandcamp-catalogue"},
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / f"{artist_slug}.json"
    destination.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {destination} with {len(tracks)} unique playable song(s).")


if __name__ == "__main__":
    main()
