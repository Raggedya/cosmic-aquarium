from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import artist_machine_factory as factory


def playable_track(index: int = 1) -> dict:
    return {
        "id": f"release-{index}",
        "title": f"Song {index}",
        "artist": "Test Band",
        "albumTitle": "Test Release",
        "bandcampUrl": f"https://test-band.bandcamp.com/track/song-{index}",
        "bandcampEmbedTrackId": str(1000 + index),
        "sourcePage": "https://test-band.bandcamp.com/album/test-release",
        "artworkUrl": "https://f4.bcbits.com/img/test.jpg",
    }


class ArtistMachineFactoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.factory = self.root / "factory"
        self.candidates = self.factory / "candidates"
        self.published = self.root / "published"
        self.public_skins = self.root / "public-skins"
        self.contract = self.factory / "skin-contract.json"
        self.contract.parent.mkdir(parents=True)
        self.contract.write_text(json.dumps({
            "canvas": {"aspectRatio": 747 / 1280, "maximumBytes": 5_000_000},
            "protectedZones": [],
            "rules": [],
        }), encoding="utf-8")
        self.patches = [
            patch.object(factory, "FACTORY", self.factory),
            patch.object(factory, "CANDIDATES", self.candidates),
            patch.object(factory, "PUBLISHED", self.published),
            patch.object(factory, "PUBLIC_SKINS", self.public_skins),
            patch.object(factory, "SKIN_CONTRACT", self.contract),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()
        self.temporary.cleanup()

    def test_configure_workspace_retargets_all_factory_paths(self) -> None:
        original = factory.ROOT
        try:
            root = self.root / "managed-workspace"
            contract = root / "automation" / "artist-machine-factory" / "skin-contract.json"
            contract.parent.mkdir(parents=True)
            contract.write_text(json.dumps({
                "canvas": {"aspectRatio": 747 / 1280, "maximumBytes": 5_000_000},
                "protectedZones": [],
                "rules": [],
            }), encoding="utf-8")
            factory.configure_workspace(root)
            expected = root.resolve()
            self.assertEqual(factory.ROOT, expected)
            self.assertEqual(factory.CANDIDATES, expected / "automation" / "artist-machine-factory" / "candidates")
            self.assertEqual(factory.PUBLISHED, expected / "automation" / "artist-machines")
            self.assertEqual(factory.PUBLIC_SKINS, expected / "public" / "music-machine")
        finally:
            factory.configure_workspace(original)

    def make_image(self, name: str, size: tuple[int, int] = (747, 1280)) -> Path:
        path = self.root / name
        Image.new("RGB", size, "#4b1919").save(path, quality=80)
        return path

    def make_intake(self, include_skin: bool = True) -> Path:
        reference = self.make_image("reference.jpg", (900, 900))
        skin = self.make_image("skin.jpg")
        value = {
            "schemaVersion": 1,
            "artist": {
                "name": "Test Band",
                "slug": "test-band",
                "bandcampUrl": "https://test-band.bandcamp.com/",
                "city": "Melbourne",
            },
            "editorial": {"bio": "Approved factual biography.", "tickerCopy": ["Studio note."]},
            "artwork": {
                "referenceImage": str(reference),
                "skinVariant": "test-band-custom",
            },
        }
        if include_skin:
            value["artwork"]["cabinetSkin"] = str(skin)
        path = self.root / "intake.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def catalogue(self):
        songs = [playable_track(index) for index in range(1, 5)]
        metadata = {
            "bio": "Bandcamp biography.",
            "location": "Melbourne",
            "heroArtwork": "https://f4.bcbits.com/img/test.jpg",
            "source": "https://test-band.bandcamp.com/",
            "catalogueAudit": {"releasePageCount": 1, "candidateTrackCount": 4, "excluded": {}},
        }
        return songs, metadata

    def test_prepare_is_isolated_and_ready_when_skin_passes(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(), replace=False)
        self.assertEqual(report["status"], "ready_for_approval")
        self.assertEqual(report["catalogue"]["playableSongCount"], 4)
        self.assertTrue(report["thirtySpinAudit"]["passed"])
        self.assertFalse((self.published / "test-band.json").exists())
        self.assertTrue((self.candidates / "test-band" / "machine.json").is_file())

    def test_prepare_without_skin_waits_for_skin(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(include_skin=False), replace=False)
        self.assertEqual(report["status"], "awaiting_skin")
        self.assertTrue((self.candidates / "test-band" / "skin-brief.json").is_file())

    def test_skin_geometry_is_locked(self):
        bad_skin = self.make_image("bad-skin.jpg", (1280, 747))
        with self.assertRaisesRegex(factory.FactoryError, "locked 747:1280"):
            factory.validate_artwork(bad_skin, cabinet_skin=True)

    def test_approval_promotes_only_a_passing_candidate(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            factory.prepare(self.make_intake(), replace=False)
        report = factory.approve("test-band", "QA operator", skip_quality_commands=True)
        published = json.loads((self.published / "test-band.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "approved")
        self.assertEqual(published["factory"]["engineVersion"], factory.ENGINE_VERSION)
        self.assertEqual(published["cabinetArtwork"], "/assets/music-machine/test-band-cabinet.jpg")
        self.assertTrue((self.public_skins / "test-band-cabinet.jpg").is_file())

    def test_track_validation_and_shuffle_audit_reject_bad_data(self):
        config = {
            "machineMode": "artist",
            "artistSlug": "test-band",
            "artistName": "Test Band",
            "bandcampArtistUrl": "https://test-band.bandcamp.com/",
            "songs": [playable_track(1), playable_track(1)],
        }
        validation = factory.validate_machine_config(config)
        self.assertFalse(validation["passed"])
        self.assertTrue(any("Duplicate" in error for error in validation["errors"]))


if __name__ == "__main__":
    unittest.main()
