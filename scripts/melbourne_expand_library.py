"""Resumable expansion of the live Melbourne universe to an exact artist total.

Candidates come from Bandcamp's public Discover response scoped to Melbourne's
geoname id. A candidate is published only after canonical identity, explicit
Melbourne location, playable Bandcamp tracks, biography, deduplication and
Cosmic Aquaria water classification have all been verified.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Any

from audit_melbourne_universe import GEOGRAPHY, audit, classify_manifest, read_json as read_geo_json
from bulk_expand_library import (
    WATER_TAGS,
    ambiguous_artist_entity,
    ambiguous_release_identity,
    canonical_artist_host_supported,
    malformed_artist_identity,
    verify_bandcamp_artist_identity,
)
from bulk_library_status import bandcamp_host, normalized_name
from create_artist import AUTOMATED_VISUAL_STYLES, create_artist, fetch_page, persist_artist_files, slugify
from daily_discovery import canonical_bandcamp_url, read_json, write_json
from water_classifier import classify_waters


ROOT = Path(__file__).resolve().parents[1]
ARTISTS = ROOT / "github-pages" / "artists"
HISTORY = ROOT / "automation" / "releases.json"
EXPANSION = ROOT / "automation" / "melbourne" / "expansion"
STATE_PATH = EXPANSION / "melbourne-500-state.json"
REPORT_PATH = EXPANSION / "melbourne-500-report.json"
DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web"
MELBOURNE_GEONAME_ID = 2158177
USER_AGENT = "CosmicAquariaMelbourneExpansion/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"
PAGE_SIZE = 60

EXTRA_TAGS = {
    "heavy": ("grindcore", "death-metal", "thrash-metal"),
    "dreamy": ("indie-pop", "bedroom-pop", "jangle-pop"),
    "quiet": ("singer-songwriter", "contemporary-classical", "jazz"),
    "electronic": ("dance", "drum-bass", "trance", "hip-hop"),
    "dark": ("industrial", "ebm", "gothic-rock"),
    "loud": ("rock", "indie-rock", "garage", "post-rock"),
    "strange": ("improvised-music", "free-improvisation", "spoken-word", "world"),
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def candidate_key(item: dict[str, Any]) -> str:
    band_id = str(item.get("band_id") or "").strip()
    if band_id.isdigit():
        return f"bandcamp-id:{band_id}"
    host = bandcamp_host(item.get("band_url") or item.get("item_url"))
    return f"bandcamp-host:{host}" if host else ""


def candidate_record(item: dict[str, Any], water: str, tag: str, slice_name: str) -> dict[str, Any]:
    return {
        "candidateId": f"{item.get('item_id')}:{candidate_key(item)}",
        "artist": " ".join(str(item.get("band_name") or item.get("album_artist") or "").split()),
        "release": " ".join(str(item.get("title") or "").split()),
        "bandcampUrl": canonical_bandcamp_url(str(item.get("item_url") or "")),
        "bandcampArtistUrl": canonical_bandcamp_url(str(item.get("band_url") or "")),
        "bandcampBandId": str(item.get("band_id") or ""),
        "sourceIdentifier": str(item.get("item_id") or ""),
        "sourceWater": water,
        "sourceTag": tag,
        "sourceSlice": slice_name,
        "location": " ".join(str(item.get("band_location") or "").split()),
        "releaseDate": str(item.get("release_date") or ""),
        "trackCountHint": int(item.get("track_count") or 0),
        "discoveredAt": now(),
    }


class MelbourneFeed:
    def __init__(self, water: str, tag: str, slice_name: str) -> None:
        self.water = water
        self.tag = tag
        self.slice_name = slice_name
        self.cursor: str | None = None
        self.exhausted = False
        self.items: deque[dict[str, Any]] = deque()

    def refill(self, retries: int = 3) -> None:
        payload = {
            "category_id": 0,
            "tag_norm_names": [self.tag] if self.tag else [],
            "geoname_id": MELBOURNE_GEONAME_ID,
            "slice": self.slice_name,
            "time_facet_id": None,
            "cursor": self.cursor,
            "size": PAGE_SIZE,
            "include_result_types": ["a"],
            "followed_bands": False,
        }
        body: dict[str, Any] | None = None
        for attempt in range(retries):
            try:
                request = urllib.request.Request(
                    DISCOVER_URL,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", "Accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=35) as response:
                    body = json.load(response)
                break
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                if attempt + 1 >= retries:
                    raise
                time.sleep(1.5 * (2**attempt))
        rows = [row for row in (body or {}).get("results", []) if isinstance(row, dict) and row.get("item_type") == "a"]
        self.items.extend(rows)
        next_cursor = (body or {}).get("cursor")
        self.exhausted = not next_cursor or str(next_cursor) == str(self.cursor)
        self.cursor = str(next_cursor) if next_cursor else None
        time.sleep(0.45)

    def next(self) -> dict[str, Any] | None:
        if not self.items and not self.exhausted:
            self.refill()
        return self.items.popleft() if self.items else None


def discover_candidates(limit: int) -> list[dict[str, Any]]:
    feeds: deque[MelbourneFeed] = deque()
    feeds.extend((MelbourneFeed("strange", "", "top"), MelbourneFeed("strange", "", "new")))
    for water, tags in WATER_TAGS.items():
        for tag in dict.fromkeys((*tags, *EXTRA_TAGS.get(water, ()))):
            feeds.append(MelbourneFeed(water, tag, "top"))
            feeds.append(MelbourneFeed(water, tag, "new"))
    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    per_artist: Counter[str] = Counter()
    while feeds and len(results) < limit:
        feed = feeds.popleft()
        try:
            item = feed.next()
        except Exception:
            feed.exhausted = True
            item = None
        if item:
            url = canonical_bandcamp_url(str(item.get("item_url") or ""))
            key = candidate_key(item)
            if url and url not in seen_urls and key and per_artist[key] < 3:
                seen_urls.add(url)
                per_artist[key] += 1
                results.append(candidate_record(item, feed.water, feed.tag, feed.slice_name))
        if not feed.exhausted or feed.items:
            feeds.append(feed)
    return results


def manifest_index() -> tuple[dict[str, list[Path]], dict[str, dict[str, Any]]]:
    by_host: dict[str, list[Path]] = defaultdict(list)
    manifests: dict[str, dict[str, Any]] = {}
    for path in sorted(ARTISTS.glob("*.json")):
        manifest = read_json(path, {})
        if not manifest.get("artist"):
            continue
        manifests[path.stem] = manifest
        host = bandcamp_host(manifest.get("canonicalBandcampUrl") or manifest.get("bandcampUrl"))
        if host:
            by_host[host].append(path)
    return by_host, manifests


def canonical_artist_id(host: str) -> str:
    return "bandcamp:" + host.removesuffix(".bandcamp.com")


def eligible_ids() -> set[str]:
    membership = read_json(ROOT / "automation" / "melbourne" / "membership.json", {})
    return {artist_id for artist_id, item in (membership.get("artists") or {}).items() if item.get("eligible") is True}


def strict_melbourne_location(location: str) -> bool:
    geography = read_geo_json(GEOGRAPHY, {})
    decision = classify_manifest({"primaryLocation": location, "bioShort": ""}, geography)
    return decision.get("classification") == "MELBOURNE_CONFIRMED" and decision.get("confidence") in {"CONFIRMED", "HIGH"}


def quality_rejection(candidate: dict[str, Any]) -> str | None:
    artist = candidate["artist"]
    release = candidate["release"]
    url = candidate["bandcampUrl"]
    if not artist or not release or not str(candidate.get("sourceIdentifier") or "").isdigit():
        return "INVALID_METADATA"
    if not url or not bandcamp_host(url):
        return "INVALID_BANDCAMP_URL"
    if not strict_melbourne_location(candidate.get("location") or ""):
        return "NOT_CONFIRMED_MELBOURNE"
    if int(candidate.get("trackCountHint") or 0) < 1:
        return "NO_PLAYABLE_TRACK"
    if re.search(r"\b(?:radio show|podcast|music archive|record label|record store)\b", artist, re.I):
        return "NON_ARTIST_ENTITY"
    if ambiguous_artist_entity(artist) or ambiguous_release_identity(release) or malformed_artist_identity(artist, release):
        return "AMBIGUOUS_IDENTITY"
    if not canonical_artist_host_supported(artist, url):
        return "ARTIST_HOST_MISMATCH"
    return None


def normalized_credit(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.casefold())


def credit_matches(artist: str, credit: str) -> bool:
    expected = normalized_credit(artist)
    actual = normalized_credit(credit)
    if not expected or not actual or actual in {"missing", "variousartists"}:
        return False
    return expected == actual or (min(len(expected), len(actual)) >= 4 and (expected in actual or actual in expected))


def assess_release_identity(artist: str, page_artists: list[str], track_artists: list[str]) -> dict[str, Any]:
    page_credits = sorted({" ".join(str(value or "").split()) for value in page_artists if str(value or "").strip()})
    track_credits = sorted({" ".join(str(value or "").split()) for value in track_artists if str(value or "").strip()})
    page_match = any(credit_matches(artist, value) for value in page_credits)
    track_match = any(credit_matches(artist, value) for value in track_credits)
    reason = None
    if not page_match:
        reason = "RELEASE_ARTIST_MISMATCH"
    elif len(track_credits) >= 2 and not track_match:
        reason = "VARIOUS_ARTIST_COMPILATION"
    return {
        "status": "REJECTED" if reason else "VERIFIED",
        "reason": reason,
        "pageArtists": page_credits,
        "trackArtists": track_credits,
        "verifiedAt": now(),
    }


def verify_release_identity(candidate: dict[str, Any]) -> dict[str, Any]:
    parser, final_url = fetch_page(candidate["bandcampUrl"])
    page_artists: list[str] = []
    track_artists: list[str] = []
    for payload in parser.tralbum:
        page_artists.extend([payload.get("artist") or "", (payload.get("current") or {}).get("artist") or ""])
        track_artists.extend(str(item.get("artist") or "") for item in payload.get("trackinfo") or [] if isinstance(item, dict))
    evidence = assess_release_identity(candidate["artist"], page_artists, track_artists)
    evidence["finalUrl"] = final_url
    return evidence


def remove_accepted_rows(state: dict[str, Any], rejected_rows: list[tuple[dict[str, Any], str, dict[str, Any]]]) -> None:
    rejected_ids = {id(item) for item, _, _ in rejected_rows}
    removed_slugs: set[str] = set()
    for accepted, reason, evidence in rejected_rows:
        slug = str(accepted.get("releaseSlug") or "")
        if accepted.get("action") == "ADDED_NEW" and slug:
            (ARTISTS / f"{slug}.json").unlink(missing_ok=True)
            page_path = ROOT / "github-pages" / slug / "index.html"
            page_path.unlink(missing_ok=True)
            try:
                page_path.parent.rmdir()
            except OSError:
                pass
            removed_slugs.add(slug)
        state.setdefault("rejections", []).append({**accepted, "reason": reason, "releaseIdentity": evidence, "removedAt": now()})
    state["accepted"] = [item for item in state.get("accepted") or [] if id(item) not in rejected_ids]
    if removed_slugs:
        history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
        history["releases"] = [item for item in history.get("releases") or [] if item.get("id") not in removed_slugs]
        write_json(HISTORY, history)
    write_json(STATE_PATH, state)


def import_identity_audit(state: dict[str, Any]) -> None:
    """Reuse successful evidence from the one-off full audit; retry only rate-limited pages."""
    path = ROOT / "artifacts" / "melbourne-500-identity-audit.json"
    audit_payload = read_json(path, {})
    flagged = audit_payload.get("flagged") or []
    by_slug = {str(item.get("slug") or ""): item for item in flagged}
    complete_audit = int(audit_payload.get("checked") or 0) == len(state.get("accepted") or [])
    for accepted in state.get("accepted") or []:
        if accepted.get("releaseIdentity"):
            continue
        item = by_slug.get(str(accepted.get("releaseSlug") or ""))
        if not item and complete_audit:
            accepted["releaseIdentity"] = {
                "status": "VERIFIED", "reason": None, "source": "full-release-identity-audit", "verifiedAt": now()
            }
            continue
        if not item or "FETCH_FAILED" in (item.get("flags") or []):
            continue
        page_artists = [item.get("pageArtist") or "", item.get("currentArtist") or ""]
        accepted["releaseIdentity"] = assess_release_identity(accepted["artist"], page_artists, item.get("trackArtists") or [])


def audit_accepted_identities(state: dict[str, Any], delay: float) -> None:
    import_identity_audit(state)
    rejected: list[tuple[dict[str, Any], str, dict[str, Any]]] = []
    pending = [
        item for item in state.get("accepted") or []
        if not item.get("releaseIdentity") or (item.get("releaseIdentity") or {}).get("status") == "RETRY"
    ]
    for index, accepted in enumerate(pending, 1):
        try:
            evidence = verify_release_identity(accepted)
            accepted["releaseIdentity"] = evidence
            if evidence.get("status") != "VERIFIED":
                rejected.append((accepted, str(evidence.get("reason") or "RELEASE_IDENTITY_REJECTED"), evidence))
        except Exception as error:
            accepted["releaseIdentity"] = {"status": "RETRY", "error": str(error)[:500], "checkedAt": now()}
        if index % 10 == 0:
            write_json(STATE_PATH, state)
            print(f"identity QA {index}/{len(pending)}", flush=True)
        time.sleep(max(0.5, delay))
    rejected.extend(
        (item, str((item.get("releaseIdentity") or {}).get("reason") or "RELEASE_IDENTITY_REJECTED"), item.get("releaseIdentity") or {})
        for item in state.get("accepted") or []
        if (item.get("releaseIdentity") or {}).get("status") == "REJECTED" and all(item is not row[0] for row in rejected)
    )
    if rejected:
        remove_accepted_rows(state, rejected)
    else:
        write_json(STATE_PATH, state)


def prune_invalid_accepted(state: dict[str, Any]) -> None:
    """Remove accepted rows that fail newer quality gates before a resumed run."""
    retained: list[dict[str, Any]] = []
    removed_slugs: set[str] = set()
    for accepted in state.get("accepted") or []:
        reason = quality_rejection(accepted)
        if not reason:
            retained.append(accepted)
            continue
        slug = str(accepted.get("releaseSlug") or "")
        if accepted.get("action") == "ADDED_NEW" and slug:
            manifest_path = ARTISTS / f"{slug}.json"
            page_path = ROOT / "github-pages" / slug / "index.html"
            manifest_path.unlink(missing_ok=True)
            page_path.unlink(missing_ok=True)
            try:
                page_path.parent.rmdir()
            except OSError:
                pass
            removed_slugs.add(slug)
        state.setdefault("rejections", []).append({**accepted, "reason": reason, "removedAt": now()})
    if len(retained) == len(state.get("accepted") or []):
        return
    state["accepted"] = retained
    history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
    history["releases"] = [item for item in history.get("releases") or [] if item.get("id") not in removed_slugs]
    write_json(HISTORY, history)
    write_json(STATE_PATH, state)


def add_location_evidence(manifest: dict[str, Any], candidate: dict[str, Any], batch_id: str) -> dict[str, Any]:
    previous = manifest.get("primaryLocation")
    if previous and previous != candidate["location"]:
        history = list(manifest.get("locationHistory") or [])
        if not any(item.get("value") == previous for item in history if isinstance(item, dict)):
            history.append({"value": previous, "source": "previous-catalogue-value"})
        manifest["locationHistory"] = history
    manifest["primaryLocation"] = candidate["location"]
    manifest["locationValidation"] = {
        "classification": "MELBOURNE_CONFIRMED",
        "confidence": "CONFIRMED",
        "source": "bandcamp-discover-geoname",
        "sourceUrl": DISCOVER_URL,
        "geonameId": MELBOURNE_GEONAME_ID,
        "observedAt": now(),
        "batchId": batch_id,
    }
    return manifest


def run(target_total: int, candidate_limit: int, batch_id: str, delay: float) -> dict[str, Any]:
    existing_state = read_json(STATE_PATH, {})
    if existing_state:
        prune_invalid_accepted(existing_state)
        existing_state = read_json(STATE_PATH, {})
        audit_accepted_identities(existing_state, delay)
    baseline = audit()
    starting_total = int(baseline["eligibleMelbourneArtists"])
    state = read_json(STATE_PATH, {
        "schemaVersion": 1,
        "batchId": batch_id,
        "targetTotal": target_total,
        "startingEligibleArtists": starting_total,
        "startedAt": now(),
        "status": "discovering",
        "candidates": [],
        "accepted": [],
        "rejections": [],
        "processedCandidateIds": [],
    })
    state["targetTotal"] = target_total
    if not state.get("candidates"):
        state["candidates"] = discover_candidates(candidate_limit)
        state["candidateCount"] = len(state["candidates"])
        state["status"] = "validating"
        write_json(STATE_PATH, state)

    by_host, manifests = manifest_index()
    current_eligible = eligible_ids()
    history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
    processed = set(state.get("processedCandidateIds") or [])
    accepted_keys = {item.get("artistKey") for item in state.get("accepted") or []}
    existing_names = {normalized_name(manifest.get("artist")) for manifest in manifests.values()}

    for candidate in state["candidates"]:
        if len(current_eligible) >= target_total:
            break
        candidate_id = candidate["candidateId"]
        if candidate_id in processed:
            continue
        processed.add(candidate_id)
        state["processedCandidateIds"] = sorted(processed)
        host = bandcamp_host(candidate.get("bandcampArtistUrl") or candidate.get("bandcampUrl"))
        artist_key = canonical_artist_id(host) if host else ""
        reason = quality_rejection(candidate)
        if reason:
            state["rejections"].append({**candidate, "reason": reason, "processedAt": now()})
            write_json(STATE_PATH, state)
            continue
        if artist_key in current_eligible or artist_key in accepted_keys:
            state["rejections"].append({**candidate, "reason": "DUPLICATE_MELBOURNE_ARTIST", "processedAt": now()})
            write_json(STATE_PATH, state)
            continue

        try:
            release_identity = verify_release_identity(candidate)
            if release_identity.get("status") != "VERIFIED":
                raise ValueError(str(release_identity.get("reason") or "Release artist identity could not be verified"))
            if host in by_host:
                expected_band_id = str(candidate.get("bandcampBandId") or "")
                stored_band_ids = {
                    str((read_json(path, {}).get("canonicalIdentity") or {}).get("bandcampBandId") or "")
                    for path in by_host[host]
                } - {""}
                if stored_band_ids and expected_band_id not in stored_band_ids:
                    raise ValueError("Bandcamp identity conflicts with the existing canonical artist")
                for path in by_host[host]:
                    manifest = add_location_evidence(read_json(path, {}), candidate, batch_id)
                    write_json(path, manifest)
                action = "ACTIVATED_EXISTING"
                release_slug = by_host[host][0].stem
                track_count = sum(len(read_json(path, {}).get("tracks") or []) for path in by_host[host])
            else:
                if normalized_name(candidate["artist"]) in existing_names:
                    raise ValueError("Ambiguous duplicate artist name")
                identity = verify_bandcamp_artist_identity(candidate["artist"], candidate["bandcampUrl"])
                if identity.get("identityVerified") is not True or identity.get("identityIsLabel") is not False:
                    raise ValueError("Canonical Bandcamp artist identity could not be verified")
                waters = list(dict.fromkeys([
                    candidate["sourceWater"],
                    *classify_waters([candidate["sourceTag"]], f"{candidate['artist']} {candidate['release']}", candidate["bandcampUrl"]),
                ]))[:3]
                release_slug = slugify(f"{candidate['artist']}-{candidate['release']}")
                if (ARTISTS / f"{release_slug}.json").exists():
                    release_slug += "-" + candidate["sourceIdentifier"][-8:]
                result = create_artist(
                    candidate["artist"], candidate["bandcampUrl"],
                    AUTOMATED_VISUAL_STYLES[len(state["accepted"]) % len(AUTOMATED_VISUAL_STYLES)],
                    "https://raggedya.github.io/cosmic-aquarium", verify_qr=False,
                    cache_key=batch_id, slug_override=release_slug, release_title=candidate["release"],
                    release_date=candidate["releaseDate"], batch_id=batch_id, generate_qr=False,
                    metadata_tags=[candidate["sourceTag"], "Melbourne"], waters=waters,
                    primary_location=candidate["location"], persist=False,
                )
                manifest = add_location_evidence(result.pop("_manifest"), candidate, batch_id)
                manifest["canonicalIdentity"] = {
                    "bandcampHost": host,
                    "bandcampBandId": identity.get("identityBandId") or candidate.get("bandcampBandId"),
                    "source": identity.get("identitySource") or "bandcamp-public-artist-index",
                }
                manifest["provenance"] = {
                    "sourceType": "bandcamp-discover-melbourne",
                    "sourceUrl": DISCOVER_URL,
                    "discoveredUrl": candidate["bandcampUrl"],
                    "discoveredAt": candidate["discoveredAt"],
                    "importedAt": now(),
                    "batchId": batch_id,
                }
                if not strict_melbourne_location(str(manifest.get("primaryLocation") or "")):
                    raise ValueError("Generated manifest did not retain confirmed Melbourne location")
                if not manifest.get("bioShort"):
                    raise ValueError("Ticker biography is required")
                persist_artist_files(release_slug, candidate["artist"], manifest)
                record = {
                    "id": release_slug, "artist": candidate["artist"], "release": candidate["release"],
                    "sourceIdentifier": candidate["sourceIdentifier"], "bandcampUrl": manifest["bandcampUrl"],
                    "releaseDate": candidate["releaseDate"], "tags": manifest["metadataTags"],
                    "location": candidate["location"], "waters": manifest["waters"], "discoveredAt": candidate["discoveredAt"],
                    "aquariumUrl": f"https://raggedya.github.io/cosmic-aquarium/{release_slug}/",
                    "visualStyle": manifest["visualStyle"], "status": "published",
                }
                history.setdefault("releases", []).append(record)
                write_json(HISTORY, history)
                by_host[host] = [ARTISTS / f"{release_slug}.json"]
                existing_names.add(normalized_name(candidate["artist"]))
                track_count = len(manifest.get("tracks") or [])
                action = "ADDED_NEW"

            accepted = {
                **candidate, "artistKey": artist_key, "action": action, "releaseSlug": release_slug,
                "playableTrackCount": track_count, "releaseIdentity": release_identity, "acceptedAt": now(),
            }
            state["accepted"].append(accepted)
            accepted_keys.add(artist_key)
            current_eligible.add(artist_key)
            state["currentEligibleArtists"] = len(current_eligible)
            print(f"[{len(current_eligible)}/{target_total}] {action}: {candidate['artist']} ({track_count} tracks)", flush=True)
        except Exception as error:
            state["rejections"].append({**candidate, "reason": "VALIDATION_FAILED", "error": str(error)[:500], "processedAt": now()})
        write_json(STATE_PATH, state)
        time.sleep(max(0.15, delay))

    final_audit = audit()
    final_total = int(final_audit["eligibleMelbourneArtists"])
    state["currentEligibleArtists"] = final_total
    state["acceptedCount"] = len(state["accepted"])
    state["rejectedCount"] = len(state["rejections"])
    pending_identity = sum(
        (item.get("releaseIdentity") or {}).get("status") != "VERIFIED" for item in state.get("accepted") or []
    )
    state["identityQaPending"] = pending_identity
    state["status"] = "complete" if final_total == target_total and pending_identity == 0 else (
        "identity_qa_pending" if final_total == target_total else "candidate_pool_exhausted"
    )
    state["completedAt"] = now() if state["status"] == "complete" else None
    write_json(STATE_PATH, state)
    report = {
        "schemaVersion": 1, "batchId": batch_id, "status": state["status"],
        "startingEligibleArtists": state["startingEligibleArtists"], "finalEligibleArtists": final_total,
        "targetTotal": target_total, "acceptedArtists": len(state["accepted"]),
        "newArtists": sum(item["action"] == "ADDED_NEW" for item in state["accepted"]),
        "existingArtistsActivated": sum(item["action"] == "ACTIVATED_EXISTING" for item in state["accepted"]),
        "candidateCount": len(state["candidates"]), "rejectedCount": len(state["rejections"]),
        "playableTracks": final_audit["eligibleMelbournePlayableTracks"],
        "artistsWithTickerBio": final_audit["eligibleArtistsWithTickerBio"],
        "waterDistribution": final_audit["waterDistribution"], "generatedAt": now(),
    }
    write_json(REPORT_PATH, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand Cosmic Aquaria to an exact total of validated Melbourne artists")
    parser.add_argument("--target-total", type=int, default=500)
    parser.add_argument("--candidate-limit", type=int, default=3500)
    parser.add_argument("--batch-id", default="melbourne-500-2026-09-06")
    parser.add_argument("--delay", type=float, default=0.45)
    args = parser.parse_args()
    report = run(max(1, args.target_total), max(500, min(6000, args.candidate_limit)), args.batch_id, args.delay)
    print(json.dumps(report, indent=2))
    if report["status"] != "complete":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
