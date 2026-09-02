"""One-time, resumable expansion of the Cosmic Aquaria release library.

Unlike the daily twenty-release job, this command samples independent Bandcamp
Discover feeds for every Cosmic Aquaria water and always fills the least
represented water first. Every release still passes through create_artist(),
which enforces the three-public-track minimum and writes verified manifests.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import shutil
import time
import urllib.parse
import urllib.request
from collections import Counter, deque
from pathlib import Path
from typing import Any

from create_artist import AUTOMATED_VISUAL_STYLES, create_artist, slugify
from daily_discovery import canonical_bandcamp_url, read_json, write_json
from water_classifier import WATERS, classify_waters


ROOT = Path(__file__).resolve().parents[1]
ARTISTS = ROOT / "github-pages" / "artists"
BATCHES = ROOT / "automation" / "batches"
HISTORY = ROOT / "automation" / "releases.json"
DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web"
USER_AGENT = "CosmicAquariumBackfill/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"
PAGE_SIZE = 60

# These are broad discovery waters, not listener-facing genre taxonomies. Each
# feed uses a recognized Bandcamp tag and is assigned to its corresponding water.
WATER_TAGS = {
    "heavy": ("metal", "doom", "sludge", "hardcore"),
    "dreamy": ("shoegaze", "dream-pop", "ethereal", "psychedelic"),
    "electronic": ("electronic", "techno", "idm", "house"),
    "quiet": ("ambient", "acoustic", "folk", "piano"),
    "loud": ("punk", "noise-rock", "garage-rock", "post-hardcore"),
    "dark": ("darkwave", "goth", "dark-ambient", "post-punk"),
    "strange": ("experimental", "avant-garde", "sound-art", "musique-concrete"),
}


class WaterFeed:
    def __init__(self, water: str) -> None:
        self.water = water
        self.tags = WATER_TAGS[water]
        self.tag_index = 0
        self.cursor: str | None = None
        self.items: deque[tuple[dict[str, Any], str]] = deque()
        self.exhausted = False

    def refill(self) -> None:
        if self.exhausted:
            return
        tag = self.tags[self.tag_index]
        payload = {
            "category_id": 0,
            "tag_norm_names": [tag],
            "geoname_id": 0,
            "slice": "new",
            "time_facet_id": None,
            "cursor": self.cursor,
            "size": PAGE_SIZE,
            "include_result_types": ["a"],
            "followed_bands": False,
        }
        request = urllib.request.Request(
            DISCOVER_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json; charset=UTF-8", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.load(response)
        for item in body.get("results", []):
            if isinstance(item, dict) and item.get("item_type") == "a":
                self.items.append((item, tag))
        next_cursor = body.get("cursor")
        if next_cursor and next_cursor != self.cursor:
            self.cursor = str(next_cursor)
        else:
            self.tag_index += 1
            self.cursor = None
            if self.tag_index >= len(self.tags):
                self.exhausted = True
        time.sleep(0.35)

    def next(self) -> tuple[dict[str, Any], str] | None:
        while not self.items and not self.exhausted:
            self.refill()
        return self.items.popleft() if self.items else None


def existing_inventory() -> tuple[set[str], set[str], Counter[str]]:
    urls: set[str] = set()
    artists: set[str] = set()
    water_counts: Counter[str] = Counter()
    for manifest_path in ARTISTS.glob("*.json"):
        manifest = read_json(manifest_path, {})
        if manifest.get("bandcampUrl"):
            urls.add(canonical_bandcamp_url(str(manifest["bandcampUrl"])))
        if manifest.get("artist"):
            artists.add(str(manifest["artist"]).strip().casefold())
        if manifest.get("status", "published") == "published":
            assigned = [water for water in manifest.get("waters", []) if water in WATERS]
            if not assigned:
                assigned = classify_waters(
                    manifest.get("metadataTags") or [],
                    f"{manifest.get('artist', '')} {manifest.get('releaseTitle', '')}",
                    str(manifest.get("slug") or manifest_path.stem),
                )
            water_counts.update(assigned)
    return urls, artists, water_counts


def artist_for(item: dict[str, Any]) -> str:
    return str(item.get("album_artist") or item.get("band_name") or "").strip()


def acceptable(item: dict[str, Any], today: dt.date, completed_urls: set[str], completed_artists: set[str]) -> bool:
    url = canonical_bandcamp_url(str(item.get("item_url") or ""))
    artist = artist_for(item)
    if not url.startswith("https://") or url in completed_urls or not artist or artist.casefold() in completed_artists:
        return False
    if item.get("is_free_download") is True or item.get("is_album_preorder") is True:
        return False
    try:
        if int(item.get("track_count") or 0) < 3:
            return False
    except (TypeError, ValueError):
        return False
    release_text = str(item.get("release_date") or "")[:10]
    try:
        release_date = dt.date.fromisoformat(release_text)
    except ValueError:
        return False
    return dt.date(2000, 1, 1) <= release_date <= today


def prune_archival_outliers(batch_id: str, batch: dict[str, Any], history: dict[str, Any]) -> None:
    """Remove pre-2000 records created by this resumable backfill so they can be replaced."""
    invalid_ids: set[str] = set()
    for record in batch.get("aquariums", []):
        release_text = str(record.get("releaseDate") or "")[:10]
        try:
            release_date = dt.date.fromisoformat(release_text)
        except ValueError:
            release_date = dt.date.min
        if release_date < dt.date(2000, 1, 1):
            invalid_ids.add(str(record.get("id") or ""))
    for aquarium_id in invalid_ids:
        manifest_path = ARTISTS / f"{aquarium_id}.json"
        manifest = read_json(manifest_path, {})
        if manifest.get("dailyBatchId") == batch_id:
            manifest_path.unlink(missing_ok=True)
            shutil.rmtree(ROOT / "github-pages" / aquarium_id, ignore_errors=True)
    if invalid_ids:
        batch["aquariums"] = [record for record in batch.get("aquariums", []) if record.get("id") not in invalid_ids]
        history["releases"] = [record for record in history.get("releases", []) if record.get("id") not in invalid_ids]
        batch.setdefault("failures", []).append({
            "reason": f"Replaced {len(invalid_ids)} pre-2000 archival release(s) surfaced by the new-release feed",
            "ids": sorted(invalid_ids),
        })


def run(target_total: int, batch_id: str) -> dict[str, Any]:
    today = dt.datetime.now(dt.timezone.utc).date()
    batch_path = BATCHES / f"{batch_id}.json"
    history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
    saved_batch = read_json(batch_path, {})
    if saved_batch:
        prune_archival_outliers(batch_id, saved_batch, history)
        write_json(batch_path, saved_batch)
        write_json(HISTORY, history)
    completed_urls, completed_artists, water_counts = existing_inventory()
    initial_total = len(list(ARTISTS.glob("*.json")))
    required = max(0, target_total - initial_total)
    batch = read_json(batch_path, {
        "schemaVersion": 1,
        "id": batch_id,
        "batchDate": today.isoformat(),
        "purpose": f"Balanced one-time library expansion to {target_total}",
        "targetCount": required,
        "targetLibraryCount": target_total,
        "startingLibraryCount": initial_total,
        "status": "discovering",
        "generatedCount": 0,
        "publishedCount": 0,
        "emailStatus": "not-applicable",
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "aquariums": [],
        "failures": [],
    })
    batch["targetLibraryCount"] = target_total
    batch["targetCount"] = max(0, target_total - int(batch.get("startingLibraryCount", initial_total)))
    for record in batch.get("aquariums", []):
        if record.get("bandcampUrl"):
            completed_urls.add(canonical_bandcamp_url(str(record["bandcampUrl"])))
        if record.get("artist"):
            completed_artists.add(str(record["artist"]).casefold())
    feeds = {water: WaterFeed(water) for water in WATERS}

    def save() -> None:
        batch["generatedCount"] = len(batch["aquariums"])
        batch["publishedCount"] = len(batch["aquariums"])
        batch["waterCounts"] = dict(sorted(water_counts.items()))
        current_total = len(list(ARTISTS.glob("*.json")))
        batch["currentLibraryCount"] = current_total
        batch["status"] = "published" if current_total >= target_total else "generation_pending"
        write_json(batch_path, batch)
        write_json(HISTORY, history)

    while len(list(ARTISTS.glob("*.json"))) < target_total:
        available = [water for water in WATERS if not feeds[water].exhausted]
        if not available:
            break
        water = min(available, key=lambda value: (water_counts[value], WATERS.index(value)))
        candidate = feeds[water].next()
        if candidate is None:
            continue
        item, source_tag = candidate
        if not acceptable(item, today, completed_urls, completed_artists):
            continue
        artist = artist_for(item)
        release = str(item.get("title") or "").strip()
        url = canonical_bandcamp_url(str(item.get("item_url") or ""))
        if not release:
            continue
        try:
            aquarium_slug = slugify(f"{artist}-{release}")
        except ValueError:
            batch["failures"].append({
                "artist": artist,
                "release": release,
                "bandcampUrl": url,
                "sourceWater": water,
                "reason": "Artist and release text cannot form a stable URL slug",
            })
            continue
        existing_manifest = read_json(ARTISTS / f"{aquarium_slug}.json", {})
        if existing_manifest and canonical_bandcamp_url(str(existing_manifest.get("bandcampUrl") or "")) != url:
            aquarium_slug = f"{aquarium_slug}-{hashlib.sha256(url.encode()).hexdigest()[:8]}"
        sequence = len(batch["aquariums"])
        related_waters = classify_waters([source_tag], f"{artist} {release}", url)
        assigned_waters = list(dict.fromkeys([water, *related_waters]))[:3]
        try:
            result = create_artist(
                artist,
                url,
                AUTOMATED_VISUAL_STYLES[sequence % len(AUTOMATED_VISUAL_STYLES)],
                "https://raggedya.github.io/cosmic-aquarium",
                verify_qr=False,
                cache_key=batch_id,
                slug_override=aquarium_slug,
                release_title=release,
                release_date=str(item.get("release_date") or ""),
                batch_id=batch_id,
                generate_qr=False,
                metadata_tags=[source_tag],
                waters=assigned_waters,
            )
            record = {
                "id": aquarium_slug,
                "artist": artist,
                "release": release,
                "sourceIdentifier": str(item.get("item_id") or ""),
                "bandcampUrl": url,
                "releaseDate": str(item.get("release_date") or ""),
                "artworkReference": (item.get("primary_image") or {}).get("image_id"),
                "tags": [source_tag],
                "waters": result["waters"],
                "sourceWater": water,
                "discoveredAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "aquariumUrl": result["page_url"].split("?", 1)[0],
                "visualStyle": result["visual_style"],
                "trackCount": result["tracks"],
                "status": "published",
            }
            batch["aquariums"].append(record)
            history["releases"].append(record)
            completed_urls.add(url)
            completed_artists.add(artist.casefold())
            water_counts.update(result["waters"])
            save()
            print(f"[{len(list(ARTISTS.glob('*.json')))}/{target_total}] {water}: {artist} — {release} ({result['tracks']} tracks)", flush=True)
        except Exception as error:
            batch["failures"].append({
                "artist": artist,
                "release": release,
                "bandcampUrl": url,
                "sourceWater": water,
                "reason": str(error)[:500],
            })
            if len(batch["failures"]) % 10 == 0:
                save()
        time.sleep(0.35)

    save()
    if batch["status"] == "published":
        batch["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_json(batch_path, batch)
    return batch


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand the verified Cosmic Aquaria library across all waters")
    parser.add_argument("--target-total", type=int, default=200)
    parser.add_argument("--batch-id", default=f"backfill-200-{dt.datetime.now(dt.timezone.utc).date().isoformat()}")
    args = parser.parse_args()
    result = run(max(1, args.target_total), args.batch_id)
    print(json.dumps({
        "batch": result["id"],
        "status": result["status"],
        "published": result["publishedCount"],
        "library": result["currentLibraryCount"],
        "waters": result["waterCounts"],
    }))


if __name__ == "__main__":
    main()
