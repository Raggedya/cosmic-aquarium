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
import create_artist as creator
import backfill_ticker_bios
from create_artist import BandcampPageParser, MINIMUM_TRACK_COUNT, concise_bio, discover_tracks, location_from_json_ld, metadata_bio


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

    def test_ticker_enrichment_uses_factual_bandcamp_fields_and_rejects_generic_copy(self):
        parser = BandcampPageParser()
        parser.feed('<script type="application/ld+json">{"foundingLocation":{"@type":"Place","name":"Melbourne, Australia"}}</script>')
        self.assertEqual(location_from_json_ld(parser), "Melbourne, Australia")
        self.assertEqual(concise_bio("13 track album", "Artist"), "")
        self.assertEqual(concise_bio("Artist, atmospheric textural music recorded in Melbourne.", "Artist"), "atmospheric textural music recorded in Melbourne.")
        self.assertEqual(metadata_bio("Artist", ["ambient", "experimental"], ["quiet"], "Melbourne, Australia"), "Artist — ambient / experimental music from Melbourne, Australia.")

    def test_one_verified_release_track_is_enough_to_publish(self):
        self.assertEqual(MINIMUM_TRACK_COUNT, 1)

    def test_ticker_bio_backfill_is_idempotent_and_preserves_curated_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            missing = root / "missing.json"
            curated = root / "curated.json"
            missing.write_text(json.dumps({"artist": "Missing Artist", "metadataTags": ["ambient"], "waters": ["quiet"], "primaryLocation": "Sydney, Australia"}), encoding="utf-8")
            curated.write_text(json.dumps({"artist": "Curated Artist", "bioShort": "A carefully curated biography.", "bioSource": "manual"}), encoding="utf-8")
            first = backfill_ticker_bios.backfill(root)
            second = backfill_ticker_bios.backfill(root)
            self.assertEqual(first["updated"], 1)
            self.assertEqual(second["updated"], 0)
            self.assertEqual(json.loads(curated.read_text())["bioShort"], "A carefully curated biography.")
            self.assertEqual(json.loads(missing.read_text())["bioSource"], "metadata-derived")

    def test_unplayable_release_does_not_borrow_tracks_from_other_albums(self):
        parser = BandcampPageParser()
        with patch("create_artist.fetch_page", return_value=(parser, "https://artist.bandcamp.com/album/unplayable")) as fetch:
            tracks, *_ = discover_tracks("https://artist.bandcamp.com/album/unplayable", "Artist")
        self.assertEqual(tracks, [])
        self.assertEqual(fetch.call_count, 1)

    def test_daily_dry_run_does_not_publish_before_bookkeeping_succeeds(self):
        track = {"albumKey": "release", "accent": "#fff", "albumTitle": "Release"}
        discovered = ([track], "https://artist.bandcamp.com/album/release", True, "https://artist.bandcamp.com/", "2026-09-01", ["ambient"], "Atmospheric music from Melbourne.", "Melbourne, Australia")
        with tempfile.TemporaryDirectory() as folder, patch.object(creator, "PAGES", Path(folder)), patch.object(creator, "discover_tracks", return_value=discovered):
            result = creator.create_artist("Artist", "https://artist.bandcamp.com/album/release", "cosmic", "https://example.test", generate_qr=False, persist=False)
            self.assertIsNotNone(result["_manifest"])
            self.assertEqual(result["_manifest"]["bioShort"], "Atmospheric music from Melbourne.")
            self.assertEqual(result["_manifest"]["bioSource"], "bandcamp-description")
            self.assertEqual(result["_manifest"]["primaryLocation"], "Melbourne, Australia")
            self.assertEqual(list(Path(folder).rglob("*")), [])


if __name__ == "__main__":
    unittest.main()
