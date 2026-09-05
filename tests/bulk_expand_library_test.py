from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import bulk_expand_library as bulk
import bulk_library_status as status
import qa_bulk_batch as qa


class BulkExpansionTests(unittest.TestCase):
    def candidate(self, **changes):
        value = {
            "item_id": "42", "item_url": "https://excellent.bandcamp.com/album/real-release",
            "band_name": "Excellent Artist", "album_artist": "Excellent Artist", "title": "Real Release",
            "track_count": 4, "release_date": "2026-09-05",
        }
        value.update(changes)
        return value

    def test_preliminary_quality_gate_uses_canonical_artist_identity(self):
        self.assertIsNone(bulk.preliminary_reason(self.candidate(), set(), set(), set()))
        self.assertEqual(bulk.preliminary_reason(self.candidate(), {"excellent.bandcamp.com"}, set(), set()), "DUPLICATE_ARTIST")
        self.assertEqual(bulk.preliminary_reason(self.candidate(), set(), {"excellent artist"}, set()), "MANUAL_REVIEW")
        self.assertEqual(
            bulk.preliminary_reason(
                self.candidate(item_url="https://example-records.bandcamp.com/album/real-release"),
                set(), set(), set(),
            ),
            "MANUAL_REVIEW",
        )
        self.assertEqual(
            bulk.preliminary_reason(
                self.candidate(band_name="Dancing Ferret Discs", album_artist="Dancing Ferret Discs", item_url="https://dancingferret.bandcamp.com/album/benefit"),
                set(), set(), set(),
            ),
            "MANUAL_REVIEW",
        )
        self.assertTrue(bulk.ambiguous_artist_entity("Arjen's Art Channel"))
        self.assertTrue(bulk.ambiguous_artist_entity("Sky$.Mix"))
        self.assertTrue(bulk.ambiguous_artist_entity("beetsblog"))
        self.assertTrue(bulk.ambiguous_release_identity("The Best Releases of August 2026"))
        self.assertTrue(bulk.ambiguous_release_identity("Benefit Compilation Vol. 4"))
        self.assertEqual(
            bulk.preliminary_reason(self.candidate(featured_artist="Another Artist"), set(), set(), set()),
            "MANUAL_REVIEW",
        )
        self.assertEqual(
            bulk.preliminary_reason(
                self.candidate(band_name="Various Artists [Example]", album_artist="Various Artists [Example]", item_url="https://example.bandcamp.com/album/compilation"),
                set(), set(), set(),
            ),
            "MANUAL_REVIEW",
        )
        self.assertEqual(
            bulk.preliminary_reason(
                self.candidate(band_name="442-441.3 716x640x450.4 441.9 451.2 811 733.2", album_artist="442-441.3 716x640x450.4 441.9 451.2 811 733.2", item_url="https://442441.bandcamp.com/album/example"),
                set(), set(), set(),
            ),
            "SPAM_OR_PLACEHOLDER",
        )
        self.assertEqual(
            bulk.preliminary_reason(
                self.candidate(band_name="017", album_artist="017", item_url="https://017.bandcamp.com/album/example"),
                set(), set(), set(),
            ),
            "SPAM_OR_PLACEHOLDER",
        )
        self.assertEqual(bulk.preliminary_reason(self.candidate(track_count=0), set(), set(), set()), "NO_PLAYABLE_TRACK")
        self.assertEqual(bulk.preliminary_reason(self.candidate(title="Test upload"), set(), set(), set()), "SPAM_OR_PLACEHOLDER")
        self.assertEqual(bulk.preliminary_reason(self.candidate(band_name="Audio Assets", title="Ambient Vocal Textures Pack"), set(), set(), set()), "SPAM_OR_PLACEHOLDER")

    def test_dry_run_persists_decisions_without_mutating_catalogue(self):
        raw = bulk.candidate_record(self.candidate(), "quiet", "ambient")
        manifest = {"slug": "excellent-artist-real-release", "artist": "Excellent Artist", "tracks": [{"bandcampEmbedTrackId": "7"}]}
        record = {
            "id": "excellent-artist-real-release", "artist": "Excellent Artist", "release": "Real Release",
            "bandcampUrl": "https://excellent.bandcamp.com/album/real-release", "waters": ["quiet"],
            "location": "Melbourne, Australia", "trackCount": 1,
        }
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            artists = root / "artists"
            artists.mkdir()
            with (
                patch.object(bulk, "ARTISTS", artists), patch.object(bulk, "HISTORY", root / "releases.json"),
                patch.object(bulk, "DRY_RUNS", root / "dry-runs"), patch.object(bulk, "BATCHES", root / "batches"),
                patch.object(bulk, "REPORTS", root / "reports"), patch.object(bulk, "discover_candidate_pool", return_value=[raw]),
                patch.object(bulk, "existing_identity", return_value=(set(), set(), set())),
                patch.object(bulk, "verify_bandcamp_artist_identity", return_value={"identityVerified": True, "identityIsLabel": False, "identityBandId": "42", "identitySource": "test"}),
                patch.object(bulk, "validate_candidate", return_value=(manifest, record)),
            ):
                report = bulk.run("bulk-5000-batch-01-dry-run", 1, 20, True, 0)
            self.assertEqual(report["acceptedNewArtists"], 1)
            self.assertEqual(list(artists.iterdir()), [])
            self.assertFalse((root / "releases.json").exists())
            state = json.loads((root / "dry-runs" / "bulk-5000-batch-01-dry-run.json").read_text())
            self.assertEqual(state["status"], "complete")

    def test_country_normalization_is_conservative(self):
        self.assertEqual(status.country_from_location("Melbourne, Australia"), "Australia")
        self.assertEqual(status.country_from_location("Portland, Oregon"), "United States")
        self.assertEqual(status.country_from_location("Somewhere"), "Unresolved")

    def test_batch_windows_advance_without_reusing_the_first_discover_page(self):
        self.assertEqual(bulk.batch_number("bulk-5000-batch-01"), 1)
        self.assertEqual(bulk.batch_number("bulk-5000-batch-10-dry-run"), 10)
        feed = bulk.DiscoverFeed("quiet", "ambient", skip=2)
        feed.items.extend([{"id": 1}, {"id": 2}, {"id": 3}])
        self.assertEqual(feed.next(), {"id": 3})

    def test_public_artist_identity_excludes_labels_and_unmatched_hosts(self):
        payload = {"auto": {"results": [
            {"type": "b", "id": 7, "name": "Excellent Artist", "item_url_root": "https://excellent.bandcamp.com", "is_label": False},
            {"type": "b", "id": 8, "name": "Excellent Records", "item_url_root": "https://records.bandcamp.com", "is_label": True},
        ]}}
        response = unittest.mock.MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(payload).encode()
        response.info.return_value = None
        with patch("urllib.request.urlopen") as opened:
            opened.return_value.__enter__.return_value.read.return_value = json.dumps(payload).encode()
            opened.return_value.__enter__.return_value.__iter__.return_value = iter([])
            opened.return_value.__enter__.return_value = response
            response.__iter__.return_value = iter(json.dumps(payload).splitlines(True))
            identity = bulk.verify_bandcamp_artist_identity("Excellent Artist", "https://excellent.bandcamp.com/album/release")
        self.assertTrue(identity["identityVerified"])
        self.assertFalse(identity["identityIsLabel"])

    def test_validated_bulk_manifest_carries_ticker_bio_provenance(self):
        candidate = bulk.candidate_record(self.candidate(tags=["ambient"]), "quiet", "ambient")
        candidate.update({"identityVerified": True, "identityIsLabel": False, "identityBandId": "42", "identitySource": "bandcamp-public-artist-index"})
        fake_manifest = {"slug": "excellent-artist-real-release", "artist": "Excellent Artist", "tracks": [{"bandcampEmbedTrackId": "7"}], "bioShort": "Ambient music from Melbourne.", "bioSource": "metadata-derived", "primaryLocation": "Melbourne, Australia"}
        fake_result = {"_manifest": fake_manifest, "metadata_tags": ["ambient"], "waters": ["quiet"], "page_url": "https://example.test/excellent/", "visual_style": "cosmic", "tracks": 1}
        with patch.object(bulk, "create_artist", return_value=fake_result):
            manifest, record = bulk.validate_candidate(candidate, "bulk-5000-batch-01", 0)
        self.assertTrue(manifest["bioShort"])
        self.assertIn(manifest["bioSource"], {"bandcamp-description", "metadata-derived"})
        self.assertEqual(record["bioShort"], manifest["bioShort"])
        self.assertEqual(record["bioSource"], manifest["bioSource"])
        self.assertEqual(manifest["canonicalIdentity"]["bandcampBandId"], "42")

    def test_interrupted_publish_reconciles_manifest_into_state_and_history(self):
        manifest = {
            "slug": "excellent-artist-real-release", "artist": "Excellent Artist",
            "releaseTitle": "Real Release", "bandcampUrl": "https://excellent.bandcamp.com/album/real-release",
            "releaseDate": "2026-09-05 00:00:00 UTC", "dailyBatchId": "bulk-5000-batch-01",
            "metadataTags": ["ambient"], "primaryLocation": "Melbourne, Australia", "waters": ["quiet"],
            "bioShort": "Excellent Artist — ambient music from Melbourne, Australia.",
            "bioSource": "metadata-derived", "tracks": [{"bandcampEmbedTrackId": "7"}],
            "provenance": {"batchId": "bulk-5000-batch-01", "discoveredUrl": "https://excellent.bandcamp.com/album/real-release"},
        }
        state = {"candidates": [bulk.candidate_record(self.candidate(), "quiet", "ambient")], "accepted": [], "acceptedCount": 0}
        history = {"schemaVersion": 1, "releases": []}
        with tempfile.TemporaryDirectory() as folder:
            artists = Path(folder)
            (artists / "excellent-artist-real-release.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch.object(bulk, "ARTISTS", artists):
                self.assertTrue(bulk.reconcile_published_batch(state, "bulk-5000-batch-01", history))
        self.assertEqual(state["acceptedCount"], 1)
        self.assertEqual(state["accepted"][0]["bioSource"], "metadata-derived")
        self.assertEqual(history["releases"][0]["status"], "published")

    def test_completed_batch_qa_requires_identity_bio_playability_and_unique_records(self):
        accepted = {
            "artist": "Excellent Artist", "bandcampUrl": "https://excellent.bandcamp.com/album/release",
            "identityBandId": "42", "identityVerified": True, "identityIsLabel": False,
            "trackCount": 1, "bioShort": "Excellent Artist — ambient music.", "bioSource": "metadata-derived",
            "waters": ["quiet"],
        }
        passing = qa.audit_state({"id": "bulk-5000-batch-01-dry-run", "status": "complete", "targetAccepted": 1, "accepted": [accepted]}, 0)
        self.assertEqual(passing["structuralChecks"], "PASS")
        failing = qa.audit_state({"id": "bulk-5000-batch-01-dry-run", "status": "complete", "targetAccepted": 2, "accepted": [accepted, dict(accepted)]}, 0)
        self.assertEqual(failing["structuralChecks"], "FAIL")
        self.assertTrue(any("duplicates" in error for error in failing["errors"]))


if __name__ == "__main__":
    unittest.main()
