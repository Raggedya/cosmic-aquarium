from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import create_festival_machine as creator


def request(urls: list[str]) -> dict:
    return {
        "title": "YOURS & OWLS 2026",
        "festivalName": "Yours & Owls",
        "festivalYear": 2026,
        "festivalUrl": "https://festival.example/",
        "festivalSourceUrl": "https://festival.example/lineup",
        "festivalDates": "14–15 February 2026",
        "festivalLocation": "Wollongong, NSW",
        "tickerText": "A concise, editable festival ticker.",
        "bandcampUrls": urls,
    }


class CreateFestivalMachineTests(unittest.TestCase):
    def test_manual_pipeline_accepts_35_artist_urls_end_to_end(self) -> None:
        urls = [f"https://artist{index}.bandcamp.com/" for index in range(35)]
        normalized = creator.normalise_request(request(urls))
        self.assertEqual(len(normalized["bandcampUrls"]), 35)

        def importer(url: str) -> dict:
            index = int(url.split("artist", 1)[1].split(".", 1)[0])
            return {"artistName": f"Artist {index}", "bandcampUrl": url, "songCount": 1, "heroArtwork": None,
                    "songs": [{"id": str(1000 + index), "title": f"Song {index}", "bandcampEmbedTrackId": str(1000 + index), "bandcampUrl": url + f"track/song-{index}", "artistBandcampUrl": url}]}

        config = creator.build_festival_config(request(urls), importer=importer)
        self.assertEqual(len(config["bandcampUrls"]), 35)
        self.assertEqual(len(config["artists"]), 35)
        self.assertEqual(len(config["songs"]), 35)
        self.assertTrue(all(track["artistBandcampUrl"].endswith(".bandcamp.com/") for track in config["songs"]))

    def test_more_than_35_urls_is_rejected_not_truncated(self) -> None:
        urls = [f"https://artist{index}.bandcamp.com/" for index in range(36)]
        with self.assertRaisesRegex(ValueError, "maximum of 35"):
            creator.normalise_request(request(urls))

    def test_festival_metadata_and_manually_edited_ticker_persist(self) -> None:
        url = "https://exampleartist.bandcamp.com/"
        imported = {"artistName": "Example Artist", "bandcampUrl": url, "songCount": 1, "heroArtwork": "https://example.test/art.jpg",
                    "songs": [{"id": "10", "title": "Example Song", "bandcampEmbedTrackId": "10", "bandcampUrl": url + "track/example", "artistBandcampUrl": url}]}
        config = creator.build_festival_config(request([url]), importer=lambda _: imported)
        self.assertEqual(config["machineMode"], "festival")
        self.assertEqual(config["festivalName"], "Yours & Owls")
        self.assertEqual(config["festivalLocation"], "Wollongong, NSW")
        self.assertEqual(config["festivalTickerText"], "A concise, editable festival ticker.")
        self.assertEqual(config["tickerCopy"], ["A concise, editable festival ticker."])

    def test_partial_catalogue_failure_keeps_successful_artist(self) -> None:
        urls = ["https://good.bandcamp.com/", "https://unavailable.bandcamp.com/"]
        def importer(url: str) -> dict:
            if "unavailable" in url:
                raise RuntimeError("temporary lookup failure")
            return {"artistName": "Good", "bandcampUrl": url, "songCount": 1, "heroArtwork": None,
                    "songs": [{"id": "20", "title": "Good Song", "bandcampEmbedTrackId": "20", "bandcampUrl": url + "track/good", "artistBandcampUrl": url}]}
        config = creator.build_festival_config(request(urls), importer=importer)
        self.assertEqual(len(config["artists"]), 1)
        self.assertEqual(len(config["importFailures"]), 1)


if __name__ == "__main__":
    unittest.main()
