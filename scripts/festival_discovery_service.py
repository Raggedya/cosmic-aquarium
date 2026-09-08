from __future__ import annotations

import concurrent.futures
import dataclasses
import datetime as dt
import html
import ipaddress
import json
import os
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Iterable


MAX_FESTIVAL_ARTISTS = 35
MAX_LINEUP_CANDIDATES = 180
MAX_PAGE_BYTES = 3_000_000
DEFAULT_CACHE_SECONDS = 12 * 60 * 60
USER_AGENT = "AGGITS-Festivals/1.0 (+https://raggedya.github.io/cosmic-aquarium/)"
MATCHER_VERSION = "3"

LINEUP_WORDS = {"artist", "artists", "lineup", "line-up", "performer", "performers", "acts", "program", "programme", "schedule"}
LINKED_PAGE_WORDS = {"lineup", "line-up", "artists", "program", "programme", "schedule", "timetable", "acts"}
NON_ARTIST_WORDS = {
    "about", "accessibility", "accommodation", "applications", "artist", "artists", "buy tickets", "camping", "contact",
    "directions", "early bird", "event information", "faq", "festival", "food", "home", "information",
    "lineup", "location", "media", "merch", "news", "official lineup", "official program", "partners", "privacy", "program", "schedule",
    "sponsors", "stage", "terms", "tickets", "transport", "venue", "volunteers",
}
SEARCH_HOST_PENALTIES = {
    "facebook.com", "instagram.com", "tiktok.com", "ticketmaster.com", "moshtix.com.au", "eventbrite.com",
}

ProgressCallback = Callable[[str, int | None, int | None], None]


@dataclasses.dataclass(frozen=True)
class FestivalArtist:
    artist_name: str
    source_url: str | None = None
    direct_bandcamp_url: str | None = None


@dataclasses.dataclass(frozen=True)
class FestivalArtistMatch:
    artist_name: str
    festival_artist_url: str | None
    bandcamp_url: str | None
    match_status: str
    confidence: float
    evidence: tuple[str, ...]
    playable: bool = False


@dataclasses.dataclass(frozen=True)
class FestivalImportResult:
    festival_name: str
    festival_year: int | None
    festival_url: str | None
    source_url: str | None
    dates: str | None
    location: str | None
    promotional_description: str | None
    ticker_text: str
    artists: tuple[FestivalArtistMatch, ...]
    warnings: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "festivalName": self.festival_name,
            "festivalYear": self.festival_year,
            "festivalUrl": self.festival_url,
            "sourceUrl": self.source_url,
            "dates": self.dates,
            "location": self.location,
            "promotionalDescription": self.promotional_description,
            "tickerText": self.ticker_text,
            "artists": [
                {
                    "artistName": item.artist_name,
                    "festivalArtistUrl": item.festival_artist_url,
                    "bandcampUrl": item.bandcamp_url,
                    "matchStatus": item.match_status,
                    "confidence": item.confidence,
                    "evidence": list(item.evidence),
                    "playable": item.playable,
                }
                for item in self.artists
            ],
            "warnings": list(self.warnings),
        }


@dataclasses.dataclass(frozen=True)
class Link:
    text: str
    url: str
    hint: str


@dataclasses.dataclass(frozen=True)
class TextBlock:
    tag: str
    text: str
    hint: str


@dataclasses.dataclass(frozen=True)
class PageSnapshot:
    url: str
    title: str
    description: str
    links: tuple[Link, ...]
    blocks: tuple[TextBlock, ...]
    json_ld: tuple[Any, ...]
    bandcamp_payloads: tuple[dict[str, Any], ...]


class StructuredPageParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.links: list[Link] = []
        self.blocks: list[TextBlock] = []
        self.json_ld: list[Any] = []
        self.bandcamp_payloads: list[dict[str, Any]] = []
        self._frames: list[dict[str, Any]] = []
        self._capture_title = False
        self._capture_json = False
        self._json_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag == "title":
            self._capture_title = True
        if tag == "meta":
            key = (values.get("property") or values.get("name") or "").lower()
            content = clean_space(values.get("content"))
            if key and content:
                self.meta[key] = content
        if tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._capture_json = True
            self._json_parts = []
        raw_tralbum = values.get("data-tralbum")
        if raw_tralbum:
            try:
                value = json.loads(html.unescape(raw_tralbum))
                if isinstance(value, dict):
                    self.bandcamp_payloads.append(value)
            except (json.JSONDecodeError, TypeError):
                pass
        hint = clean_space(" ".join((values.get("id", ""), values.get("class", ""), values.get("aria-label", "")))).lower()
        self._frames.append({"tag": tag, "href": values.get("href", ""), "hint": hint, "parts": []})

    def handle_data(self, data: str) -> None:
        if self._capture_title:
            self.title_parts.append(data)
        if self._capture_json:
            self._json_parts.append(data)
        for frame in self._frames:
            frame["parts"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._capture_title = False
        if tag == "script" and self._capture_json:
            try:
                self.json_ld.append(json.loads("".join(self._json_parts)))
            except (json.JSONDecodeError, TypeError):
                pass
            self._capture_json = False
            self._json_parts = []
        index = next((index for index in range(len(self._frames) - 1, -1, -1) if self._frames[index]["tag"] == tag), None)
        if index is None:
            return
        frame = self._frames.pop(index)
        text = clean_space("".join(frame["parts"]))
        if not text:
            return
        if tag == "a" and frame["href"]:
            self.links.append(Link(text=text, url=urllib.parse.urljoin(self.base_url, frame["href"]), hint=frame["hint"]))
        if tag in {"a", "li", "p", "h1", "h2", "h3", "h4", "strong"}:
            self.blocks.append(TextBlock(tag=tag, text=text, hint=frame["hint"]))

    def snapshot(self, final_url: str) -> PageSnapshot:
        description = self.meta.get("og:description") or self.meta.get("description") or self.meta.get("twitter:description") or ""
        title = self.meta.get("og:title") or clean_space("".join(self.title_parts))
        return PageSnapshot(
            url=final_url,
            title=title,
            description=description,
            links=tuple(self.links),
            blocks=tuple(self.blocks),
            json_ld=tuple(self.json_ld),
            bandcamp_payloads=tuple(self.bandcamp_payloads),
        )


class DuckDuckGoParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.results: list[tuple[str, str]] = []
        self._href = ""
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "a" and "result__a" in (values.get("class") or ""):
            self._href = values.get("href") or ""
            self._parts = []
    def handle_data(self, data: str) -> None:
        if self._href:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href:
            href = self._href
            parsed = urllib.parse.urlparse(href)
            target = urllib.parse.parse_qs(parsed.query).get("uddg", [href])[0]
            self.results.append((clean_space("".join(self._parts)), target))
            self._href = ""
            self._parts = []


class SearchUnavailable(RuntimeError):
    """Raised when every configured web-search provider is unavailable."""


def clean_space(value: Any) -> str:
    return " ".join(html.unescape(str(value or "")).replace("\u00a0", " ").split()).strip()


def normalise_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", clean_space(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def clean_artist_name(value: str) -> str:
    value = clean_space(value).strip("•·|,;:–—- ")
    value = re.sub(r"^(?:presenting|featuring|with)\s+", "", value, flags=re.I)
    value = re.sub(r"\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$", "", value, flags=re.I)
    value = re.sub(r"\s+[|–—]\s+(?:[^|–—]{0,30}\s+)?(?:stage|room|arena|tent)\b.*$", "", value, flags=re.I)
    return clean_space(value).strip("•·|,;:–—- ")


def is_probable_artist(value: str) -> bool:
    name = clean_artist_name(value)
    normal = normalise_name(name)
    if not name or not normal or normal in NON_ARTIST_WORDS:
        return False
    if len(name) < 2 or len(name) > 90 or len(name.split()) > 10:
        return False
    if re.fullmatch(r"(?:19|20)\d{2}", name) or re.search(r"\b(?:tickets?|sponsor|venue|stage|doors? open|terms|privacy)\b", normal):
        return False
    if sum(char.isalpha() for char in name) < 2:
        return False
    return True


def validate_public_url(value: str) -> str:
    value = clean_space(value)
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError as error:
        raise ValueError("Enter a valid festival URL") from error
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Enter a normal HTTP or HTTPS festival URL")
    host = parsed.hostname.casefold()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("Local network addresses cannot be used as festival sources")
    try:
        address = ipaddress.ip_address(host)
        if not address.is_global:
            raise ValueError("Private network addresses cannot be used as festival sources")
    except ValueError as error:
        if "Private network" in str(error):
            raise
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", parsed.query, ""))


def validate_bandcamp_artist_url(value: str) -> str:
    url = validate_public_url(value)
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").casefold().removeprefix("www.")
    if host == "bandcamp.com" or not host.endswith(".bandcamp.com"):
        raise ValueError("Use an artist-owned Bandcamp URL")
    return urllib.parse.urlunparse(("https", parsed.netloc, "/", "", "", ""))


def fetch_page(url: str, timeout: float = 22.0) -> PageSnapshot:
    requested = validate_public_url(url)
    request = urllib.request.Request(requested, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_type()
        if content_type not in {"text/html", "application/xhtml+xml"}:
            raise ValueError("The festival source did not return a readable web page")
        body = response.read(MAX_PAGE_BYTES + 1)
        if len(body) > MAX_PAGE_BYTES:
            raise ValueError("The festival page was too large to inspect safely")
        final_url = validate_public_url(response.geturl())
        encoding = response.headers.get_content_charset() or "utf-8"
    parser = StructuredPageParser(final_url)
    parser.feed(body.decode(encoding, "replace"))
    return parser.snapshot(final_url)


def page_from_html(raw_html: str, url: str = "https://festival.example/") -> PageSnapshot:
    parser = StructuredPageParser(url)
    parser.feed(raw_html)
    return parser.snapshot(url)


def _walk_json(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _walk_json(child)


def _json_types(value: dict[str, Any]) -> set[str]:
    raw = value.get("@type")
    return {str(item).casefold() for item in (raw if isinstance(raw, list) else [raw]) if item}


def _performers_from_value(value: Any, source_url: str) -> list[FestivalArtist]:
    items = value if isinstance(value, list) else [value]
    output: list[FestivalArtist] = []
    for item in items:
        if isinstance(item, str):
            name, artist_url, same_as = item, None, []
        elif isinstance(item, dict):
            name = clean_space(item.get("name"))
            artist_url = clean_space(item.get("url")) or None
            raw_same_as = item.get("sameAs") or []
            same_as = raw_same_as if isinstance(raw_same_as, list) else [raw_same_as]
        else:
            continue
        name = clean_artist_name(name)
        if not is_probable_artist(name):
            continue
        direct = next((str(url) for url in same_as if "bandcamp.com" in str(url).casefold()), None)
        output.append(FestivalArtist(name, urllib.parse.urljoin(source_url, artist_url) if artist_url else None, direct))
    return output


def extract_page_metadata(snapshot: PageSnapshot) -> dict[str, Any]:
    names: list[str] = []
    descriptions: list[str] = []
    starts: list[str] = []
    ends: list[str] = []
    locations: list[str] = []
    performers: list[FestivalArtist] = []
    for node in _walk_json(snapshot.json_ld):
        types = _json_types(node)
        if types & {"event", "musicevent", "festival"}:
            if node.get("name"):
                names.append(clean_space(node["name"]))
            if node.get("description"):
                descriptions.append(clean_space(node["description"]))
            if node.get("startDate"):
                starts.append(clean_space(node["startDate"]))
            if node.get("endDate"):
                ends.append(clean_space(node["endDate"]))
            location = node.get("location")
            if isinstance(location, str):
                locations.append(clean_space(location))
            elif isinstance(location, dict):
                address = location.get("address")
                address_text = address if isinstance(address, str) else ", ".join(clean_space(address.get(key)) for key in ("addressLocality", "addressRegion", "addressCountry") if isinstance(address, dict) and address.get(key))
                location_text = ", ".join(item for item in (clean_space(location.get("name")), clean_space(address_text)) if item)
                if location_text:
                    locations.append(location_text)
            for key in ("performer", "performers"):
                if key in node:
                    performers.extend(_performers_from_value(node[key], snapshot.url))
    return {
        "name": next((value for value in names if value), None),
        "description": next((value for value in descriptions if value), None) or snapshot.description or None,
        "start": next((value for value in starts if value), None),
        "end": next((value for value in ends if value), None),
        "location": next((value for value in locations if value), None),
        "performers": performers,
    }


def extract_lineup(snapshot: PageSnapshot) -> list[FestivalArtist]:
    metadata = extract_page_metadata(snapshot)
    candidates: list[FestivalArtist] = list(metadata["performers"])
    direct_bandcamp_by_name: dict[str, str] = {}
    for link in snapshot.links:
        try:
            if urllib.parse.urlparse(link.url).hostname and (urllib.parse.urlparse(link.url).hostname or "").casefold().endswith(".bandcamp.com"):
                direct_bandcamp_by_name[normalise_name(link.text)] = link.url
        except ValueError:
            continue

    active_lineup = False
    for block in snapshot.blocks:
        normal = normalise_name(block.text)
        if block.tag.startswith("h"):
            active_lineup = any(word.replace("-", " ") in normal for word in LINEUP_WORDS)
            continue
        hinted = any(word.replace("-", " ") in normalise_name(block.hint) for word in LINEUP_WORDS)
        if not (active_lineup or hinted or (block.tag == "a" and any(word in block.hint for word in LINEUP_WORDS))):
            continue
        values = re.split(r"\s*(?:\n|•|·|\||\u2022)\s*", block.text)
        for value in values:
            name = clean_artist_name(value)
            if is_probable_artist(name):
                candidates.append(FestivalArtist(name, snapshot.url, direct_bandcamp_by_name.get(normalise_name(name))))

    for link in snapshot.links:
        path_hint = normalise_name(f"{link.hint} {urllib.parse.urlparse(link.url).path}")
        if not any(word.replace("-", " ") in path_hint for word in {"artist", "artists", "act", "performer"}):
            continue
        name = clean_artist_name(link.text)
        if is_probable_artist(name):
            candidates.append(FestivalArtist(name, link.url, direct_bandcamp_by_name.get(normalise_name(name))))

    unique: list[FestivalArtist] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = normalise_name(candidate.artist_name)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
        if len(unique) >= MAX_LINEUP_CANDIDATES:
            break
    return unique


def related_lineup_links(snapshot: PageSnapshot) -> list[str]:
    source_host = (urllib.parse.urlparse(snapshot.url).hostname or "").casefold()
    ranked: list[tuple[int, str]] = []
    for link in snapshot.links:
        parsed = urllib.parse.urlparse(link.url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            continue
        text = normalise_name(f"{link.text} {link.hint} {parsed.path}")
        hits = sum(1 for word in LINKED_PAGE_WORDS if word.replace("-", " ") in text)
        if not hits:
            continue
        same_host = parsed.hostname.casefold() == source_host
        ranked.append((hits * 10 + (5 if same_host else 0), validate_public_url(link.url)))
    return list(dict.fromkeys(url for _, url in sorted(ranked, reverse=True)))[:4]


def festival_relation_score(name: str, snapshot: PageSnapshot) -> float:
    expected = normalise_name(name)
    haystack = normalise_name(f"{snapshot.title} {snapshot.description} {' '.join(block.text for block in snapshot.blocks[:80])}")
    if not expected or not haystack:
        return 0.0
    tokens = expected.split()
    coverage = sum(1 for token in tokens if token in haystack.split()) / len(tokens)
    title_similarity = SequenceMatcher(None, expected, normalise_name(snapshot.title)).ratio()
    return round(max(coverage, title_similarity), 3)


def _brave_search_results(query: str, api_key: str) -> list[tuple[str, str]]:
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": query, "count": 10})
    request = urllib.request.Request(url, headers={"Accept": "application/json", "X-Subscription-Token": api_key, "User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=18) as response:
        payload = json.loads(response.read(1_000_000).decode("utf-8", "replace"))
    return [(clean_space(item.get("title")), clean_space(item.get("url"))) for item in payload.get("web", {}).get("results", []) if item.get("url")]


def _duckduckgo_search_results(query: str) -> list[tuple[str, str]]:
    url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=18) as response:
        raw = response.read(1_500_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
    parser = DuckDuckGoParser()
    parser.feed(raw)
    return parser.results[:10]


def _search_results(query: str) -> list[tuple[str, str]]:
    brave_key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    failures: list[str] = []
    if brave_key:
        try:
            results = _brave_search_results(query, brave_key)
            if results:
                return results
            failures.append("Brave Search returned no results")
        except Exception as error:
            failures.append(f"Brave Search unavailable: {clean_space(error)[:120]}")
    try:
        results = _duckduckgo_search_results(query)
        if results:
            return results
        failures.append("fallback web search returned no results")
    except Exception as error:
        failures.append(f"fallback web search unavailable: {clean_space(error)[:120]}")
    if failures:
        raise SearchUnavailable("; ".join(failures))
    return []


def discover_source_url(festival_name: str, year: int | None = None) -> str:
    query = f'"{festival_name}" {year or ""} official festival lineup'.strip()
    expected = normalise_name(festival_name)
    ranked: list[tuple[float, str]] = []
    for title, url in _search_results(query):
        try:
            clean = validate_public_url(url)
        except ValueError:
            continue
        host = (urllib.parse.urlparse(clean).hostname or "").casefold().removeprefix("www.")
        penalty = 0.45 if any(host == item or host.endswith("." + item) for item in SEARCH_HOST_PENALTIES) else 0.0
        similarity = SequenceMatcher(None, expected, normalise_name(title)).ratio()
        coverage = sum(token in normalise_name(title).split() for token in expected.split()) / max(1, len(expected.split()))
        ranked.append((max(similarity, coverage) - penalty, clean))
    if not ranked:
        raise RuntimeError("We couldn’t find a likely official festival page. Add the festival URL and try again.")
    return max(ranked)[1]


def _date_label(start: str | None, end: str | None) -> str | None:
    if not start:
        return None
    def parse(value: str | None) -> dt.datetime | None:
        if not value:
            return None
        try:
            return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    start_date, end_date = parse(start), parse(end)
    if not start_date:
        return clean_space(" – ".join(item for item in (start, end) if item)) or None
    if end_date and end_date.date() != start_date.date():
        return f"{start_date.strftime('%-d %B')} – {end_date.strftime('%-d %B %Y')}" if os.name != "nt" else f"{start_date.day} {start_date.strftime('%B')} – {end_date.day} {end_date.strftime('%B %Y')}"
    return f"{start_date.day} {start_date.strftime('%B %Y')}"


def _year_from(metadata: dict[str, Any], title: str, supplied: int | None) -> int | None:
    if supplied:
        return supplied
    for value in (metadata.get("start"), title):
        match = re.search(r"\b(20\d{2})\b", clean_space(value))
        if match:
            return int(match.group(1))
    return None


def summarise_promotional_copy(description: str | None, festival_name: str, year: int | None, location: str | None, dates: str | None) -> str:
    identity = clean_space(f"{festival_name} {year or ''}")
    facts = [identity]
    if location:
        facts.append(f"in {location}")
    if dates:
        facts.append(f"on {dates}")
    opening = " ".join(facts) + "."
    official = clean_space(description)
    official = re.sub(r"\b(?:buy tickets?|sign up|cookie policy|privacy policy)\b.*$", "", official, flags=re.I).strip()
    if official:
        words = official.split()
        official = " ".join(words[:28]).rstrip(" ,;:-")
        if official and official[-1] not in ".!?":
            official += "…"
        if normalise_name(festival_name) in normalise_name(official):
            opening = official
    closing = "Explore the lineup, hear something unexpected and discover the artists behind the festival."
    return clean_space(f"{opening} {closing}")[:1000]


def _profile_artist_name(snapshot: PageSnapshot) -> str:
    for payload in snapshot.bandcamp_payloads:
        candidates = [payload.get("artist"), (payload.get("current") or {}).get("band_name"), payload.get("band_name")]
        for value in candidates:
            if clean_space(value):
                return clean_artist_name(clean_space(value))
    title = snapshot.title
    title = re.sub(r"^Merch\s+from\s+", "", title, flags=re.I)
    for suffix in (" | Bandcamp", " | bandcamp", " – Bandcamp", " - Bandcamp"):
        title = title.replace(suffix, "")
    title = re.sub(r"^(?:Music|Albums|Tracks)\s*[|·-]\s*", "", title, flags=re.I)
    return clean_artist_name(title.split("|")[0])


def _direct_bandcamp_url_guesses(artist_name: str) -> list[str]:
    variants = [clean_space(artist_name)]
    primary = re.split(r"\s+(?:&|\+|and|with|featuring|feat\.?)\s+", artist_name, maxsplit=1, flags=re.I)[0]
    if primary and primary != artist_name:
        variants.append(primary)
    guesses: list[str] = []
    for variant in variants:
        words = normalise_name(variant).split()
        for candidate_words in (words, words[1:] if words[:1] == ["the"] else []):
            if not candidate_words:
                continue
            for slug in ("".join(candidate_words), "-".join(candidate_words)):
                if 2 <= len(slug) <= 63:
                    guesses.append(f"https://{slug}.bandcamp.com/")
    return list(dict.fromkeys(guesses))[:6]


def _candidate_bandcamp_urls(artist_name: str) -> tuple[list[str], tuple[str, ...]]:
    query = f'site:bandcamp.com "{artist_name}"'
    candidates: list[str] = []
    lookup_notes: list[str] = []
    try:
        search_results = _search_results(query)
    except SearchUnavailable as error:
        search_results = []
        lookup_notes.append(str(error))
    for _, url in search_results:
        try:
            candidates.append(validate_bandcamp_artist_url(url))
        except ValueError:
            continue
    return list(dict.fromkeys(candidates))[:10], tuple(lookup_notes)


def match_bandcamp_artist(artist: FestivalArtist) -> FestivalArtistMatch:
    candidates: list[tuple[str, bool]] = []
    lookup_notes: tuple[str, ...] = ()
    used_direct_festival_link = False
    if artist.direct_bandcamp_url:
        try:
            candidates.append((validate_bandcamp_artist_url(artist.direct_bandcamp_url), True))
            used_direct_festival_link = True
        except ValueError:
            pass
    if not candidates:
        candidates.extend((url, False) for url in _direct_bandcamp_url_guesses(artist.artist_name))
    best: FestivalArtistMatch | None = None
    expected = normalise_name(artist.artist_name)
    primary_identity = normalise_name(re.split(r"\s+(?:&|\+|and|with|featuring|feat\.?)\s+", artist.artist_name, maxsplit=1, flags=re.I)[0])
    expected_variants = {value for value in (expected, primary_identity) if value}

    def inspect_candidate(url: str, direct: bool) -> FestivalArtistMatch | None:
        try:
            profile = fetch_page(urllib.parse.urljoin(url, "music"))
        except Exception:
            try:
                profile = fetch_page(url)
            except Exception:
                return None
        profile_name = _profile_artist_name(profile)
        actual = normalise_name(profile_name)
        similarity = max((SequenceMatcher(None, variant, actual).ratio() for variant in expected_variants), default=0.0) if actual else 0.0
        exact = expected == actual
        playable = bool(profile.bandcamp_payloads or any("/album/" in link.url or "/track/" in link.url for link in profile.links))
        confidence = min(0.99, (0.96 if direct and exact else 0.91 if exact else similarity * 0.9) + (0.03 if playable else 0.0))
        evidence = [f"Bandcamp profile identifies as {profile_name or 'an unknown artist'}"]
        if direct:
            evidence.append("Linked directly from festival material")
        if playable:
            evidence.append("Public Bandcamp catalogue content is present")
        status = "matched" if playable and (exact or (direct and similarity >= 0.86)) else "possible_match" if playable and similarity >= 0.74 else "not_found"
        return FestivalArtistMatch(artist.artist_name, artist.source_url, url if status != "not_found" else None, status, round(confidence, 3), tuple(evidence), playable)

    inspected_urls: set[str] = set()
    for url, direct in candidates:
        inspected_urls.add(url)
        candidate = inspect_candidate(url, direct)
        if candidate is None:
            continue
        if best is None or candidate.confidence > best.confidence:
            best = candidate
        if candidate.match_status == "matched":
            return candidate

    if not used_direct_festival_link:
        discovered, lookup_notes = _candidate_bandcamp_urls(artist.artist_name)
        for url in discovered:
            if url in inspected_urls:
                continue
            candidate = inspect_candidate(url, False)
            if candidate is None:
                continue
            if best is None or candidate.confidence > best.confidence:
                best = candidate
            if candidate.match_status == "matched":
                return candidate
    if best and best.match_status != "not_found":
        return best
    if lookup_notes:
        return FestivalArtistMatch(
            artist.artist_name, artist.source_url, None, "check_failed", 0.0,
            ("Search providers were unavailable; direct Bandcamp address checks found no verified profile", *lookup_notes), False,
        )
    if best:
        return best
    return FestivalArtistMatch(
        artist.artist_name, artist.source_url, None, "not_found", 0.0,
        ("Bandcamp search and direct address checks found no sufficiently reliable profile",), False,
    )


class FestivalDiscoveryCache:
    def __init__(self, path: Path | None = None, max_age_seconds: int = DEFAULT_CACHE_SECONDS) -> None:
        self.path = path
        self.max_age_seconds = max_age_seconds
        self._lock = threading.Lock()

    def _read(self) -> dict[str, Any]:
        if not self.path or not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            value = self._read().get(key)
        if not isinstance(value, dict) or time.time() - float(value.get("savedAt", 0)) > self.max_age_seconds:
            return None
        result = value.get("result")
        return result if isinstance(result, dict) else None

    def put(self, key: str, result: dict[str, Any]) -> None:
        if not self.path:
            return
        with self._lock:
            payload = self._read()
            payload[key] = {"savedAt": time.time(), "result": result}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(self.path)


def festival_result_from_dict(value: dict[str, Any]) -> FestivalImportResult:
    artists = tuple(
        FestivalArtistMatch(
            artist_name=item["artistName"],
            festival_artist_url=item.get("festivalArtistUrl"),
            bandcamp_url=item.get("bandcampUrl"),
            match_status=item["matchStatus"],
            confidence=float(item.get("confidence", 0)),
            evidence=tuple(item.get("evidence") or []),
            playable=bool(item.get("playable")),
        )
        for item in value.get("artists", [])
    )
    return FestivalImportResult(
        festival_name=value["festivalName"], festival_year=value.get("festivalYear"), festival_url=value.get("festivalUrl"),
        source_url=value.get("sourceUrl"), dates=value.get("dates"), location=value.get("location"),
        promotional_description=value.get("promotionalDescription"), ticker_text=value.get("tickerText", ""),
        artists=artists, warnings=tuple(value.get("warnings") or []),
    )


def discover_festival(
    festival_name: str,
    festival_url: str | None = None,
    festival_year: int | None = None,
    *,
    progress: ProgressCallback | None = None,
    cache: FestivalDiscoveryCache | None = None,
    matcher: Callable[[FestivalArtist], FestivalArtistMatch] = match_bandcamp_artist,
) -> FestivalImportResult:
    name = clean_space(festival_name)
    if not name:
        raise ValueError("Festival Name is required")
    if festival_year is not None and not 1950 <= int(festival_year) <= 2100:
        raise ValueError("Festival Year must be between 1950 and 2100")
    requested_url = validate_public_url(festival_url) if festival_url else None
    search_mode = "brave" if os.environ.get("BRAVE_SEARCH_API_KEY", "").strip() else "fallback"
    cache_key = normalise_name(f"{MATCHER_VERSION}|{search_mode}|{name}|{festival_year or ''}|{requested_url or ''}")
    if cache:
        cached = cache.get(cache_key)
        if cached:
            if progress:
                progress("Loaded recent festival research.", None, None)
            return festival_result_from_dict(cached)

    if progress:
        progress("Locating festival…", None, None)
    source_url = requested_url or discover_source_url(name, festival_year)
    if progress:
        progress("Reading festival page…", None, None)
    source = fetch_page(source_url)
    snapshots = [source]
    for linked_url in related_lineup_links(source):
        try:
            snapshots.append(fetch_page(linked_url))
        except Exception:
            continue

    relation = max(festival_relation_score(name, snapshot) for snapshot in snapshots)
    warnings: list[str] = []
    if requested_url and relation < 0.55:
        warnings.append("The supplied page may not match the festival name. Please review before importing.")
    if progress:
        progress("Finding lineup…", None, None)
    lineup: list[FestivalArtist] = []
    seen: set[str] = set()
    for snapshot in snapshots:
        for artist in extract_lineup(snapshot):
            key = normalise_name(artist.artist_name)
            if key and key not in seen:
                seen.add(key)
                lineup.append(artist)
    if not lineup:
        raise RuntimeError("Festival found, but we couldn’t identify a lineup. Try a direct lineup or program URL.")

    metadata_options = [extract_page_metadata(snapshot) for snapshot in snapshots]
    metadata = max(metadata_options, key=lambda item: sum(bool(item.get(key)) for key in ("name", "description", "start", "location", "performers")))
    year = _year_from(metadata, source.title, festival_year)
    dates = _date_label(metadata.get("start"), metadata.get("end"))
    location = metadata.get("location")
    description = metadata.get("description")
    ticker = summarise_promotional_copy(description, name, year, location, dates)
    if progress:
        progress(f"{len(lineup)} artists identified.", None, None)

    matches: list[FestivalArtistMatch | None] = [None] * len(lineup)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="festival-bandcamp") as executor:
        futures = {executor.submit(matcher, artist): index for index, artist in enumerate(lineup)}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            index = futures[future]
            try:
                matches[index] = future.result()
            except Exception as error:
                matches[index] = FestivalArtistMatch(lineup[index].artist_name, lineup[index].source_url, None, "not_found", 0.0, (f"Bandcamp check failed: {clean_space(error)}",), False)
            completed += 1
            if progress:
                progress(f"Checking Bandcamp profiles…", completed, len(lineup))

    final_matches = tuple(item for item in matches if item is not None)
    failed_checks = sum(item.match_status == "check_failed" for item in final_matches)
    if failed_checks:
        warnings.append(f"Bandcamp checking could not be completed for {failed_checks} artists. Retry the import or configure Brave Search; these artists were not treated as genuine ‘not found’ results.")
    result = FestivalImportResult(
        festival_name=name,
        festival_year=year,
        festival_url=requested_url,
        source_url=source.url,
        dates=dates,
        location=location,
        promotional_description=description,
        ticker_text=ticker,
        artists=final_matches,
        warnings=tuple(warnings),
    )
    if cache and not failed_checks:
        cache.put(cache_key, result.as_dict())
    return result


def selected_confident_matches(result: FestivalImportResult, maximum: int = MAX_FESTIVAL_ARTISTS) -> tuple[FestivalArtistMatch, ...]:
    matched = [item for item in result.artists if item.match_status == "matched" and item.bandcamp_url]
    matched.sort(key=lambda item: (-int(item.playable), -item.confidence, list(result.artists).index(item)))
    return tuple(matched[:maximum])
