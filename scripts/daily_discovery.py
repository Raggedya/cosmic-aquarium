from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Protocol

from create_artist import AUTOMATED_VISUAL_STYLES, create_artist, slugify


ROOT = Path(__file__).resolve().parents[1]
AUTOMATION = ROOT / "automation"
BATCHES = AUTOMATION / "batches"
HISTORY = AUTOMATION / "releases.json"
DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web"
USER_AGENT = "CosmicAquariumDiscovery/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"


def canonical_bandcamp_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/") or "/", "", "", ""))


class ReleaseProvider(Protocol):
    def discover_new_releases(self, size: int = 60) -> list[dict[str, Any]]: ...


class BandcampDiscoverProvider:
    """A replaceable adapter for Bandcamp's public, undocumented Discover response."""

    def discover_new_releases(self, size: int = 60) -> list[dict[str, Any]]:
        payload = {
            "category_id": 0,
            "tag_norm_names": [],
            "geoname_id": 0,
            "slice": "new",
            "time_facet_id": None,
            "cursor": None,
            "size": min(60, max(20, size)),
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
        return [item for item in body.get("results", []) if isinstance(item, dict) and item.get("item_type") == "a"]


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def style_for(sequence_index: int) -> str:
    """Alternate strictly between Cosmic Bloom and Violet Haze."""
    return AUTOMATED_VISUAL_STYLES[sequence_index % len(AUTOMATED_VISUAL_STYLES)]


def run(batch_date: str, target: int = 20, provider: ReleaseProvider | None = None) -> dict[str, Any]:
    date = dt.date.fromisoformat(batch_date)
    batch_path = BATCHES / f"{batch_date}.json"
    history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
    batch = read_json(batch_path, {
        "schemaVersion": 1,
        "id": batch_date,
        "batchDate": batch_date,
        "targetCount": target,
        "status": "discovering",
        "generatedCount": 0,
        "publishedCount": 0,
        "emailStatus": "pending",
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "aquariums": [],
        "failures": [],
    })
    completed_urls = {canonical_bandcamp_url(item["bandcampUrl"]) for item in history["releases"] if item.get("bandcampUrl")}
    completed_urls.update(canonical_bandcamp_url(item["bandcampUrl"]) for item in batch["aquariums"] if item.get("bandcampUrl"))
    for manifest_path in (ROOT / "github-pages" / "artists").glob("*.json"):
        manifest = read_json(manifest_path, {})
        if manifest.get("bandcampUrl"):
            completed_urls.add(canonical_bandcamp_url(manifest["bandcampUrl"]))
    needed = max(0, target - len(batch["aquariums"]))
    if not needed:
        return batch

    candidates = (provider or BandcampDiscoverProvider()).discover_new_releases(60)
    cutoff = date - dt.timedelta(days=31)
    eligible: list[dict[str, Any]] = []
    for item in candidates:
        url = canonical_bandcamp_url(str(item.get("item_url") or ""))
        if not url.startswith("https://") or url in completed_urls or item.get("is_free_download") is True:
            continue
        release_text = str(item.get("release_date") or "")[:10]
        try:
            release_date = dt.date.fromisoformat(release_text)
        except ValueError:
            continue
        if cutoff <= release_date <= date:
            eligible.append(item)

    for item in eligible:
        if len(batch["aquariums"]) >= target:
            break
        artist = str(item.get("band_name") or "").strip()
        release = str(item.get("title") or "").strip()
        url = canonical_bandcamp_url(str(item.get("item_url") or ""))
        if not artist or not release:
            continue
        aquarium_slug = slugify(f"{artist}-{release}")
        existing_manifest = read_json(ROOT / "github-pages" / "artists" / f"{aquarium_slug}.json", {})
        if existing_manifest and canonical_bandcamp_url(str(existing_manifest.get("bandcampUrl") or "")) != url:
            aquarium_slug = f"{aquarium_slug}-{hashlib.sha256(url.encode()).hexdigest()[:8]}"
        try:
            result = create_artist(
                artist,
                url,
                style_for(len(batch["aquariums"])),
                "https://raggedya.github.io/cosmic-aquarium",
                verify_qr=False,
                cache_key=batch_date.replace("-", ""),
                slug_override=aquarium_slug,
                release_title=release,
                release_date=str(item.get("release_date") or ""),
                batch_id=batch_date,
                generate_qr=False,
                metadata_tags=item.get("tags") if isinstance(item.get("tags"), list) else [],
            )
            record = {
                "id": aquarium_slug,
                "artist": artist,
                "release": release,
                "sourceIdentifier": str(item.get("item_id") or ""),
                "bandcampUrl": url,
                "releaseDate": str(item.get("release_date") or ""),
                "artworkReference": item.get("art_url") or item.get("art_id"),
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                "waters": result["waters"],
                "discoveredAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "aquariumUrl": result["page_url"].split("?", 1)[0],
                "visualStyle": result["visual_style"],
                "status": "published",
            }
            batch["aquariums"].append(record)
            history["releases"].append(record)
            completed_urls.add(url)
        except Exception as error:
            batch["failures"].append({"artist": artist, "release": release, "bandcampUrl": url, "reason": str(error)[:500]})
        batch["generatedCount"] = len(batch["aquariums"])
        batch["publishedCount"] = len(batch["aquariums"])
        batch["status"] = "published" if len(batch["aquariums"]) >= target else "generation_pending"
        write_json(batch_path, batch)
        write_json(HISTORY, history)
        time.sleep(0.5)

    batch["generatedCount"] = len(batch["aquariums"])
    batch["publishedCount"] = len(batch["aquariums"])
    batch["status"] = "published" if len(batch["aquariums"]) >= target else "generation_pending"
    batch["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat() if batch["status"] == "published" else None
    write_json(batch_path, batch)
    write_json(HISTORY, history)
    return batch


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or resume the daily Cosmic Aquaria batch")
    parser.add_argument("--date", default=dt.datetime.now(dt.timezone.utc).date().isoformat())
    parser.add_argument("--target", type=int, default=20)
    args = parser.parse_args()
    result = run(args.date, max(1, min(20, args.target)))
    print(json.dumps({"batch": result["id"], "status": result["status"], "published": result["publishedCount"], "target": result["targetCount"]}))


if __name__ == "__main__":
    main()
