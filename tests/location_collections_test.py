import importlib.util
import pathlib
import sys
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "location_collections.py"
SPEC = importlib.util.spec_from_file_location("location_collections", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class LocationCollectionTests(unittest.TestCase):
    def test_portland_and_melbourne_normalize_generically(self):
        portland = MODULE.normalize_location("Portland, Oregon", allow_network=False)
        melbourne = MODULE.normalize_location("Melbourne, Australia", allow_network=False)
        self.assertEqual(portland["canonicalLocation"], "Portland, Oregon, United States")
        self.assertEqual(melbourne["canonicalLocation"], "Melbourne, Victoria, Australia")

    def test_ambiguous_location_is_rejected(self):
        with self.assertRaises(ValueError):
            MODULE.normalize_location("Portland", allow_network=False)

    def test_release_urls_deduplicate_to_one_artist(self):
        album = MODULE.canonical_artist_id("https://artist.bandcamp.com/album/one")
        track = MODULE.canonical_artist_id("https://artist.bandcamp.com/track/two")
        self.assertEqual(album, track)

    def test_exact_profile_location_is_publishable(self):
        location = MODULE.normalize_location("Melbourne, Australia", allow_network=False)
        status, score, _ = MODULE.verify_location({"profileLocation":"Melbourne, Australia","document":""}, location)
        self.assertEqual(status, "verified")
        self.assertEqual(score, 1.0)

    def test_search_snippet_without_profile_evidence_is_rejected(self):
        location = MODULE.normalize_location("Portland, Oregon", allow_network=False)
        status, score, _ = MODULE.verify_location({"profileLocation":"Seattle, Washington","document":""}, location)
        self.assertEqual(status, "rejected")
        self.assertEqual(score, 0.0)


if __name__ == "__main__":
    unittest.main()
