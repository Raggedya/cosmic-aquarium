#!/usr/bin/env python3
"""Bounded, reviewable Location Library research for Cosmic Aquaria.

Discovery uses replaceable public-search adapters. Verification is performed against the
artist's own public Bandcamp profile; search snippets are never sufficient for publication.
No audio is downloaded and no authenticated or undocumented Bandcamp API is used.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Protocol


ROOT = Path(__file__).resolve().parents[1]
ARTISTS_DIR = ROOT / "github-pages" / "artists"
COLLECTIONS_DIR = ROOT / "automation" / "collections"
RESEARCH_DIR = ROOT / "automation" / "research"
USER_AGENT = "CosmicAquariaLocationResearch/1.0 (+https://raggedya.github.io/cosmic-aquarium/)"
MAX_RESPONSE_BYTES = 2_000_000

KNOWN_LOCATIONS = {
    "portland oregon": ("Portland", "Oregon", "United States", 45.5152, -122.6784),
    "portland or": ("Portland", "Oregon", "United States", 45.5152, -122.6784),
    "melbourne australia": ("Melbourne", "Victoria", "Australia", -37.8136, 144.9631),
    "melbourne victoria": ("Melbourne", "Victoria", "Australia", -37.8136, 144.9631),
    "glasgow scotland": ("Glasgow", "Scotland", "United Kingdom", 55.8642, -4.2518),
    "tokyo japan": ("Tokyo", "Tokyo", "Japan", 35.6762, 139.6503),
    "berlin germany": ("Berlin", "Berlin", "Germany", 52.52, 13.405),
    "chicago illinois": ("Chicago", "Illinois", "United States", 41.8781, -87.6298),
    "adelaide australia": ("Adelaide", "South Australia", "Australia", -34.9285, 138.6007),
    "hobart australia": ("Hobart", "Tasmania", "Australia", -42.8821, 147.3272),
}


def ascii_key(value: str) -> str:
    normal = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", normal.lower()).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", ascii_key(value)).strip("-")[:72]


def normalize_location(value: str, *, allow_network: bool = False) -> dict:
    raw = re.sub(r"\s+", " ", value.strip())
    if not raw:
        raise ValueError("Enter a location.")
    key = ascii_key(raw.replace(",", " "))
    known = KNOWN_LOCATIONS.get(key)
    if known:
        city, region, country, latitude, longitude = known
        return location_record(raw, city, region, country, latitude, longitude)
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if len(parts) < 2 and not allow_network:
        raise ValueError("Use a specific location such as Portland, Oregon so similarly named places are not mixed.")
    if allow_network:
        geocoded = geocode_nominatim(raw)
        if geocoded:
            return geocoded
    if len(parts) < 2:
        raise ValueError("The location is ambiguous. Add a state, region or country.")
    city = parts[0].title()
    region = parts[1].title() if len(parts) > 2 else None
    country = parts[-1].title()
    return location_record(raw, city, region, country, None, None)


def location_record(alias: str, city: str | None, region: str | None, country: str, latitude: float | None, longitude: float | None) -> dict:
    display = ", ".join(part for part in (city, region or (country if city else None)) if part)
    canonical = ", ".join(part for part in (city, region, country) if part)
    return {
        "city": city,
        "region": region,
        "country": country,
        "canonicalLocation": canonical,
        "displayName": display or country,
        "latitude": latitude,
        "longitude": longitude,
        "aliases": sorted({alias.strip(), display, canonical}),
    }


def geocode_nominatim(query: str) -> dict | None:
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 2, "addressdetails": 1})
    request = urllib.request.Request("https://nominatim.openstreetmap.org/search?" + params, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            results = json.loads(response.read(MAX_RESPONSE_BYTES).decode("utf-8", "replace"))
    except Exception:
        return None
    if len(results) != 1:
        return None
    result = results[0]
    address = result.get("address") or {}
    city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
    region = address.get("state") or address.get("region")
    country = address.get("country")
    if not country:
        return None
    return location_record(query, city, region, country, float(result["lat"]), float(result["lon"]))


def normalize_bandcamp_artist_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value.strip())
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if parsed.scheme != "https" or parsed.username or parsed.password or host == "bandcamp.com" or not host.endswith(".bandcamp.com"):
        raise ValueError("A public Bandcamp artist subdomain is required.")
    return f"https://{host}/"


def canonical_artist_id(value: str) -> str:
    host = urllib.parse.urlparse(normalize_bandcamp_artist_url(value)).hostname or ""
    return "bandcamp:" + host.removesuffix(".bandcamp.com")


class DiscoveryProvider(Protocol):
    name: str
    def discover(self, location: dict, genre: str | None, limit: int) -> list[str]: ...


class BingRssProvider:
    name = "bing-rss-public-search"

    def discover(self, location: dict, genre: str | None, limit: int) -> list[str]:
        phrases = [location["displayName"], location["canonicalLocation"]]
        urls: list[str] = []
        for phrase in phrases:
            query = f'site:bandcamp.com "{phrase}"' + (f' "{genre}"' if genre else "")
            endpoint = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "format": "rss", "count": min(limit, 50)})
            try:
                document = fetch_text(endpoint)
                for item in ET.fromstring(document).findall(".//item"):
                    link = (item.findtext("link") or "").strip()
                    if link:
                        urls.append(link)
            except Exception:
                continue
        return unique_bandcamp_roots(urls, limit)


class DuckDuckGoProvider:
    name = "duckduckgo-html-public-search"

    def discover(self, location: dict, genre: str | None, limit: int) -> list[str]:
        query = f'site:bandcamp.com "{location["displayName"]}"' + (f' "{genre}"' if genre else "")
        endpoint = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
        try:
            document = fetch_text(endpoint)
        except Exception:
            return []
        links = re.findall(r'href=["\']([^"\']+)["\']', document, flags=re.I)
        decoded = []
        for link in links:
            parsed = urllib.parse.urlparse(html.unescape(link))
            if "duckduckgo.com" in (parsed.hostname or ""):
                link = urllib.parse.parse_qs(parsed.query).get("uddg", [""])[0]
            decoded.append(link)
        return unique_bandcamp_roots(decoded, limit)


def unique_bandcamp_roots(values: list[str], limit: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        try:
            root = normalize_bandcamp_artist_url(value)
        except ValueError:
            continue
        if root in seen:
            continue
        seen.add(root)
        result.append(root)
        if len(result) >= limit:
            break
    return result


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/rss+xml"})
    with urllib.request.urlopen(request, timeout=20) as response:
        content_type = response.headers.get("content-type", "")
        if not any(kind in content_type for kind in ("text", "xml", "html")):
            raise ValueError("Unexpected response type")
        return response.read(MAX_RESPONSE_BYTES).decode("utf-8", "replace")


def profile_metadata(url: str) -> dict:
    document = fetch_text(url)
    title = first_match(document, [
        r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+name=["\']title["\'][^>]+content=["\']([^"\']+)',
        r'<title>Music\s*\|\s*([^<]+)</title>',
    ]) or urllib.parse.urlparse(url).hostname.split(".")[0]
    location = first_match(document, [
        r'<span[^>]+class=["\'][^"\']*location[^"\']*["\'][^>]*>\s*([^<]+)',
        r'["\']location["\']\s*:\s*["\']([^"\']+)',
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']*?\b([A-Z][^,"\']+,\s*[A-Z][^,"\']+)',
    ])
    return {"artistName": html.unescape(re.sub(r"\s+", " ", title)).strip(), "profileLocation": html.unescape(re.sub(r"\s+", " ", location or "")).strip(), "document": document}


def first_match(document: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, document, flags=re.I | re.S)
        if match:
            return re.sub(r"<[^>]+>", "", match.group(1)).strip()
    return None


def verify_location(profile: dict, location: dict) -> tuple[str, float, str]:
    found = ascii_key(profile.get("profileLocation", ""))
    city = ascii_key(location.get("city") or "")
    region = ascii_key(location.get("region") or "")
    country = ascii_key(location.get("country") or "")
    if found and city and city in found and ((region and region in found) or (country and country in found)):
        return "verified", 1.0, f'Bandcamp profile location: {profile["profileLocation"]}'
    document_key = ascii_key(re.sub(r"<script[\s\S]*?</script>", " ", profile.get("document", ""), flags=re.I))
    if city and city in document_key and ((region and region in document_key) or (country and country in document_key)):
        return "high_confidence", .86, "Exact city and region/country appear on the public Bandcamp artist page."
    if city and city in found:
        return "probable", .62, f'Bandcamp profile location is incomplete: {profile["profileLocation"]}'
    return "rejected", 0.0, "The public Bandcamp artist page does not support the requested location."


def load_existing_artists() -> dict[str, dict]:
    result: dict[str, dict] = {}
    for path in ARTISTS_DIR.glob("*.json"):
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
            artist_id = canonical_artist_id(str(manifest.get("bandcampUrl") or ""))
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        candidate = {
            "artistId": artist_id,
            "artistName": manifest.get("artist") or path.stem,
            "aquariumSlug": manifest.get("slug") or path.stem,
            "aquariumUrl": f'https://raggedya.github.io/cosmic-aquarium/{manifest.get("slug") or path.stem}/',
            "bandcampArtistUrl": normalize_bandcamp_artist_url(str(manifest["bandcampUrl"])),
            "trackCount": len(manifest.get("tracks") or []),
            "status": manifest.get("status", "published"),
        }
        current = result.get(artist_id)
        if not current or (candidate["status"] == "published", candidate["trackCount"]) > (current["status"] == "published", current["trackCount"]):
            result[artist_id] = candidate
    return result


@dataclass
class Candidate:
    artistId: str
    artistName: str
    bandcampArtistUrl: str
    verificationStatus: str
    verificationScore: float
    source: str
    evidence: str
    aquariumSlug: str | None = None
    aquariumUrl: str | None = None
    existingAquarium: bool = False
    displayEnabled: bool = False


def research_location(location_query: str, max_artists: int, genre: str | None, build_missing: bool, candidate_urls: list[str] | None = None, allow_network_geocode: bool = True) -> dict:
    started = time.monotonic()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    location = normalize_location(location_query, allow_network=allow_network_geocode)
    providers: list[DiscoveryProvider] = [BingRssProvider(), DuckDuckGoProvider()]
    urls = unique_bandcamp_roots(candidate_urls or [], max_artists * 4)
    provider_log = []
    for provider in providers:
        found = provider.discover(location, genre, max_artists * 4)
        provider_log.append({"provider": provider.name, "found": len(found)})
        urls = unique_bandcamp_roots(urls + found, max_artists * 4)
    existing = load_existing_artists()
    candidates: list[Candidate] = []
    for index, url in enumerate(urls):
        if len([item for item in candidates if item.verificationStatus in {"verified", "high_confidence"}]) >= max_artists:
            break
        try:
            profile = profile_metadata(url)
            status, score, evidence = verify_location(profile, location)
        except Exception as error:
            profile = {"artistName": urllib.parse.urlparse(url).hostname.split(".")[0]}
            status, score, evidence = "unverified", 0.0, f"Profile check failed: {type(error).__name__}"
        artist_id = canonical_artist_id(url)
        known = existing.get(artist_id)
        candidates.append(Candidate(
            artistId=artist_id,
            artistName=str(known.get("artistName") if known else profile["artistName"]),
            bandcampArtistUrl=url,
            verificationStatus=status,
            verificationScore=score,
            source=next((item["provider"] for item in provider_log if item["found"]), "administrator-supplied"),
            evidence=evidence,
            aquariumSlug=known.get("aquariumSlug") if known else None,
            aquariumUrl=known.get("aquariumUrl") if known else None,
            existingAquarium=bool(known),
            displayEnabled=status in {"verified", "high_confidence"} and bool(known),
        ))
        if index + 1 < len(urls):
            time.sleep(.35)
    if build_missing:
        for candidate in candidates:
            if candidate.verificationStatus not in {"verified", "high_confidence"} or candidate.existingAquarium:
                continue
            style = "cosmic" if len(existing) % 2 == 0 else "violet"
            command = [sys.executable, str(ROOT / "scripts" / "create_artist.py"), "--title", candidate.artistName, "--bandcamp-url", candidate.bandcampArtistUrl, "--visual-style", style, "--cache-key", now[:10].replace("-", "") + "-location"]
            try:
                result = json.loads(subprocess.run(command, check=True, capture_output=True, text=True).stdout)
            except Exception:
                candidate.verificationStatus = "probable"
                candidate.evidence += " Aquarium creation requires administrator review."
                continue
            candidate.aquariumSlug = result["slug"]
            candidate.aquariumUrl = result["page_url"].split("?", 1)[0]
            candidate.displayEnabled = True
            existing[candidate.artistId] = {"artistName": candidate.artistName, "aquariumSlug": candidate.aquariumSlug, "aquariumUrl": candidate.aquariumUrl, "trackCount": result.get("tracks", 0), "status": "published"}
    slug = slugify(location["displayName"])
    COLLECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    members = []
    for candidate in candidates:
        if not candidate.aquariumSlug:
            continue
        record = asdict(candidate)
        record["addedAt"] = now
        members.append(record)
    collection = {
        "schemaVersion": 1,
        "id": "location:" + slug,
        "slug": slug,
        "name": location["displayName"],
        "type": "location",
        "description": "Independent Bandcamp artists strongly associated with " + location["canonicalLocation"] + ".",
        "status": "published" if any(item["displayEnabled"] for item in members) else "draft",
        "instruction": "TOUCH AN ARTIST",
        "theme": "location",
        "createdAt": now,
        "updatedAt": now,
        "location": {**location, "researchStatus": "ready" if members else "review", "lastResearchedAt": now},
        "members": members,
    }
    prior_path = COLLECTIONS_DIR / f"{slug}.json"
    if prior_path.exists():
        prior = json.loads(prior_path.read_text(encoding="utf-8"))
        collection["createdAt"] = prior.get("createdAt", now)
        merged = {item["artistId"]: item for item in prior.get("members", [])}
        merged.update({item["artistId"]: item for item in members})
        collection["members"] = list(merged.values())
    prior_path.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {key: sum(1 for item in candidates if item.verificationStatus == key) for key in ("verified", "high_confidence", "probable", "unverified", "rejected")}
    run_id = now.replace(":", "").replace("-", "") + "-" + slug
    log = {"id": run_id, "location": location, "timestamp": now, "sources": provider_log, "candidatesFound": len(candidates), **counts, "duplicates": sum(1 for item in candidates if item.existingAquarium), "newArtists": sum(1 for item in candidates if not item.existingAquarium), "errors": sum(1 for item in candidates if item.verificationStatus == "unverified"), "durationSeconds": round(time.monotonic() - started, 2), "collectionSlug": slug}
    (RESEARCH_DIR / f"{run_id}.json").write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"collection": collection, "research": log, "candidates": [asdict(item) for item in candidates]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--location", required=True)
    parser.add_argument("--max-artists", type=int, default=25)
    parser.add_argument("--genre")
    parser.add_argument("--build-missing", action="store_true")
    parser.add_argument("--candidate-url", action="append", default=[])
    parser.add_argument("--no-network-geocode", action="store_true")
    args = parser.parse_args()
    result = research_location(args.location, max(1, min(100, args.max_artists)), args.genre, args.build_missing, args.candidate_url, not args.no_network_geocode)
    print(json.dumps({"slug": result["collection"]["slug"], "name": result["collection"]["name"], "status": result["collection"]["status"], "members": len(result["collection"]["members"]), "research": result["research"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
