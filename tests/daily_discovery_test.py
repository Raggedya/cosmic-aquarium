from __future__ import annotations

import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import daily_discovery
from create_artist import BandcampPageParser, MINIMUM_TRACK_COUNT, discover_tracks


class DailyDiscoveryTests(unittest.TestCase):
    def candidate(self, **changes):
        value = {
            "item_id": 42,
            "item_url": "https://excellent.bandcamp.com/album/release",
            "band_name": "Excellent Artist",
            "title": "A Real Release",
            "release_date": "2026-09-01",
        }
        value.update(changes)
        return value

    def test_quality_gate_rejects_invalid_duplicate_and_test_entries(self):
        date = dt.date(2026, 9, 5)
        self.assertIsNone(daily_discovery.candidate_rejection_reason(self.candidate(), date, set()))
        self.assertEqual(daily_discovery.candidate_rejection_reason(self.candidate(item_url="https://example.com/a"), date, set()), "invalid_bandcamp_url")
        self.assertEqual(daily_discovery.candidate_rejection_reason(self.candidate(), date, {"https://excellent.bandcamp.com/album/release"}), "duplicate_release_url")
        self.assertEqual(daily_discovery.candidate_rejection_reason(self.candidate(title="Test Release"), date, set()), "test_or_non_music_entry")

    def test_incomplete_batch_is_resumed_before_a_new_date(self):
        with tempfile.TemporaryDirectory() as folder:
            batches = Path(folder)
            (batches / "2026-09-03.json").write_text(json.dumps({"batchDate": "2026-09-03", "publishedCount": 7, "targetCount": 20}), encoding="utf-8")
            with patch.object(daily_discovery, "BATCHES", batches):
                self.assertEqual(daily_discovery.resolve_batch_date("", dt.date(2026, 9, 5)), "2026-09-03")
                self.assertEqual(daily_discovery.resolve_batch_date("2026-09-04"), "2026-09-04")

    def test_bandcamp_tags_are_captured_for_real_water_classification(self):
        parser = BandcampPageParser()
        parser.feed('<a class="tag" href="/tag/shoegaze">shoegaze</a><a class="tag"> dark ambient </a>')
        self.assertEqual(parser.tags, ["shoegaze", "dark ambient"])

    def test_one_verified_release_track_is_enough_to_publish(self):
        self.assertEqual(MINIMUM_TRACK_COUNT, 1)

    def test_unplayable_release_does_not_borrow_tracks_from_other_albums(self):
        parser = BandcampPageParser()
        with patch("create_artist.fetch_page", return_value=(parser, "https://artist.bandcamp.com/album/unplayable")) as fetch:
            tracks, *_ = discover_tracks("https://artist.bandcamp.com/album/unplayable", "Artist")
        self.assertEqual(tracks, [])
        self.assertEqual(fetch.call_count, 1)


if __name__ == "__main__":
    unittest.main()
