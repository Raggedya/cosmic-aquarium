#!/usr/bin/env python3
"""Bounded label-roster ingestion for canonical Cosmic Aquaria artists.

Only a public label/roster page explicitly supplied by the administrator is read. Bandcamp
links on that page become reviewable collection memberships; Artist Aquaria are reused by
canonical Bandcamp host and are never copied into a label-specific artist table.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import subprocess
import sys
import urllib.parse
from dataclasses import asdict

from location_collections import (
    ROOT, COLLECTIONS_DIR, RESEARCH_DIR, Candidate, canonical_artist_id, fetch_text,
    load_existing_artists, normalize_bandcamp_artist_url, profile_metadata, slugify,
    unique_bandcamp_roots,
)


def roster_bandcamp_urls(roster_url: str, limit: int) -> list[str]:
    parsed = urllib.parse.urlparse(roster_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("A public HTTPS label or roster URL is required.")
    document = fetch_text(roster_url)
    links = [html.unescape(value) for value in re.findall(r'href=["\']([^"\']+)["\']', document, flags=re.I)]
    absolute = [urllib.parse.urljoin(roster_url, value) for value in links]
    return unique_bandcamp_roots(absolute, limit)


def research_label(label_name: str, website: str, roster_url: str | None, max_artists: int, build_missing: bool, candidate_urls: list[str] | None = None) -> dict:
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    name = re.sub(r"\s+", " ", label_name.strip())
    if not name:
        raise ValueError("Enter a label name.")
    source_url = (roster_url or website).strip()
    discovered = unique_bandcamp_roots(candidate_urls or [], max_artists * 2)
    if source_url:
        discovered = unique_bandcamp_roots(discovered + roster_bandcamp_urls(source_url, max_artists * 2), max_artists * 2)
    existing = load_existing_artists()
    candidates: list[Candidate] = []
    for url in discovered[:max_artists]:
        artist_id = canonical_artist_id(url)
        known = existing.get(artist_id)
        try:
            artist_name = str(known.get("artistName") if known else profile_metadata(url)["artistName"])
        except Exception:
            artist_name = urllib.parse.urlparse(url).hostname.split(".")[0]
        candidates.append(Candidate(
            artistId=artist_id,
            artistName=artist_name,
            bandcampArtistUrl=normalize_bandcamp_artist_url(url),
            verificationStatus="verified",
            verificationScore=1.0,
            source=source_url or "administrator-supplied",
            evidence=f"The administrator-supplied {name} roster links to this Bandcamp artist.",
            aquariumSlug=known.get("aquariumSlug") if known else None,
            aquariumUrl=known.get("aquariumUrl") if known else None,
            existingAquarium=bool(known),
            displayEnabled=bool(known),
        ))
    if build_missing:
        for index, candidate in enumerate(candidates):
            if candidate.existingAquarium:
                continue
            style = "cosmic" if index % 2 == 0 else "violet"
            command = [sys.executable, str(ROOT / "scripts" / "create_artist.py"), "--title", candidate.artistName, "--bandcamp-url", candidate.bandcampArtistUrl, "--visual-style", style, "--cache-key", now[:10].replace("-", "") + "-label"]
            try:
                result = json.loads(subprocess.run(command, check=True, capture_output=True, text=True).stdout)
            except Exception:
                candidate.verificationStatus = "probable"
                candidate.evidence += " Aquarium creation requires administrator review."
                continue
            candidate.aquariumSlug = result["slug"]
            candidate.aquariumUrl = result["page_url"].split("?", 1)[0]
            candidate.displayEnabled = True
    slug = slugify(name)
    COLLECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    target = COLLECTIONS_DIR / f"{slug}.json"
    prior = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    merged = {item["artistId"]: item for item in prior.get("members", [])}
    for candidate in candidates:
        if candidate.aquariumSlug:
            merged[candidate.artistId] = {**asdict(candidate), "addedAt": now}
    collection = {
        "schemaVersion": 1,
        "id": "label:" + slug,
        "slug": slug,
        "name": name,
        "type": "label",
        "description": f"Independent artists connected to {name}.",
        "status": prior.get("status", "draft"),
        "instruction": "TOUCH AN ARTIST",
        "theme": prior.get("theme", "cosmic"),
        "createdAt": prior.get("createdAt", now),
        "updatedAt": now,
        "metadata": {"website": website or None, "rosterUrl": roster_url or None, "lastResearchedAt": now},
        "members": list(merged.values()),
    }
    target.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    run_id = now.replace(":", "").replace("-", "") + "-label-" + slug
    log = {"id": run_id, "type": "label", "target": name, "timestamp": now, "source": source_url, "candidatesFound": len(candidates), "verified": sum(item.verificationStatus == "verified" for item in candidates), "duplicates": sum(item.existingAquarium for item in candidates), "newArtists": sum(not item.existingAquarium for item in candidates), "collectionSlug": slug}
    (RESEARCH_DIR / f"{run_id}.json").write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"collection": collection, "research": log}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label-name", required=True)
    parser.add_argument("--website", default="")
    parser.add_argument("--roster-url")
    parser.add_argument("--max-artists", type=int, default=100)
    parser.add_argument("--build-missing", action="store_true")
    parser.add_argument("--candidate-url", action="append", default=[])
    args = parser.parse_args()
    result = research_label(args.label_name, args.website, args.roster_url, max(1, min(250, args.max_artists)), args.build_missing, args.candidate_url)
    print(json.dumps({"slug": result["collection"]["slug"], "status": result["collection"]["status"], "members": len(result["collection"]["members"]), "research": result["research"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
