import importlib.util
import pathlib
import sys
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "melbourne_expand_library.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("melbourne_expand_library", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class MelbourneExpansionTests(unittest.TestCase):
    def test_location_gate_accepts_melbourne_but_not_victoria_or_other_cities(self):
        self.assertTrue(MODULE.strict_melbourne_location("Melbourne, Australia"))
        self.assertTrue(MODULE.strict_melbourne_location("Brunswick, Victoria, Australia"))
        self.assertFalse(MODULE.strict_melbourne_location("Victoria, Australia"))
        self.assertFalse(MODULE.strict_melbourne_location("Sydney, Australia"))

    def test_candidate_key_prefers_bandcamp_band_id(self):
        item = {"band_id": 123, "band_url": "https://example.bandcamp.com"}
        self.assertEqual(MODULE.candidate_key(item), "bandcamp-id:123")

    def test_quality_gate_requires_confirmed_location_and_music(self):
        candidate = {
            "artist": "Example", "release": "Release", "sourceIdentifier": "123",
            "bandcampUrl": "https://example.bandcamp.com/album/release",
            "location": "Melbourne, Australia", "trackCountHint": 1,
        }
        self.assertIsNone(MODULE.quality_rejection(candidate))
        self.assertEqual(MODULE.quality_rejection({**candidate, "location": "Victoria, Australia"}), "NOT_CONFIRMED_MELBOURNE")
        self.assertEqual(MODULE.quality_rejection({**candidate, "trackCountHint": 0}), "NO_PLAYABLE_TRACK")
        self.assertEqual(MODULE.quality_rejection({**candidate, "artist": "Example Radio Show"}), "NON_ARTIST_ENTITY")

    def test_release_identity_accepts_collaborations_and_rejects_other_artists(self):
        collaboration = MODULE.assess_release_identity("Sleep D", ["Sleep D x Ad Lib Collective"], [])
        self.assertEqual(collaboration["status"], "VERIFIED")
        mismatch = MODULE.assess_release_identity("Deeperoots Music", ["Mike Steva"], [])
        self.assertEqual(mismatch["reason"], "RELEASE_ARTIST_MISMATCH")

    def test_release_identity_rejects_compilation_hubs(self):
        evidence = MODULE.assess_release_identity("Fecking Bahamas", ["Fecking Bahamas"], ["Band A", "Band B"])
        self.assertEqual(evidence["reason"], "VARIOUS_ARTIST_COMPILATION")


if __name__ == "__main__":
    unittest.main()
