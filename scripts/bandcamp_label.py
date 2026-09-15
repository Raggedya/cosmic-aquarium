from __future__ import annotations

import random
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from create_artist import (
    COLORS,
    artist_store_url,
    concise_bio,
    duration_label,
    fetch_page,
    halton,
    release_date_from_payload,
    slugify,
    validate_bandcamp_url,
    validate_possible_track_link,
    year_from,
)


LABEL_TRACK_LIMIT = 35
GENERIC_ARTISTS = {"various", "various artist", "various artists", "v/a", "va", "unknown artist"}
DISTINCT_VERSION = re.compile(r"\b(live|remix|demo|alternate|alternative|acoustic|instrumental|radio edit|extended|rework)\b", re.I)
REISSUE_SUFFIX = re.compile(r"\s*(?:[-–—]|\(|\[)\s*(?:\d{4}\s+)?(?:re)?master(?:ed)?[^\])]*[\])]?$", re.I)


def clean(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def is_generic_artist(value: Any) -> bool:
    return clean(value).casefold() in GENERIC_ARTISTS


def label_name_from_pages(profile: Any, music: Any, final_url: str) -> str:
    for parser in (profile, music):
        for value in (parser.og.get("og:site_name"), parser.og.get("og:title"), parser.page_title):
            name = clean(value)
            name = re.sub(r"^(?:music|merch)\s*[|·-]\s*", "", name, flags=re.I)
            name = re.sub(r"\s*[|·-]\s*bandcamp\s*$", "", name, flags=re.I)
            if name and name.casefold() not in {"music", "bandcamp"}:
                return name
        for node in parser.json_ld:
            if isinstance(node, dict):
                publisher = node.get("publisher")
                if isinstance(publisher, dict) and clean(publisher.get("name")):
                    return clean(publisher.get("name"))
    host = (urllib.parse.urlparse(final_url).hostname or "Bandcamp label").split(".")[0]
    return re.sub(r"[-_]", " ", host).title()


def release_items(parser: Any, root_url: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in parser.client_items:
        page_url = clean(raw.get("page_url"))
        try:
            page_url = validate_bandcamp_url(page_url.replace("http://", "https://", 1))
        except ValueError:
            continue
        if page_url in seen:
            continue
        seen.add(page_url)
        items.append({
            "artist": clean(raw.get("artist")),
            "title": clean(raw.get("title")),
            "type": clean(raw.get("type")),
            "pageUrl": page_url,
            "artId": raw.get("art_id"),
        })
    for path in sorted(parser.album_links):
        page_url = validate_bandcamp_url(urllib.parse.urljoin(root_url, path))
        if page_url not in seen:
            seen.add(page_url)
            items.append({"artist": "", "title": "", "type": "", "pageUrl": page_url, "artId": None})
    return items


def detect_bandcamp_mode(url: str) -> dict[str, Any]:
    supplied = validate_bandcamp_url(url)
    parsed = urllib.parse.urlparse(supplied)
    profile, final_url = fetch_page(supplied)
    if re.match(r"^/(?:album|track)/", urllib.parse.urlparse(final_url).path):
        artist = clean(next((payload.get("artist") for payload in profile.tralbum if clean(payload.get("artist"))), ""))
        return {"mode": "release", "name": artist or clean(profile.og.get("og:site_name")), "sourceUrl": final_url, "artistCount": 1, "releaseCount": 1}
    root = artist_store_url(final_url)
    if not root:
        raise ValueError("Use a Bandcamp artist or label storefront URL")
    music, music_url = fetch_page(urllib.parse.urljoin(root, "/music"))
    items = release_items(music, music_url)
    artists = {clean(item.get("artist")).casefold() for item in items if clean(item.get("artist")) and not is_generic_artist(item.get("artist"))}
    if len(artists) < 2 and items:
        for item in items[:8]:
            try:
                release, _ = fetch_page(str(item["pageUrl"]))
            except Exception:
                continue
            for payload in release.tralbum:
                artist = clean(payload.get("artist") or (payload.get("current") or {}).get("artist"))
                if artist and not is_generic_artist(artist):
                    artists.add(artist.casefold())
            if len(artists) >= 2:
                break
    mode = "label" if len(artists) >= 2 else "artist"
    return {
        "mode": mode,
        "name": label_name_from_pages(profile, music, final_url),
        "sourceUrl": root,
        "artistCount": len(artists) if artists else 1,
        "releaseCount": len(items),
        "items": items,
        "profile": profile,
        "music": music,
    }


def compilation_artist_and_title(track_artist: Any, release_artist: Any, title: Any) -> tuple[str, str]:
    explicit = clean(track_artist)
    release = clean(release_artist)
    track_title = clean(title)
    if explicit and not is_generic_artist(explicit):
        return explicit, track_title
    if release and not is_generic_artist(release):
        return release, track_title
    for separator in (" — ", " – ", " - "):
        if separator in track_title:
            possible_artist, possible_title = (clean(part) for part in track_title.split(separator, 1))
            if possible_artist and possible_title and len(possible_artist) <= 100:
                return possible_artist, possible_title
    return "", track_title


def semantic_track_key(track: dict[str, Any]) -> str:
    artist = re.sub(r"[^a-z0-9]+", " ", clean(track.get("artist")).casefold()).strip()
    title = clean(track.get("title")).casefold()
    if not DISTINCT_VERSION.search(title):
        title = REISSUE_SUFFIX.sub("", title)
        title = re.sub(r"\s*[\[(](?:album|single) version[\])]$", "", title, flags=re.I)
    title = re.sub(r"[^a-z0-9]+", " ", title).strip()
    return f"{artist}|{title}"


def deduplicate_label_tracks(tracks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    result: list[dict[str, Any]] = []
    by_id: set[str] = set()
    semantic: set[str] = set()
    excluded = 0
    for track in tracks:
        track_id = clean(track.get("bandcampEmbedTrackId"))
        key = semantic_track_key(track)
        if not track_id.isdigit() or track_id in by_id or not key or key in semantic:
            excluded += 1
            continue
        by_id.add(track_id)
        semantic.add(key)
        result.append(track)
    return result, excluded


def _release_tracks(item: dict[str, Any], label_name: str, label_url: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    parser, final_url = fetch_page(str(item["pageUrl"]))
    artwork = clean(parser.og.get("og:image"))
    tags = list(dict.fromkeys(clean(tag) for tag in parser.tags if clean(tag)))
    tracks: list[dict[str, Any]] = []
    unattributed = 0
    for payload in parser.tralbum:
        current = payload.get("current") or {}
        release_title = clean(current.get("title") or payload.get("album_title") or item.get("title") or "Bandcamp")
        release_artist = clean(payload.get("artist") or current.get("artist") or item.get("artist"))
        release_date = clean(release_date_from_payload(payload))
        bio = concise_bio(current.get("about"), release_artist)
        release_store = artist_store_url(final_url)
        artist_url = release_store if release_store and release_store.rstrip("/").casefold() != label_url.rstrip("/").casefold() else None
        for offset, source in enumerate(payload.get("trackinfo") or []):
            if not isinstance(source, dict):
                continue
            artist, title = compilation_artist_and_title(source.get("artist"), release_artist, source.get("title"))
            track_id = clean(source.get("track_id"))
            if not artist:
                unattributed += 1
                continue
            if not title or not track_id.isdigit():
                continue
            link = urllib.parse.urljoin(final_url, clean(source.get("title_link")))
            if not validate_possible_track_link(link):
                link = final_url
            index = len(tracks) + offset + 1
            tracks.append({
                "id": f"{slugify(artist)}-{track_id}",
                "title": title,
                "artist": artist,
                "artistUrl": artist_url,
                "artistBandcampUrl": artist_url,
                "albumTitle": release_title,
                "releaseTitle": release_title,
                "albumKey": slugify(release_title),
                "year": year_from(release_date),
                "releaseDate": release_date or None,
                "trackNumber": int(source.get("track_num") or offset + 1),
                "duration": duration_label(source.get("duration")),
                "x": round(0.075 + halton(index, 2) * 0.85, 6),
                "y": round(0.075 + halton(index, 3) * 0.85, 6),
                "zone": "Label discovery catalogue",
                "note": "Public Bandcamp label track",
                "bandcampUrl": link,
                "trackUrl": link,
                "bandcampEmbedTrackId": track_id,
                "sourcePage": final_url,
                "releaseUrl": final_url,
                "artworkUrl": artwork or None,
                "coverArtUrl": artwork or None,
                "tags": tags,
                "labelName": label_name,
                "labelUrl": label_url,
                "bio": bio or None,
                "isLocked": False,
                "isSelected": False,
                "accent": COLORS[(index - 1) % len(COLORS)],
            })
    return tracks, {"url": final_url, "title": clean(item.get("title")), "unattributed": unattributed}


def discover_label_catalogue(
    url: str,
    *,
    detection: dict[str, Any] | None = None,
    progress: Callable[[int, int], None] | None = None,
    workers: int = 4,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    detection = detection or detect_bandcamp_mode(url)
    if detection["mode"] != "label":
        raise ValueError(f"Bandcamp {detection['mode']} page detected; the existing single-band workflow should be used")
    label_name = clean(detection["name"])
    label_url = clean(detection["sourceUrl"])
    items = list(detection.get("items") or [])
    if not items:
        raise ValueError("Multiple artists were indicated but no public label releases could be enumerated")
    candidates: list[dict[str, Any]] = []
    failures: list[str] = []
    unattributed = 0
    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 6))) as executor:
        futures = {executor.submit(_release_tracks, item, label_name, label_url): item for item in items}
        for future in as_completed(futures):
            item = futures[future]
            try:
                tracks, audit = future.result()
                candidates.extend(tracks)
                unattributed += int(audit.get("unattributed") or 0)
            except Exception:
                failures.append(str(item.get("pageUrl") or "unknown release"))
            completed += 1
            if progress:
                progress(completed, len(items))
    unique, duplicate_count = deduplicate_label_tracks(candidates)
    artists = sorted({clean(track.get("artist")) for track in unique if clean(track.get("artist"))}, key=str.casefold)
    if len(artists) < 2:
        raise ValueError(f"{len(artists)} reliably attributed artist was found; this page cannot safely be treated as a label")
    if not unique:
        raise ValueError("No playable, reliably attributed Bandcamp tracks were found for this label")
    profile = detection.get("profile")
    metadata = {
        "mode": "label",
        "labelName": label_name,
        "labelUrl": label_url,
        "bio": concise_bio(profile.og.get("og:description"), label_name) if profile else "",
        "heroArtwork": next((track.get("artworkUrl") for track in unique if track.get("artworkUrl")), None),
        "artistCount": len(artists),
        "artists": artists,
        "releaseCount": len(items),
        "eligibleTrackCount": len(unique),
        "failedReleaseCount": len(failures),
        "failedReleasePages": failures[:20],
        "unattributedTrackCount": unattributed,
        "duplicateTrackCount": duplicate_count,
    }
    return unique, metadata


def artist_balanced_selection(
    tracks: list[dict[str, Any]],
    limit: int = LABEL_TRACK_LIMIT,
    *,
    locked_ids: set[str] | None = None,
    rng: random.Random | random.SystemRandom | None = None,
) -> list[dict[str, Any]]:
    chooser = rng or random.SystemRandom()
    locked_ids = {str(value) for value in (locked_ids or set())}
    available = [dict(track) for track in tracks if clean(track.get("artist")) and clean(track.get("bandcampEmbedTrackId")).isdigit()]
    target = min(max(0, limit), len(available))
    locked = [track for track in available if str(track.get("id")) in locked_ids][:target]
    selected_ids = {str(track.get("id")) for track in locked}
    groups: dict[str, list[dict[str, Any]]] = {}
    display: dict[str, str] = {}
    for track in available:
        if str(track.get("id")) in selected_ids:
            continue
        key = clean(track.get("artist")).casefold()
        groups.setdefault(key, []).append(track)
        display[key] = clean(track.get("artist"))
    for values in groups.values():
        chooser.shuffle(values)
    counts: dict[str, int] = {}
    for track in locked:
        key = clean(track.get("artist")).casefold()
        counts[key] = counts.get(key, 0) + 1
    selected = locked.copy()
    while len(selected) < target:
        eligible = [key for key, values in groups.items() if values]
        if not eligible:
            break
        minimum = min(counts.get(key, 0) for key in eligible)
        balanced = [key for key in eligible if counts.get(key, 0) == minimum]
        key = chooser.choice(balanced)
        track = groups[key].pop()
        selected.append(track)
        counts[key] = counts.get(key, 0) + 1
    chooser.shuffle(selected)
    for track in selected:
        track["isSelected"] = True
        track["isLocked"] = str(track.get("id")) in locked_ids
    return selected
