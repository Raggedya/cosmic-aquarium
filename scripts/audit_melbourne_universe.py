"""Audit canonical artists and generate the Melbourne universe membership layer."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFESTS = ROOT / "github-pages" / "artists"
MELBOURNE = ROOT / "automation" / "melbourne"
GEOGRAPHY = MELBOURNE / "greater-melbourne-geography.json"
MEMBERSHIP = MELBOURNE / "membership.json"
AUDIT = MELBOURNE / "audits" / "current-library-audit.json"
QUARANTINE = MELBOURNE / "quarantine" / "non-melbourne-index.json"
REVIEW = MELBOURNE / "review" / "location-review.json"

PUBLIC_STATES = {"MELBOURNE_CONFIRMED"}
PUBLIC_CONFIDENCE = {"CONFIRMED", "HIGH"}


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def normalized(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def artist_id(manifest: dict[str, Any]) -> str:
    parsed = urllib.parse.urlparse(str(manifest.get("bandcampUrl") or ""))
    host = (parsed.hostname or "").casefold()
    if host.endswith(".bandcamp.com"):
        return "bandcamp:" + host.removesuffix(".bandcamp.com")
    return "aquarium:" + str(manifest.get("slug") or "")


def strong_melbourne_bio(bio: str) -> bool:
    return bool(re.search(r"\b(?:melbourne[- ]based|based in melbourne|from melbourne|melbourne (?:artist|band|duo|trio|producer|musician|music))\b", bio, re.I))


def split_location(raw: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,|/]", raw or "") if part.strip()]


def classify_manifest(manifest: dict[str, Any], geography: dict[str, Any]) -> dict[str, Any]:
    raw = str(manifest.get("primaryLocation") or "").strip()
    bio = str(manifest.get("bioShort") or "").strip()
    parts = split_location(raw)
    first = normalized(parts[0]) if parts else ""
    raw_norm = normalized(raw)
    localities = geography.get("localities", {})
    locality = localities.get(first)
    has_australia = bool(re.search(r"\b(?:australia|victoria|vic)\b", raw, re.I))
    explicit_melbourne = bool(re.search(r"\bmelbourne\b", raw, re.I)) and not re.search(r"\b(?:florida|arkansas|iowa|kentucky)\b", raw, re.I)
    bio_melbourne = strong_melbourne_bio(bio)

    if explicit_melbourne and has_australia:
        return {"classification": "MELBOURNE_CONFIRMED", "confidence": "CONFIRMED", "rawLocation": raw,
                "locality": "Melbourne", "city": "Melbourne", "region": "Victoria", "country": "Australia",
                "source": "manifest.primaryLocation", "evidence": f'Artist-provided location is "{raw}".'}
    if locality and has_australia:
        return {"classification": "MELBOURNE_CONFIRMED", "confidence": "CONFIRMED", "rawLocation": raw,
                "locality": locality["name"], "city": "Melbourne", "region": "Victoria", "country": "Australia",
                "lga": locality["lga"], "source": "manifest.primaryLocation+Vicmap",
                "evidence": f'Artist-provided location "{raw}" resolves to {locality["lga"]}, Metropolitan Melbourne.'}
    if bio_melbourne and raw and not explicit_melbourne and re.search(r"\b(?:sydney|brisbane|adelaide|perth|hobart|canberra|darwin|geelong|ballarat|bendigo|castlemaine|warrnambool|shepparton|mildura)\b", raw, re.I):
        return {"classification": "LOCATION_CONFLICT", "confidence": "LOW", "rawLocation": raw,
                "locality": None, "city": None, "region": None, "country": None,
                "source": "manifest.primaryLocation+manifest.bioShort", "evidence": "Stored location conflicts with explicit Melbourne wording in biography."}
    if explicit_melbourne:
        return {"classification": "MELBOURNE_POSSIBLE", "confidence": "MEDIUM", "rawLocation": raw,
                "locality": "Melbourne", "city": "Melbourne", "region": "Victoria", "country": "Australia",
                "source": "manifest.primaryLocation", "evidence": "Melbourne is stated without a confirming Australian/Victorian qualifier."}
    if locality and len(parts) == 1:
        return {"classification": "MELBOURNE_POSSIBLE", "confidence": "MEDIUM", "rawLocation": raw,
                "locality": locality["name"], "city": "Melbourne", "region": "Victoria", "country": "Australia",
                "lga": locality["lga"], "source": "manifest.primaryLocation+Vicmap", "evidence": "Locality name is within Metropolitan Melbourne but country/state is absent or ambiguous."}
    if bio_melbourne:
        return {"classification": "MELBOURNE_CONFIRMED", "confidence": "HIGH", "rawLocation": raw or None,
                "locality": None, "city": "Melbourne", "region": "Victoria", "country": "Australia",
                "source": "manifest.bioShort", "evidence": "Biography explicitly describes the artist as Melbourne-based/from Melbourne."}
    if not raw:
        return {"classification": "LOCATION_UNKNOWN", "confidence": "UNKNOWN", "rawLocation": None,
                "locality": None, "city": None, "region": None, "country": None,
                "source": None, "evidence": "No stored location evidence."}
    if raw_norm in {"australia", "victoria", "victoria australia", "vic", "vic australia"}:
        return {"classification": "MELBOURNE_POSSIBLE", "confidence": "LOW", "rawLocation": raw,
                "locality": None, "city": None, "region": "Victoria" if "vic" in raw_norm else None, "country": "Australia",
                "source": "manifest.primaryLocation", "evidence": "Australia/Victoria alone is insufficient proof of Greater Melbourne."}
    return {"classification": "NON_MELBOURNE_CONFIRMED", "confidence": "HIGH", "rawLocation": raw,
            "locality": parts[0] if parts else None, "city": parts[0] if parts else None,
            "region": None, "country": parts[-1] if len(parts) > 1 else None,
            "source": "manifest.primaryLocation", "evidence": f'Stored location "{raw}" does not resolve to Metropolitan Melbourne.'}


def aggregate_artist(canonical_id: str, manifests: list[dict[str, Any]], geography: dict[str, Any]) -> dict[str, Any]:
    decisions = [classify_manifest(manifest, geography) for manifest in manifests]
    states = {decision["classification"] for decision in decisions}
    if "LOCATION_CONFLICT" in states or ("MELBOURNE_CONFIRMED" in states and "NON_MELBOURNE_CONFIRMED" in states):
        classification, confidence = "LOCATION_CONFLICT", "LOW"
    elif "MELBOURNE_CONFIRMED" in states:
        classification = "MELBOURNE_CONFIRMED"
        confidence = "CONFIRMED" if any(item["confidence"] == "CONFIRMED" for item in decisions) else "HIGH"
    elif "NON_MELBOURNE_CONFIRMED" in states:
        classification, confidence = "NON_MELBOURNE_CONFIRMED", "HIGH"
    elif "MELBOURNE_POSSIBLE" in states:
        classification = "MELBOURNE_POSSIBLE"
        confidence = "MEDIUM" if any(item["confidence"] == "MEDIUM" for item in decisions) else "LOW"
    else:
        classification, confidence = "LOCATION_UNKNOWN", "UNKNOWN"
    best = next((item for item in decisions if item["classification"] == classification), decisions[0])
    primary = max(manifests, key=lambda item: (str(item.get("status")) == "published", len(item.get("tracks") or []), str(item.get("releaseDate") or "")))
    playable = {
        str(track.get("bandcampEmbedTrackId"))
        for manifest in manifests for track in manifest.get("tracks", [])
        if str(track.get("bandcampEmbedTrackId") or "").isdigit() and str(track.get("bandcampUrl") or "").startswith("https://")
    }
    eligible = classification in PUBLIC_STATES and confidence in PUBLIC_CONFIDENCE and bool(playable)
    return {
        "artistId": canonical_id,
        "artist": primary.get("artist"),
        "classification": classification,
        "locationConfidence": confidence,
        "universeMembership": ["melbourne"] if eligible else [],
        "eligible": eligible,
        "rawLocation": best.get("rawLocation"),
        "city": best.get("city"),
        "suburb": best.get("locality") if best.get("locality") not in {None, "Melbourne"} else None,
        "locality": best.get("locality"),
        "region": best.get("region"),
        "country": best.get("country"),
        "lga": best.get("lga"),
        "locationSource": best.get("source"),
        "locationEvidence": best.get("evidence"),
        "releaseCount": len(manifests),
        "playableTrackCount": len(playable),
        "aquariumSlugs": sorted(str(item.get("slug")) for item in manifests if item.get("slug")),
        "evidenceRecords": decisions,
    }


def audit() -> dict[str, Any]:
    geography = read_json(GEOGRAPHY, {})
    if not geography.get("localities"):
        raise SystemExit(f"Missing Greater Melbourne geography. Run scripts/refresh_melbourne_geography.py first: {GEOGRAPHY}")
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    invalid: list[str] = []
    for path in sorted(MANIFESTS.glob("*.json")):
        manifest = read_json(path, None)
        if not isinstance(manifest, dict) or not manifest.get("artist"):
            invalid.append(path.name)
            continue
        grouped[artist_id(manifest)].append(manifest)
    artists = {identity: aggregate_artist(identity, manifests, geography) for identity, manifests in sorted(grouped.items())}
    state_counts = Counter(item["classification"] for item in artists.values())
    confidence_counts = Counter(item["locationConfidence"] for item in artists.values())
    eligible = [item for item in artists.values() if item["eligible"]]
    quarantine = [item for item in artists.values() if item["classification"] == "NON_MELBOURNE_CONFIRMED"]
    review = [item for item in artists.values() if item["classification"] in {"MELBOURNE_POSSIBLE", "LOCATION_UNKNOWN", "LOCATION_CONFLICT"}]
    generated = dt.datetime.now(dt.timezone.utc).isoformat()
    water_counts = Counter()
    for item in eligible:
        for water in {str(water).lower() for manifest in grouped[item["artistId"]] for water in manifest.get("waters", [])}:
            if water in {"heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange"}:
                water_counts[water] += 1
    membership = {
        "schemaVersion": 1, "universe": "melbourne", "generatedAt": generated,
        "publicationRule": "MELBOURNE_CONFIRMED with CONFIRMED/HIGH confidence and at least one playable track",
        "artistCount": len(artists), "eligibleArtistCount": len(eligible), "artists": artists,
    }
    report = {
        "schemaVersion": 1, "universe": "melbourne", "generatedAt": generated,
        "sourceManifestCount": sum(len(items) for items in grouped.values()),
        "canonicalArtistCount": len(artists), "invalidManifestCount": len(invalid), "invalidManifests": invalid,
        "classificationCounts": {key: state_counts[key] for key in (
            "MELBOURNE_CONFIRMED", "NON_MELBOURNE_CONFIRMED", "MELBOURNE_POSSIBLE",
            "LOCATION_UNKNOWN", "LOCATION_CONFLICT",
        )},
        "confidenceCounts": {key: confidence_counts[key] for key in ("CONFIRMED", "HIGH", "MEDIUM", "LOW", "UNKNOWN")},
        "eligibleMelbourneArtists": len(eligible),
        "eligibleMelbourneReleases": sum(item["releaseCount"] for item in eligible),
        "eligibleMelbournePlayableTracks": sum(item["playableTrackCount"] for item in eligible),
        "eligibleArtistsWithTickerBio": sum(
            1 for item in eligible
            if any(str(manifest.get("bioShort") or "").strip() for manifest in grouped[item["artistId"]])
        ),
        "eligibleSuburbs": sorted({item["suburb"] for item in eligible if item.get("suburb")}),
        "waterDistribution": {water.upper(): water_counts[water] for water in ("heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange")},
        "reviewQueueCount": len(review), "quarantinedNonMelbourneCount": len(quarantine),
        "geography": {"lgaCount": len(geography.get("metropolitanLgas", [])), "localityCount": geography.get("localityCount"), "retrievedAt": geography.get("retrievedAt")},
    }
    write_json(MEMBERSHIP, membership)
    write_json(AUDIT, report)
    write_json(QUARANTINE, {"schemaVersion": 1, "universe": "melbourne", "generatedAt": generated, "count": len(quarantine), "artists": quarantine})
    write_json(REVIEW, {"schemaVersion": 1, "universe": "melbourne", "generatedAt": generated, "count": len(review), "artists": review})
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit and build Melbourne universe membership")
    parser.add_argument("--output", default="", help="Optional extra report path")
    args = parser.parse_args()
    report = audit()
    if args.output:
        write_json(Path(args.output), report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
