from __future__ import annotations

import sys
import unittest
import os
from pathlib import Path
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import festival_discovery_service as service


FESTIVAL_HTML = """
<!doctype html><html><head>
<title>Laneway Example 2026 — Official Festival</title>
<meta name="description" content="A summer celebration of adventurous live music in Melbourne, presented across two stages.">
<script type="application/ld+json">{
  "@type":"MusicEvent", "name":"Laneway Example 2026",
  "startDate":"2026-02-14", "endDate":"2026-02-15",
  "location":{"name":"River Park","address":{"addressLocality":"Melbourne","addressRegion":"VIC"}},
  "performer":[
    {"@type":"MusicGroup","name":"Folk Bitch Trio","url":"/artists/folk-bitch-trio","sameAs":"https://folkbitchtrio.bandcamp.com"},
    {"@type":"MusicGroup","name":"Nice Biscuit"},
    {"@type":"MusicGroup","name":"Folk Bitch Trio"}
  ]
}</script></head><body>
<h2>Lineup</h2><ul class="lineup"><li>Nice Biscuit</li><li>Georgia Maq — Main Stage 7:30pm</li></ul>
<a href="/program">Official program</a>
</body></html>
"""


def confident(artist: service.FestivalArtist) -> service.FestivalArtistMatch:
    slug = service.normalise_name(artist.artist_name).replace(" ", "")
    return service.FestivalArtistMatch(
        artist.artist_name, artist.source_url, f"https://{slug}.bandcamp.com/",
        "matched", 0.97, ("Exact identity and playable catalogue",), True,
    )


class FestivalDiscoveryTests(unittest.TestCase):
    def test_url_validation_rejects_malformed_and_private_destinations(self) -> None:
        for value in ("festival.example", "file:///tmp/festival", "http://127.0.0.1/", "https://localhost/lineup"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                service.validate_public_url(value)
        self.assertEqual(service.validate_public_url("https://festival.example/lineup#top"), "https://festival.example/lineup")

    def test_metadata_lineup_normalisation_and_duplicate_removal(self) -> None:
        page = service.page_from_html(FESTIVAL_HTML, "https://festival.example/")
        metadata = service.extract_page_metadata(page)
        names = [artist.artist_name for artist in service.extract_lineup(page)]
        self.assertEqual(metadata["name"], "Laneway Example 2026")
        self.assertIn("Melbourne", metadata["location"])
        self.assertEqual(names.count("Folk Bitch Trio"), 1)
        self.assertIn("Nice Biscuit", names)
        self.assertIn("Georgia Maq", names)
        self.assertNotIn("Official program", names)
        self.assertFalse(service.is_probable_artist("ARTISTS"))

    def test_name_and_url_import_uses_supplied_url_and_populates_ticker(self) -> None:
        page = service.page_from_html(FESTIVAL_HTML, "https://festival.example/")
        with patch.object(service, "fetch_page", return_value=page):
            result = service.discover_festival("Laneway Example", "https://festival.example/", 2026, matcher=confident)
        self.assertEqual(result.source_url, "https://festival.example/")
        self.assertEqual(result.festival_year, 2026)
        self.assertIn("Melbourne", result.location or "")
        self.assertIn("Explore the lineup", result.ticker_text)
        self.assertLessEqual(len(result.ticker_text), 1000)
        self.assertTrue(all(item.match_status == "matched" for item in result.artists))

    def test_name_only_import_discovers_source(self) -> None:
        page = service.page_from_html(FESTIVAL_HTML, "https://official.example/lineup")
        with patch.object(service, "discover_source_url", return_value=page.url) as discovery, patch.object(service, "fetch_page", return_value=page):
            result = service.discover_festival("Laneway Example", festival_year=2026, matcher=confident)
        discovery.assert_called_once_with("Laneway Example", 2026)
        self.assertEqual(result.source_url, page.url)

    def test_unrelated_supplied_page_warns_without_destroying_partial_result(self) -> None:
        unrelated = service.page_from_html(FESTIVAL_HTML.replace("Laneway Example", "Different Gathering"), "https://festival.example/")
        with patch.object(service, "fetch_page", return_value=unrelated):
            result = service.discover_festival("Yours & Owls", unrelated.url, matcher=confident)
        self.assertTrue(any("may not match" in warning for warning in result.warnings))
        self.assertGreater(len(result.artists), 0)

    def test_possible_matches_are_not_auto_selected_and_maximum_is_35(self) -> None:
        matches = []
        for index in range(43):
            status = "possible_match" if index == 0 else "matched"
            matches.append(service.FestivalArtistMatch(f"Artist {index}", None, f"https://artist{index}.bandcamp.com/", status, 0.99 - index / 1000, ("evidence",), True))
        result = service.FestivalImportResult("Test", 2026, None, None, None, None, None, "Ticker", tuple(matches))
        selected = service.selected_confident_matches(result)
        self.assertEqual(len(selected), 35)
        self.assertTrue(all(item.match_status == "matched" for item in selected))
        self.assertNotIn("Artist 0", [item.artist_name for item in selected])

    def test_direct_bandcamp_address_fallback_matches_when_web_search_returns_nothing(self) -> None:
        profile = service.PageSnapshot(
            url="https://theburninghell.bandcamp.com/music", title="The Burning Hell", description="",
            links=(service.Link("Album", "https://theburninghell.bandcamp.com/album/example", ""),),
            blocks=(), json_ld=(), bandcamp_payloads=(),
        )

        def fetch(url: str) -> service.PageSnapshot:
            if "theburninghell.bandcamp.com" in url:
                return profile
            raise OSError("not found")

        with patch.object(service, "_search_results", return_value=[]) as web_search, patch.object(service, "fetch_page", side_effect=fetch):
            match = service.match_bandcamp_artist(service.FestivalArtist("The Burning Hell"))
        self.assertEqual(match.match_status, "matched")
        self.assertEqual(match.bandcamp_url, "https://theburninghell.bandcamp.com/")
        web_search.assert_not_called()

    def test_search_failure_is_reported_as_incomplete_not_not_found(self) -> None:
        with patch.object(service, "_search_results", side_effect=service.SearchUnavailable("providers unavailable")), patch.object(service, "fetch_page", side_effect=OSError("not found")):
            match = service.match_bandcamp_artist(service.FestivalArtist("Unfindable Example"))
        self.assertEqual(match.match_status, "check_failed")
        self.assertIn("providers were unavailable", match.evidence[0].lower())

    def test_brave_failure_falls_back_to_secondary_search_provider(self) -> None:
        with patch.dict(os.environ, {"BRAVE_SEARCH_API_KEY": "configured"}), patch.object(service, "_brave_search_results", side_effect=OSError("temporary")), patch.object(service, "_duckduckgo_search_results", return_value=[("Artist", "https://artist.bandcamp.com/music")]):
            self.assertEqual(service._search_results("artist"), [("Artist", "https://artist.bandcamp.com/music")])

    def test_incomplete_bandcamp_checks_create_a_visible_festival_warning(self) -> None:
        page = service.page_from_html(FESTIVAL_HTML, "https://festival.example/")
        incomplete = lambda artist: service.FestivalArtistMatch(artist.artist_name, artist.source_url, None, "check_failed", 0.0, ("providers unavailable",), False)
        cache = Mock()
        cache.get.return_value = None
        with patch.object(service, "fetch_page", return_value=page):
            result = service.discover_festival("Laneway Example", page.url, matcher=incomplete, cache=cache)
        self.assertTrue(any("could not be completed" in warning for warning in result.warnings))
        self.assertTrue(all(item.match_status == "check_failed" for item in result.artists))
        cache.put.assert_not_called()


if __name__ == "__main__":
    unittest.main()
