"""Audit and report the canonical Cosmic Aquaria library and bulk-programme state."""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "github-pages"
ARTISTS = PAGES / "artists"
BULK_BATCHES = ROOT / "automation" / "bulk" / "batches"
WATERS = ("heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange")
TARGET = 5_000

COUNTRY_ALIASES = {
    "us": "United States", "usa": "United States", "u.s.": "United States", "u.s.a.": "United States",
    "uk": "United Kingdom", "u.k.": "United Kingdom", "england": "United Kingdom",
    "scotland": "United Kingdom", "wales": "United Kingdom", "northern ireland": "United Kingdom",
    "australia": "Australia", "canada": "Canada", "new zealand": "New Zealand", "aotearoa": "New Zealand",
    "germany": "Germany", "france": "France", "italy": "Italy", "spain": "Spain", "portugal": "Portugal",
    "belgium": "Belgium", "netherlands": "Netherlands", "switzerland": "Switzerland", "austria": "Austria",
    "poland": "Poland", "czechia": "Czechia", "czech republic": "Czechia", "slovakia": "Slovakia",
    "romania": "Romania", "hungary": "Hungary", "bulgaria": "Bulgaria", "croatia": "Croatia",
    "slovenia": "Slovenia", "serbia": "Serbia", "greece": "Greece", "turkey": "Turkey",
    "norway": "Norway", "sweden": "Sweden", "finland": "Finland", "denmark": "Denmark", "iceland": "Iceland",
    "ireland": "Ireland", "estonia": "Estonia", "latvia": "Latvia", "lithuania": "Lithuania", "ukraine": "Ukraine",
    "russia": "Russia", "georgia": "Georgia", "israel": "Israel", "lebanon": "Lebanon", "japan": "Japan",
    "china": "China", "taiwan": "Taiwan", "south korea": "South Korea", "korea": "South Korea",
    "india": "India", "indonesia": "Indonesia", "malaysia": "Malaysia", "singapore": "Singapore",
    "philippines": "Philippines", "thailand": "Thailand", "vietnam": "Vietnam", "nepal": "Nepal",
    "south africa": "South Africa", "nigeria": "Nigeria", "ghana": "Ghana", "kenya": "Kenya", "morocco": "Morocco",
    "egypt": "Egypt", "tunisia": "Tunisia", "algeria": "Algeria", "senegal": "Senegal",
    "mexico": "Mexico", "brazil": "Brazil", "argentina": "Argentina", "chile": "Chile", "colombia": "Colombia",
    "peru": "Peru", "uruguay": "Uruguay", "ecuador": "Ecuador", "venezuela": "Venezuela", "cuba": "Cuba",
}
US_STATES = {value.casefold() for value in (
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
)}
US_ABBREVIATIONS = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())
CANADIAN_PROVINCES = {"alberta", "british columbia", "manitoba", "new brunswick", "newfoundland and labrador", "nova scotia", "ontario", "prince edward island", "quebec", "saskatchewan", "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt"}
AUSTRALIAN_STATES = {"new south wales", "queensland", "south australia", "tasmania", "victoria", "western australia", "australian capital territory", "northern territory", "nsw", "qld", "sa", "tas", "vic", "wa", "act", "nt"}


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def normalized_name(value: Any) -> str:
    import unicodedata
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").casefold()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def bandcamp_host(value: Any) -> str:
    try:
        parsed = urllib.parse.urlparse(str(value or "").strip())
        host = (parsed.hostname or "").lower().removeprefix("www.")
        if parsed.scheme != "https" or parsed.username or parsed.password or not host.endswith(".bandcamp.com") or host == "bandcamp.com":
            return ""
        return host
    except ValueError:
        return ""


def valid_track(track: dict[str, Any]) -> bool:
    track_id = str(track.get("bandcampEmbedTrackId") or "")
    try:
        parsed = urllib.parse.urlparse(str(track.get("bandcampUrl") or ""))
        host = (parsed.hostname or "").lower().removeprefix("www.")
        valid_url = parsed.scheme == "https" and (host == "bandcamp.com" or host.endswith(".bandcamp.com")) and not parsed.username and not parsed.password
    except ValueError:
        valid_url = False
    return track_id.isdigit() and valid_url


def country_from_location(value: Any) -> str:
    parts = [part.strip() for part in str(value or "").split(",") if part.strip()]
    if not parts:
        return ""
    tail = parts[-1].casefold().rstrip(".")
    if tail in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[tail]
    if tail.upper() in US_ABBREVIATIONS or tail in US_STATES:
        return "United States"
    if tail in CANADIAN_PROVINCES:
        return "Canada"
    if tail in AUSTRALIAN_STATES:
        return "Australia"
    return "Unresolved"


def audit(root: Path = ROOT, target: int = TARGET) -> dict[str, Any]:
    artists_dir = root / "github-pages" / "artists"
    search_index = read_json(root / "github-pages" / "artists-index.json", {"artists": []})
    canonical_rows = search_index.get("artists") if isinstance(search_index, dict) else []
    manifests: list[tuple[Path, dict[str, Any]]] = []
    broken_manifests: list[str] = []
    for path in sorted(artists_dir.glob("*.json")):
        manifest = read_json(path, None)
        if not isinstance(manifest, dict) or not manifest.get("slug") or not manifest.get("artist"):
            broken_manifests.append(path.name)
        else:
            manifests.append((path, manifest))

    by_host: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_name: dict[str, set[str]] = defaultdict(set)
    invalid_urls: list[str] = []
    playable_ids: set[str] = set()
    release_urls: Counter[str] = Counter()
    active_hosts: set[str] = set()
    hosts_with_tracks: set[str] = set()
    published_releases = 0
    archived_releases = 0
    releases_missing_bio = 0
    for path, manifest in manifests:
        host = bandcamp_host(manifest.get("bandcampUrl"))
        if not host:
            invalid_urls.append(path.name)
        else:
            by_host[host].append(manifest)
            by_name[normalized_name(manifest.get("artist"))].add(host)
        status = str(manifest.get("status") or "published").lower()
        if status == "published":
            published_releases += 1
            if not str(manifest.get("bioShort") or "").strip():
                releases_missing_bio += 1
            if host:
                active_hosts.add(host)
        else:
            archived_releases += 1
        release_url = str(manifest.get("bandcampUrl") or "").split("?", 1)[0].rstrip("/").casefold()
        if release_url:
            release_urls[release_url] += 1
        for track in manifest.get("tracks") or []:
            if isinstance(track, dict) and valid_track(track):
                playable_ids.add(str(track["bandcampEmbedTrackId"]))
                if host:
                    hosts_with_tracks.add(host)

    canonical_hosts = set(by_host)
    water_counts: Counter[str] = Counter()
    location_counts: Counter[str] = Counter()
    missing_location = 0
    missing_waters = 0
    missing_bio = 0
    for host, editions in by_host.items():
        active_editions = [edition for edition in editions if str(edition.get("status") or "published").lower() == "published"]
        if not active_editions:
            continue
        artist_waters = {water for edition in active_editions for water in (edition.get("waters") or []) if water in WATERS}
        if artist_waters:
            water_counts.update(artist_waters)
        else:
            missing_waters += 1
        location = next((str(edition.get("primaryLocation") or "").strip() for edition in active_editions if str(edition.get("primaryLocation") or "").strip()), "")
        if location:
            location_counts[country_from_location(location)] += 1
        else:
            missing_location += 1
        if not any(str(edition.get("bioShort") or "").strip() for edition in active_editions):
            missing_bio += 1
    indexed_ids = {str(row.get("id")) for row in canonical_rows or [] if isinstance(row, dict) and row.get("status") == "published"}
    duplicate_hosts = {host: len(values) for host, values in by_host.items() if len(values) > 1}
    ambiguous_names = {name: sorted(hosts) for name, hosts in by_name.items() if name and len(hosts) > 1}
    duplicate_release_urls = {url: count for url, count in release_urls.items() if count > 1}
    bulk_batches = []
    batch_paths = [
        *(root / "automation" / "bulk" / "batches").glob("*.json"),
        *(root / "automation" / "bulk" / "dry-runs").glob("*.json"),
    ]
    for path in sorted(batch_paths):
        batch = read_json(path, {})
        if batch:
            bulk_batches.append({"id": batch.get("id") or path.stem, "mode": batch.get("mode"), "status": batch.get("status"), "startedAt": batch.get("startedAt"), "acceptedCount": int(batch.get("acceptedCount") or 0), "targetAccepted": int(batch.get("targetAccepted") or 500), "reviewCount": int(batch.get("reviewCount") or 0)})
    canonical_count = len(canonical_hosts)
    active_batch = next((batch for batch in sorted(bulk_batches, key=lambda item: str(item.get("startedAt") or ""), reverse=True) if batch.get("status") not in {"complete", "candidate_pool_exhausted"}), None)
    return {
        "schemaVersion": 1,
        "targetCanonicalArtists": target,
        "canonicalArtists": canonical_count,
        "indexedActiveArtists": len(indexed_ids),
        "publishedReleaseEditions": published_releases,
        "archivedReleaseEditions": archived_releases,
        "playableTracks": len(playable_ids),
        "activeArtists": len(active_hosts),
        "archivedArtists": len(canonical_hosts - active_hosts),
        "artistsMissingBandcampUrl": len(invalid_urls),
        "artistsMissingLocation": missing_location,
        "artistsMissingWaters": missing_waters,
        "artistsMissingTickerBio": missing_bio,
        "publishedReleasesMissingTickerBio": releases_missing_bio,
        "artistsWithoutPlayableMusic": len(canonical_hosts - hosts_with_tracks),
        "brokenManifests": broken_manifests,
        "structurallyInvalidBandcampUrls": invalid_urls,
        "duplicateArtistHostGroups": duplicate_hosts,
        "ambiguousNormalizedNameGroups": ambiguous_names,
        "duplicateReleaseUrlGroups": duplicate_release_urls,
        "waterDistribution": {water: water_counts[water] for water in WATERS},
        "countryDistribution": dict(location_counts.most_common()),
        "remainingToTarget": max(0, target - canonical_count),
        "completedBulkBatches": sum(1 for batch in bulk_batches if batch.get("mode") == "publish" and batch["status"] == "complete" and batch["acceptedCount"] >= batch["targetAccepted"]),
        "currentBatch": active_batch,
        "reviewQueue": sum(batch["reviewCount"] for batch in bulk_batches),
        "bulkBatches": bulk_batches,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Report Cosmic Aquaria bulk-library status")
    parser.add_argument("--target", type=int, default=TARGET)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(target=max(1, args.target))
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if args.json:
        print(rendered)
        return
    print(f"Current artists: {report['canonicalArtists']:,}")
    print(f"Target: {report['targetCanonicalArtists']:,}")
    print(f"Remaining: {report['remainingToTarget']:,}")
    print(f"Published releases: {report['publishedReleaseEditions']:,}")
    print(f"Playable tracks: {report['playableTracks']:,}")
    print(f"Completed batches: {report['completedBulkBatches']}")
    current = report.get("currentBatch") or {}
    print(f"Current batch accepted: {int(current.get('acceptedCount') or 0):,} / {int(current.get('targetAccepted') or 500):,}")
    print(f"Review queue: {report['reviewQueue']:,}")
    print(f"Artists missing ticker bio: {report['artistsMissingTickerBio']:,}")
    print("Waters: " + ", ".join(f"{water.upper()} {count}" for water, count in report["waterDistribution"].items()))


if __name__ == "__main__":
    main()
