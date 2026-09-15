from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from create_festival_machine import build_festival_config
from festival_projects import (
    FestivalProjectStore, OcrBlock, approved_bandcamp_urls, calculate_reporting, classification,
    empty_project, extract_lineup_from_blocks, festival_request, read_poster,
)


HARVEST_ARTISTS = [
    "Amyl and the Sniffers", "Floodlights", "The Chats", "Cash Savage and the Last Drinks",
    "RVG", "Cable Ties", "Private Function", "Gut Health", "CLAMM", "Delivery",
    "Quality Used Cars", "Mod Con", "Grace Cummings", "Bananagun", "Surprise Chef",
    "CIVIC", "Split System", "Screensaver", "Party Dozen", "Mess Esque",
]


def fake_importer(url: str) -> dict:
    slug = url.split("//", 1)[1].split(".", 1)[0]
    return {
        "artistName": slug.replace("-", " ").title(), "bandcampUrl": url, "songCount": 2,
        "heroArtwork": f"https://img.example/{slug}.jpg",
        "songs": [
            {"id": f"{slug}-1", "title": f"{slug} song one", "bandcampEmbedTrackId": str(abs(hash(slug + '1')) % 899999 + 100000), "bandcampUrl": f"{url}track/one"},
            {"id": f"{slug}-2", "title": f"{slug} song two", "bandcampEmbedTrackId": str(abs(hash(slug + '2')) % 899999 + 100000), "bandcampUrl": f"{url}track/two"},
        ],
    }


class FestivalPosterTest(unittest.TestCase):
    def test_harvest_2027_poster_read_and_manual_correction(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            poster = Path(temporary) / "harvest-2027.png"
            Image.new("RGB", (1200, 1800), "black").save(poster)
            blocks = [OcrBlock(name, .95, 10 + index % 2 * 500, 100 + index * 40, 300, 35, "test") for index, name in enumerate(HARVEST_ARTISTS)]
            blocks += [OcrBlock("HARVEST FESTIVAL 2027", .99), OcrBlock("BUY TICKETS", .99), OcrBlock("SATURDAY 6 MARCH", .9)]
            read = read_poster(poster, provider=lambda _path: blocks)
            lineup, rejected = extract_lineup_from_blocks(read, festival_name="Harvest Festival", year="2027")
            self.assertEqual([item["artistName"] for item in lineup], HARVEST_ARTISTS)
            self.assertIn("BUY TICKETS", rejected)
            lineup[1]["artistName"] = "Floodlights (AU)"
            lineup.append({"artistName": "Manual Addition", "source": "manual", "ocrConfidence": 1})
            self.assertEqual(len(lineup), 21)

    def test_match_confidence_statuses_are_explicit(self) -> None:
        self.assertEqual(classification("matched", .97, "https://artist.bandcamp.com/"), "CONFIRMED")
        self.assertEqual(classification("matched", .88, "https://artist.bandcamp.com/"), "LIKELY")
        self.assertEqual(classification("possible_match", .75, "https://artist.bandcamp.com/"), "AMBIGUOUS")
        self.assertEqual(classification("check_failed", 0, None), "NOT FOUND")


class FestivalProjectTest(unittest.TestCase):
    def _project(self) -> dict:
        project = empty_project()
        project["festival"] = {"name": "Harvest Festival", "year": "2027", "website": "https://festival.example/", "location": "Melbourne", "description": "Twenty artists, one discovery machine."}
        project["editedLineup"] = [{"artistName": name, "source": "poster", "ocrConfidence": .95} for name in HARVEST_ARTISTS]
        project["bandcampMatches"] = [
            {"artistName": name, "bandcampUrl": f"https://harvest-{index}.bandcamp.com/", "status": "CONFIRMED", "confidence": .97, "decision": "approved", "matchMethod": "manual" if index == 3 else "automatic"}
            for index, name in enumerate(HARVEST_ARTISTS)
        ]
        return project

    def test_save_reopen_duplicate_and_delete_are_separate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = FestivalProjectStore(Path(temporary) / "festival-projects")
            saved, path = store.save(self._project(), project_id="harvest-2027")
            self.assertTrue(path.is_file())
            self.assertEqual(len(store.load("harvest-2027")["editedLineup"]), 20)
            duplicate = store.duplicate("harvest-2027")
            self.assertNotEqual(duplicate["projectId"], saved["projectId"])
            store.delete(duplicate["projectId"])
            self.assertEqual(len(store.list_projects()), 1)

    def test_only_approved_matches_build_shared_festival_machine(self) -> None:
        project = self._project()
        project["bandcampMatches"][0]["decision"] = "rejected"
        project["bandcampMatches"][1]["decision"] = "pending"
        self.assertEqual(len(approved_bandcamp_urls(project)), 18)
        request = festival_request({**project, "projectId": "harvest-2027"})
        config = build_festival_config(request, importer=fake_importer)
        self.assertEqual(config["machineMode"], "festival")
        self.assertEqual(config["festivalSlug"], "harvest-2027")
        self.assertEqual(len(config["artists"]), 18)
        self.assertEqual(len(config["songs"]), 36)
        self.assertEqual(config["festivalPrimaryTitle"], "Harvest Festival 2027")
        self.assertEqual(config["festivalSubtitle"], "DISCOVERY MACHINE")

    def test_coverage_reports_confirmed_manual_and_not_found(self) -> None:
        project = self._project()
        project["bandcampMatches"][0].update({"bandcampUrl": "", "status": "NOT FOUND", "decision": "rejected"})
        report = calculate_reporting(project)
        self.assertEqual(report, {"posterArtistsFound": 20, "confirmed": 18, "manual": 1, "notFound": 1, "coveragePercent": 95})


if __name__ == "__main__":
    unittest.main()
