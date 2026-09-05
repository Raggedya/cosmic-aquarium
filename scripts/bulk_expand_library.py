"""Resumable 500-artist Cosmic Aquaria bulk expansion.

Dry runs persist candidate/decision state but never change catalogue manifests or
the release history. Real runs use the same validators and publish only after an
artist has a public Bandcamp release with at least one playable embed track.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque
from pathlib import Path
from typing import Any

from bulk_library_status import bandcamp_host, country_from_location, normalized_name
from create_artist import AUTOMATED_VISUAL_STYLES, create_artist, persist_artist_files, slugify
from daily_discovery import canonical_bandcamp_url, read_json, write_json
from water_classifier import WATERS, classify_waters


ROOT = Path(__file__).resolve().parents[1]
ARTISTS = ROOT / "github-pages" / "artists"
HISTORY = ROOT / "automation" / "releases.json"
BULK_ROOT = ROOT / "automation" / "bulk"
BATCHES = BULK_ROOT / "batches"
DRY_RUNS = BULK_ROOT / "dry-runs"
REPORTS = BULK_ROOT / "reports"
DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web"
ARTIST_SEARCH_URL = "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic"
USER_AGENT = "CosmicAquariaBulk/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"
PAGE_SIZE = 60
DEFAULT_TARGET = 500
DEFAULT_CANDIDATES = 1_000
PROGRAMME_TARGET = 5_000

WATER_TAGS = {
    "heavy": ("metal", "doom", "sludge", "hardcore", "stoner-metal", "post-metal"),
    "dreamy": ("shoegaze", "dream-pop", "ethereal", "psychedelic", "slowcore", "ambient-pop"),
    "quiet": ("ambient", "acoustic", "folk", "piano", "minimal", "field-recordings"),
    "electronic": ("electronic", "techno", "idm", "house", "electro", "breakbeat"),
    "dark": ("darkwave", "goth", "dark-ambient", "post-punk", "coldwave", "black-metal"),
    "loud": ("punk", "noise-rock", "garage-rock", "post-hardcore", "grunge", "noise"),
    "strange": ("experimental", "avant-garde", "sound-art", "musique-concrete", "free-jazz", "outsider"),
}

REJECTION = {
    "DUPLICATE_ARTIST", "DUPLICATE_RELEASE", "DEAD_URL", "NO_PLAYABLE_TRACK", "INVALID_METADATA",
    "SPAM_OR_PLACEHOLDER", "UNSUPPORTED_PAGE", "VALIDATION_FAILED", "MANUAL_REVIEW",
}
NON_MUSIC_PRODUCT = re.compile(
    r"\b(sample\s*pack|loop\s*pack|audio\s*assets?|sound\s*effects?|sfx\s*pack|preset\s*pack|midi\s*pack|"
    r"construction\s*kit|vocal\s*textures?\s*pack|texture\s*pack|stems?\s*pack|royalty[- ]free\s*(?:loops?|music)|"
    r"ableton\s*pack|kontakt\s*library|commercial\s*(?:asset|media)\s*(?:pack|kit)|merch\s*clearance|"
    r"grab\s*bag|(?:cd'?s?|cassettes?)\s+for\s+\$)\b",
    re.I,
)


class DiscoverFeed:
    def __init__(self, water: str, tag: str, slice_name: str = "top", skip: int = 0) -> None:
        self.water = water
        self.tag = tag
        self.slice_name = slice_name
        self.remaining_skip = max(0, skip)
        self.cursor: str | None = None
        self.exhausted = False
        self.items: deque[dict[str, Any]] = deque()

    def refill(self, retries: int = 3) -> None:
        if self.exhausted:
            return
        payload = {
            "category_id": 0, "tag_norm_names": [self.tag], "geoname_id": 0, "slice": self.slice_name,
            "time_facet_id": None, "cursor": self.cursor, "size": PAGE_SIZE,
            "include_result_types": ["a"], "followed_bands": False,
        }
        body = None
        for attempt in range(retries):
            try:
                request = urllib.request.Request(
                    DISCOVER_URL, data=json.dumps(payload).encode("utf-8"),
                    headers={"User-Agent": USER_AGENT, "Content-Type": "application/json; charset=UTF-8", "Accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=35) as response:
                    body = json.load(response)
                break
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                if attempt + 1 >= retries:
                    raise
                time.sleep(1.5 * (2**attempt))
        rows = [item for item in (body or {}).get("results", []) if isinstance(item, dict) and item.get("item_type") == "a"]
        self.items.extend(rows)
        next_cursor = (body or {}).get("cursor")
        self.exhausted = not next_cursor or str(next_cursor) == str(self.cursor)
        self.cursor = str(next_cursor) if next_cursor else None
        time.sleep(0.55)

    def next(self) -> dict[str, Any] | None:
        while True:
            if not self.items and not self.exhausted:
                self.refill()
            while self.items and self.remaining_skip:
                self.items.popleft()
                self.remaining_skip -= 1
            if self.items or self.exhausted:
                break
        return self.items.popleft() if self.items else None


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def artist_name(item: dict[str, Any]) -> str:
    return " ".join(str(item.get("album_artist") or item.get("band_name") or "").split())


def release_name(item: dict[str, Any]) -> str:
    return " ".join(str(item.get("title") or "").split())


def source_url(item: dict[str, Any]) -> str:
    return canonical_bandcamp_url(str(item.get("item_url") or ""))


def verify_bandcamp_artist_identity(artist: str, url: str, retries: int = 3) -> dict[str, Any]:
    """Confirm the release host is a non-label artist in Bandcamp's public index."""
    expected_host = bandcamp_host(url)
    payload = {"search_text": artist, "search_filter": "b", "full_page": False, "fan_id": None}
    response: dict[str, Any] | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                ARTIST_SEARCH_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "User-Agent": USER_AGENT, "Content-Type": "application/json; charset=UTF-8",
                    "Accept": "application/json", "Origin": "https://bandcamp.com", "Referer": "https://bandcamp.com/",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=25) as opened:
                response = json.load(opened)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt + 1 >= retries:
                raise
            time.sleep(1.25 * (2**attempt))
    for result in ((response or {}).get("auto") or {}).get("results") or []:
        root_host = bandcamp_host(result.get("item_url_root"))
        if result.get("type") == "b" and root_host == expected_host:
            return {
                "identityVerified": True,
                "identityIsLabel": result.get("is_label") is True,
                "identityBandId": str(result.get("id") or ""),
                "identitySource": "bandcamp-public-artist-index",
            }
    return {"identityVerified": False, "identityIsLabel": None, "identityBandId": "", "identitySource": "bandcamp-public-artist-index"}


def canonical_artist_host_supported(artist: str, url: str) -> bool:
    """Return whether a Bandcamp subdomain plausibly belongs to the named artist.

    Discover results can be release pages hosted by labels. Those releases may
    be playable, but the label subdomain is not a stable canonical artist
    identity. Ambiguous label-hosted releases belong in manual review rather
    than being counted as new artists toward the 5,000-artist target.
    """
    host = bandcamp_host(url)
    if not host:
        return False
    stem = host.removesuffix(".bandcamp.com")
    host_key = re.sub(r"[^a-z0-9]", "", stem.casefold())
    artist_key = re.sub(r"[^a-z0-9]", "", normalized_name(artist))
    if len(host_key) < 3 or len(artist_key) < 3:
        return False
    return artist_key in host_key or (len(host_key) >= 4 and host_key in artist_key)


def ambiguous_artist_entity(artist: str) -> bool:
    key = normalized_name(artist)
    if key.startswith("various artists") or key in {"va", "v a"}:
        return True
    if re.search(r"(?:blog|channel|radio|archive|podcast|mix)\s*$", artist, re.I):
        return True
    return bool(re.search(
        r"\b(records?|recordings?|recs?|discs?|tapes?|netlabel|music group|audio assets?|"
        r"compilations?|catalogue|sound library)\s*$",
        artist,
        re.I,
    ))


def malformed_artist_identity(artist: str, release: str = "") -> bool:
    compact = " ".join(artist.split())
    letters = sum(character.isalpha() for character in compact)
    digits = sum(character.isdigit() for character in compact)
    alphanumeric = max(1, letters + digits)
    return bool(
        len(compact) > 96
        or len(compact.split()) > 12
        or letters < 2
        or (digits >= 6 and digits / alphanumeric > 0.25)
        or len(" ".join(release.split())) > 240
    )


def ambiguous_release_identity(release: str) -> bool:
    return bool(re.search(
        r"\b(best releases? of|various artists?|label sampler|benefit compilation|compilation vol(?:ume)?\.?\s*\w*)\b",
        release,
        re.I,
    ))


def existing_identity() -> tuple[set[str], set[str], set[str]]:
    hosts: set[str] = set()
    names: set[str] = set()
    releases: set[str] = set()
    for path in ARTISTS.glob("*.json"):
        manifest = read_json(path, {})
        host = bandcamp_host(manifest.get("bandcampUrl"))
        if host:
            hosts.add(host)
        name = normalized_name(manifest.get("artist"))
        if name:
            names.add(name)
        url = canonical_bandcamp_url(str(manifest.get("bandcampUrl") or ""))
        if url:
            releases.add(url)
    return hosts, names, releases


def existing_band_ids() -> set[str]:
    result: set[str] = set()
    for path in ARTISTS.glob("*.json"):
        manifest = read_json(path, {})
        band_id = str((manifest.get("canonicalIdentity") or {}).get("bandcampBandId") or "")
        if band_id.isdigit():
            result.add(band_id)
    return result


def preliminary_reason(item: dict[str, Any], hosts: set[str], names: set[str], releases: set[str]) -> str | None:
    url = source_url(item)
    host = bandcamp_host(url)
    artist = artist_name(item)
    release = release_name(item)
    if not host or not url:
        return "UNSUPPORTED_PAGE"
    if not artist or not release or not str(item.get("item_id") or "").isdigit():
        return "INVALID_METADATA"
    if not canonical_artist_host_supported(artist, url):
        return "MANUAL_REVIEW"
    if ambiguous_artist_entity(artist):
        return "MANUAL_REVIEW"
    if ambiguous_release_identity(release):
        return "MANUAL_REVIEW"
    featured_artist = " ".join(str(item.get("featured_artist") or "").split())
    if featured_artist and normalized_name(featured_artist) != normalized_name(artist):
        return "MANUAL_REVIEW"
    if malformed_artist_identity(artist, release):
        return "SPAM_OR_PLACEHOLDER"
    if re.search(r"\b(test(?:ing)?(?: only)?|placeholder|do not buy|dev(?:elopment)? build)\b", f"{artist} {release}", re.I) or NON_MUSIC_PRODUCT.search(f"{artist} {release}"):
        return "SPAM_OR_PLACEHOLDER"
    if host in hosts:
        return "DUPLICATE_ARTIST"
    if url in releases:
        return "DUPLICATE_RELEASE"
    if normalized_name(artist) in names:
        return "MANUAL_REVIEW"
    try:
        if int(item.get("track_count") or 0) < 1:
            return "NO_PLAYABLE_TRACK"
    except (TypeError, ValueError):
        return "INVALID_METADATA"
    return None


def candidate_record(item: dict[str, Any], water: str, tag: str, slice_name: str = "new") -> dict[str, Any]:
    featured_artist = " ".join(str((item.get("featured_track") or {}).get("band_name") or "").split())
    return {
        "candidateId": hashlib.sha256(source_url(item).encode()).hexdigest()[:20],
        "artist": artist_name(item), "release": release_name(item), "bandcampUrl": source_url(item),
        "sourceIdentifier": str(item.get("item_id") or ""), "sourceType": "bandcamp-discover",
        "sourceUrl": DISCOVER_URL, "sourceWater": water, "sourceTag": tag,
        "sourceSlice": slice_name,
        "featuredArtist": featured_artist,
        "location": " ".join(str(item.get("band_location") or item.get("location") or "").split()),
        "releaseDate": str(item.get("release_date") or ""),
        "tags": list(dict.fromkeys(str(value).strip() for value in (item.get("tags") or []) if str(value).strip()))[:20],
        "artworkReference": (item.get("primary_image") or {}).get("image_id") or item.get("art_id"),
        "discoveredAt": now(), "parserVersion": "bulk-1.0", "status": "PENDING", "reason": None,
    }


def batch_number(batch_id: str) -> int:
    match = re.search(r"batch-(\d{2})", batch_id)
    return max(1, int(match.group(1))) if match else 1


def discover_candidate_pool(limit: int, batch_id: str = "bulk-5000-batch-01") -> list[dict[str, Any]]:
    feed_count = sum(len(tags) for tags in WATER_TAGS.values())
    window_per_feed = math.ceil(limit / feed_count)
    skip_per_feed = (batch_number(batch_id) - 1) * window_per_feed
    feeds = deque(
        DiscoverFeed(water, tag, "top" if index < 4 else "new", skip_per_feed)
        for water in WATERS
        for index, tag in enumerate(WATER_TAGS[water])
    )
    candidates: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    while feeds and len(candidates) < limit:
        feed = feeds.popleft()
        try:
            item = feed.next()
        except Exception:
            feed.exhausted = True
            item = None
        if item:
            url = source_url(item)
            if url and url not in seen_urls:
                seen_urls.add(url)
                candidates.append(candidate_record(item, feed.water, feed.tag, feed.slice_name))
        if not feed.exhausted or feed.items:
            feeds.append(feed)
    return candidates


def candidate_as_discover_item(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "item_id": candidate["sourceIdentifier"], "item_url": candidate["bandcampUrl"],
        "band_name": candidate["artist"], "album_artist": candidate["artist"], "title": candidate["release"],
        "release_date": candidate.get("releaseDate"), "band_location": candidate.get("location"),
        "tags": candidate.get("tags") or [], "track_count": 1,
        "featured_artist": candidate.get("featuredArtist") or "",
    }


def validate_candidate(candidate: dict[str, Any], batch_id: str, sequence: int) -> tuple[dict[str, Any], dict[str, Any]]:
    if candidate.get("identityVerified") is not True or candidate.get("identityIsLabel") is not False:
        raise ValueError("Canonical Bandcamp artist identity is not verified")
    waters = list(dict.fromkeys([
        candidate["sourceWater"],
        *classify_waters([candidate["sourceTag"], *(candidate.get("tags") or [])], f"{candidate['artist']} {candidate['release']}", candidate["bandcampUrl"]),
    ]))[:3]
    slug = slugify(f"{candidate['artist']}-{candidate['release']}")
    result = create_artist(
        candidate["artist"], candidate["bandcampUrl"], AUTOMATED_VISUAL_STYLES[sequence % len(AUTOMATED_VISUAL_STYLES)],
        "https://raggedya.github.io/cosmic-aquarium", verify_qr=False, cache_key=batch_id,
        slug_override=slug, release_title=candidate["release"], release_date=candidate.get("releaseDate") or "",
        batch_id=batch_id, generate_qr=False, metadata_tags=[candidate["sourceTag"], *(candidate.get("tags") or [])],
        waters=waters, primary_location=candidate.get("location") or "", persist=False,
    )
    manifest = result.pop("_manifest")
    if not str(manifest.get("bioShort") or "").strip() or manifest.get("bioSource") not in {"bandcamp-description", "metadata-derived"}:
        raise ValueError("Validated artist is missing factual ticker biography metadata")
    manifest["provenance"] = {
        "sourceType": candidate["sourceType"], "sourceUrl": candidate["sourceUrl"],
        "discoveredUrl": candidate["bandcampUrl"], "discoveredAt": candidate["discoveredAt"],
        "importedAt": now(), "importerVersion": candidate["parserVersion"], "batchId": batch_id,
    }
    manifest["canonicalIdentity"] = {
        "bandcampHost": bandcamp_host(candidate["bandcampUrl"]),
        "bandcampBandId": candidate.get("identityBandId") or None,
        "source": candidate.get("identitySource") or "bandcamp-public-artist-index",
        "verifiedAsLabel": False,
        "verifiedAt": now(),
    }
    record = {
        "id": slug, "artist": candidate["artist"], "release": candidate["release"],
        "sourceIdentifier": candidate["sourceIdentifier"], "bandcampUrl": candidate["bandcampUrl"],
        "releaseDate": candidate.get("releaseDate"), "artworkReference": candidate.get("artworkReference"),
        "tags": result["metadata_tags"], "location": manifest.get("primaryLocation"), "waters": result["waters"],
        "sourceWater": candidate["sourceWater"], "sourceTag": candidate["sourceTag"], "sourceSlice": candidate.get("sourceSlice"),
        "discoveredAt": candidate["discoveredAt"], "importedAt": manifest["provenance"]["importedAt"],
        "aquariumUrl": result["page_url"].split("?", 1)[0], "visualStyle": result["visual_style"],
        "trackCount": result["tracks"], "status": "published", "provenance": manifest["provenance"],
        "bioShort": manifest["bioShort"], "bioSource": manifest["bioSource"],
        "canonicalIdentity": manifest["canonicalIdentity"],
    }
    return manifest, record


def failure_reason(error: Exception) -> str:
    text = str(error).casefold()
    if "requires at least" in text or "playable" in text:
        return "NO_PLAYABLE_TRACK"
    if "404" in text or "410" in text or "not found" in text:
        return "DEAD_URL"
    if "valid https bandcamp" in text or "html page" in text:
        return "UNSUPPORTED_PAGE"
    return "VALIDATION_FAILED"


def new_state(batch_id: str, target: int, candidate_limit: int, dry_run: bool) -> dict[str, Any]:
    return {
        "schemaVersion": 1, "id": batch_id, "mode": "dry-run" if dry_run else "publish",
        "status": "discovering", "startedAt": now(), "completedAt": None,
        "targetAccepted": target, "candidateLimit": candidate_limit, "candidateCount": 0,
        "acceptedCount": 0, "rejectedCount": 0, "duplicateCount": 0, "reviewCount": 0,
        "errorCount": 0, "candidates": [], "accepted": [], "rejections": [], "errors": [],
    }


def report_for(state: dict[str, Any]) -> dict[str, Any]:
    reasons = Counter(item.get("reason") for item in state.get("rejections", []) if item.get("reason"))
    waters = Counter(water for item in state.get("accepted", []) for water in item.get("waters") or [])
    countries = Counter(country_from_location(item.get("location")) for item in state.get("accepted", []) if item.get("location"))
    sources = Counter(item.get("sourceTag") for item in state.get("accepted", []) if item.get("sourceTag"))
    slices = Counter(item.get("sourceSlice") for item in state.get("accepted", []) if item.get("sourceSlice"))
    accepted = list(state.get("accepted", []))
    rng = random.Random(state["id"])
    qa_sample = rng.sample(accepted, min(25, len(accepted)))
    water_samples = {
        water: rng.sample([item for item in accepted if water in (item.get("waters") or [])], min(5, sum(water in (item.get("waters") or []) for item in accepted)))
        for water in WATERS
    }
    compact = lambda item: {
        "artist": item.get("artist"), "release": item.get("release"), "bandcampUrl": item.get("bandcampUrl"),
        "waters": item.get("waters") or [], "trackCount": item.get("trackCount"), "bioSource": item.get("bioSource"),
    }
    return {
        "batchId": state["id"], "mode": state["mode"], "status": state["status"],
        "candidatesDiscovered": state["candidateCount"], "acceptedNewArtists": state["acceptedCount"],
        "duplicatesRejected": sum(reasons[reason] for reason in ("DUPLICATE_ARTIST", "DUPLICATE_RELEASE")),
        "invalidOrDead": sum(reasons[reason] for reason in ("DEAD_URL", "INVALID_METADATA", "UNSUPPORTED_PAGE", "VALIDATION_FAILED")),
        "noPlayableTrack": reasons["NO_PLAYABLE_TRACK"], "manualReview": reasons["MANUAL_REVIEW"],
        "otherQualityRejects": reasons["SPAM_OR_PLACEHOLDER"], "rejectionReasons": dict(sorted(reasons.items())),
        "waterDistribution": {water: waters[water] for water in WATERS},
        "countryDistribution": dict(countries.most_common()), "acceptedBySourceTag": dict(sources.most_common()),
        "acceptedBySourceSlice": dict(slices.most_common()),
        "qaSample": [compact(item) for item in qa_sample],
        "waterQaSamples": {water: [compact(item) for item in items] for water, items in water_samples.items()},
        "startedAt": state["startedAt"], "completedAt": state.get("completedAt"),
    }


def reconcile_published_batch(state: dict[str, Any], batch_id: str, history: dict[str, Any]) -> bool:
    """Recover a publish interrupted between manifest/history/state writes.

    Artist manifests are the durable source of truth. If a process stops after
    the atomic manifest write, reconstruct both batch state and release history
    instead of misclassifying the artist as a duplicate on resume.
    """
    changed = False
    accepted_ids = {str(item.get("id") or "") for item in state.get("accepted", [])}
    history_ids = {str(item.get("id") or "") for item in history.get("releases", [])}
    candidate_by_url = {
        canonical_bandcamp_url(str(item.get("bandcampUrl") or "")): item
        for item in state.get("candidates", [])
    }
    for path in ARTISTS.glob("*.json"):
        manifest = read_json(path, {})
        if manifest.get("dailyBatchId") != batch_id:
            continue
        slug = str(manifest.get("slug") or path.stem)
        provenance = manifest.get("provenance") or {}
        url = canonical_bandcamp_url(str(manifest.get("bandcampUrl") or ""))
        candidate = candidate_by_url.get(url) or candidate_by_url.get(
            canonical_bandcamp_url(str(provenance.get("discoveredUrl") or ""))
        ) or {}
        record = {
            **candidate,
            "candidateId": candidate.get("candidateId") or hashlib.sha256(url.encode()).hexdigest()[:20],
            "id": slug,
            "artist": manifest.get("artist"),
            "release": manifest.get("releaseTitle"),
            "bandcampUrl": manifest.get("bandcampUrl"),
            "releaseDate": manifest.get("releaseDate"),
            "tags": manifest.get("metadataTags") or [],
            "location": manifest.get("primaryLocation"),
            "waters": manifest.get("waters") or [],
            "trackCount": len(manifest.get("tracks") or []),
            "status": "VALIDATED",
            "reason": None,
            "bioShort": manifest.get("bioShort"),
            "bioSource": manifest.get("bioSource"),
            "provenance": provenance,
        }
        if slug not in accepted_ids:
            state.setdefault("accepted", []).append(record)
            accepted_ids.add(slug)
            changed = True
        if slug not in history_ids:
            history.setdefault("releases", []).append({**record, "status": "published"})
            history_ids.add(slug)
            changed = True
    if changed:
        state["acceptedCount"] = len(state.get("accepted", []))
    return changed


def run(batch_id: str, target: int, candidate_limit: int, dry_run: bool, delay: float) -> dict[str, Any]:
    state_dir = DRY_RUNS if dry_run else BATCHES
    state_path = state_dir / f"{batch_id}.json"
    report_path = REPORTS / f"{batch_id}.json"
    state = read_json(state_path, new_state(batch_id, target, candidate_limit, dry_run))
    state["targetAccepted"] = target
    state["candidateLimit"] = candidate_limit
    # Quality rules can improve between resumptions. A dry run must re-evaluate
    # its provisional accepts instead of preserving a row that a newer gate now rejects.
    if dry_run and state.get("accepted"):
        retained = []
        retained_band_ids: set[str] = set()
        for accepted in state["accepted"]:
            reason = "SPAM_OR_PLACEHOLDER" if NON_MUSIC_PRODUCT.search(f"{accepted.get('artist', '')} {accepted.get('release', '')}") else None
            if not reason and not canonical_artist_host_supported(str(accepted.get("artist") or ""), str(accepted.get("bandcampUrl") or "")):
                reason = "MANUAL_REVIEW"
            if not reason and ambiguous_artist_entity(str(accepted.get("artist") or "")):
                reason = "MANUAL_REVIEW"
            if not reason and ambiguous_release_identity(str(accepted.get("release") or "")):
                reason = "MANUAL_REVIEW"
            if not reason and malformed_artist_identity(str(accepted.get("artist") or ""), str(accepted.get("release") or "")):
                reason = "SPAM_OR_PLACEHOLDER"
            if not reason and not accepted.get("identityVerified"):
                identity = verify_bandcamp_artist_identity(str(accepted.get("artist") or ""), str(accepted.get("bandcampUrl") or ""))
                accepted.update(identity)
                if not identity["identityVerified"] or identity["identityIsLabel"]:
                    reason = "MANUAL_REVIEW"
            band_id = str(accepted.get("identityBandId") or "")
            if not reason and band_id and band_id in retained_band_ids:
                reason = "DUPLICATE_ARTIST"
            if reason:
                state["rejections"].append({**accepted, "status": "REJECTED", "reason": reason, "processedAt": now()})
            else:
                retained.append(accepted)
                if band_id:
                    retained_band_ids.add(band_id)
        state["accepted"] = retained
        state["acceptedCount"] = len(retained)
        state["rejectedCount"] = len(state.get("rejections", []))
    if not state.get("candidates"):
        state["status"] = "discovering"
        state["candidates"] = discover_candidate_pool(candidate_limit, batch_id)
        state["candidateCount"] = len(state["candidates"])
        write_json(state_path, state)

    history = read_json(HISTORY, {"schemaVersion": 1, "releases": []})
    if not dry_run and reconcile_published_batch(state, batch_id, history):
        write_json(HISTORY, history)
        write_json(state_path, state)
    existing_hosts, existing_names, existing_releases = existing_identity()
    known_band_ids = existing_band_ids()
    accepted_hosts = {bandcamp_host(item.get("bandcampUrl")) for item in state.get("accepted", [])}
    accepted_names = {normalized_name(item.get("artist")) for item in state.get("accepted", [])}
    accepted_releases = {canonical_bandcamp_url(str(item.get("bandcampUrl") or "")) for item in state.get("accepted", [])}
    accepted_band_ids = {str(item.get("identityBandId") or "") for item in state.get("accepted", []) if str(item.get("identityBandId") or "").isdigit()}
    terminal_ids = {item.get("candidateId") for item in [*state.get("accepted", []), *state.get("rejections", [])]}
    state["status"] = "validating"
    write_json(state_path, state)

    for candidate in state["candidates"]:
        if state["acceptedCount"] >= target:
            break
        if candidate.get("candidateId") in terminal_ids:
            continue
        item = candidate_as_discover_item(candidate)
        reason = preliminary_reason(item, existing_hosts | accepted_hosts, existing_names | accepted_names, existing_releases | accepted_releases)
        if reason:
            rejected = {**candidate, "status": "REJECTED" if reason != "MANUAL_REVIEW" else "REVIEW", "reason": reason, "processedAt": now()}
            state["rejections"].append(rejected)
            state["reviewCount"] += int(reason == "MANUAL_REVIEW")
            state["duplicateCount"] += int(reason in {"DUPLICATE_ARTIST", "DUPLICATE_RELEASE"})
            state["rejectedCount"] += 1
            terminal_ids.add(candidate["candidateId"])
            write_json(state_path, state)
            continue
        identity = verify_bandcamp_artist_identity(candidate["artist"], candidate["bandcampUrl"])
        candidate.update(identity)
        if not identity["identityVerified"] or identity["identityIsLabel"]:
            rejected = {**candidate, "status": "REVIEW", "reason": "MANUAL_REVIEW", "processedAt": now()}
            state["rejections"].append(rejected)
            state["reviewCount"] += 1
            state["rejectedCount"] += 1
            terminal_ids.add(candidate["candidateId"])
            write_json(state_path, state)
            continue
        if identity["identityBandId"] in known_band_ids or identity["identityBandId"] in accepted_band_ids:
            rejected = {**candidate, "status": "REJECTED", "reason": "DUPLICATE_ARTIST", "processedAt": now()}
            state["rejections"].append(rejected)
            state["duplicateCount"] += 1
            state["rejectedCount"] += 1
            terminal_ids.add(candidate["candidateId"])
            write_json(state_path, state)
            continue
        try:
            manifest, record = validate_candidate(candidate, batch_id, state["acceptedCount"])
            accepted = {**candidate, **record, "candidateId": candidate["candidateId"], "status": "VALIDATED", "reason": None}
            if not dry_run:
                persist_artist_files(record["id"], record["artist"], manifest)
                history["releases"].append(record)
                write_json(HISTORY, history)
            state["accepted"].append(accepted)
            state["acceptedCount"] += 1
            host = bandcamp_host(record["bandcampUrl"])
            accepted_hosts.add(host)
            accepted_names.add(normalized_name(record["artist"]))
            accepted_releases.add(canonical_bandcamp_url(record["bandcampUrl"]))
            accepted_band_ids.add(str(candidate["identityBandId"]))
            terminal_ids.add(candidate["candidateId"])
            print(f"[{state['acceptedCount']}/{target}] {record['artist']} — {record['release']} ({record['trackCount']} tracks)", flush=True)
        except Exception as error:
            reason = failure_reason(error)
            state["rejections"].append({**candidate, "status": "REJECTED", "reason": reason, "error": str(error)[:500], "processedAt": now()})
            state["rejectedCount"] += 1
            state["errorCount"] += int(reason == "VALIDATION_FAILED")
            terminal_ids.add(candidate["candidateId"])
        write_json(state_path, state)
        time.sleep(max(0.2, delay))

    state["status"] = "complete" if state["acceptedCount"] >= target else "candidate_pool_exhausted"
    state["completedAt"] = now()
    write_json(state_path, state)
    report = report_for(state)
    write_json(report_path, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run or resume one validated Cosmic Aquaria 500-artist batch")
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--target-accepted", type=int, default=DEFAULT_TARGET)
    parser.add_argument("--candidate-limit", type=int, default=DEFAULT_CANDIDATES)
    parser.add_argument("--delay", type=float, default=0.55)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"bulk-5000-batch-\d{2}(?:-dry-run)?", args.batch_id):
        raise SystemExit("Batch ID must look like bulk-5000-batch-01 or bulk-5000-batch-01-dry-run")
    current_artists = len(existing_identity()[0])
    remaining = max(0, PROGRAMME_TARGET - current_artists)
    if remaining == 0:
        raise SystemExit("BULK 5,000 PROGRAMME COMPLETE")
    safe_target = max(1, min(500, remaining, args.target_accepted))
    report = run(args.batch_id, safe_target, max(20, min(1_500, args.candidate_limit)), args.dry_run, args.delay)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
