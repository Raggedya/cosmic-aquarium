from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "audit_melbourne_universe.py"
SPEC = importlib.util.spec_from_file_location("audit_melbourne_universe", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
GEOGRAPHY = MODULE.read_json(MODULE.GEOGRAPHY, {})


class MelbourneUniverseTests(unittest.TestCase):
    def classify(self, location: str = "", bio: str = ""):
        return MODULE.classify_manifest({"primaryLocation": location, "bioShort": bio}, GEOGRAPHY)

    def test_explicit_melbourne_is_confirmed(self):
        result = self.classify("Melbourne, Australia")
        self.assertEqual(result["classification"], "MELBOURNE_CONFIRMED")
        self.assertEqual(result["confidence"], "CONFIRMED")

    def test_authoritative_suburb_is_confirmed_with_country(self):
        result = self.classify("Brunswick, Australia")
        self.assertEqual(result["classification"], "MELBOURNE_CONFIRMED")
        self.assertEqual(result["locality"], "Brunswick")
        self.assertTrue(result["lga"])

    def test_victoria_alone_is_never_accepted(self):
        result = self.classify("Victoria, Australia")
        self.assertEqual(result["classification"], "MELBOURNE_POSSIBLE")
        self.assertEqual(result["confidence"], "LOW")

    def test_regional_victoria_is_non_melbourne(self):
        self.assertEqual(self.classify("Geelong, Australia")["classification"], "NON_MELBOURNE_CONFIRMED")

    def test_overseas_locality_name_does_not_false_match(self):
        self.assertEqual(self.classify("Richmond, Virginia")["classification"], "NON_MELBOURNE_CONFIRMED")
        self.assertEqual(self.classify("Brighton, UK")["classification"], "NON_MELBOURNE_CONFIRMED")

    def test_explicit_biography_can_supply_high_confidence(self):
        result = self.classify("", "A Melbourne-based experimental duo making independent music.")
        self.assertEqual(result["classification"], "MELBOURNE_CONFIRMED")
        self.assertEqual(result["confidence"], "HIGH")

    def test_missing_location_enters_review(self):
        self.assertEqual(self.classify()["classification"], "LOCATION_UNKNOWN")


if __name__ == "__main__":
    unittest.main()
