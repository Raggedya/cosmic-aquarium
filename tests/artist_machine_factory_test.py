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
import bandcamp_label


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


def label_track(artist: str, index: int, title: str | None = None) -> dict:
    key = factory.slugify(artist)
    return {
        **playable_track(index),
        "id": f"{key}-{1000 + index}",
        "artist": artist,
        "title": title or f"Song {index}",
        "albumTitle": f"Release {index // 4}",
        "releaseTitle": f"Release {index // 4}",
        "bandcampUrl": f"https://test-label.bandcamp.com/track/song-{index}",
        "trackUrl": f"https://test-label.bandcamp.com/track/song-{index}",
        "releaseUrl": f"https://test-label.bandcamp.com/album/release-{index // 4}",
        "sourcePage": f"https://test-label.bandcamp.com/album/release-{index // 4}",
        "labelName": "Test Label",
        "labelUrl": "https://test-label.bandcamp.com/",
        "isLocked": False,
        "isSelected": False,
    }


class ArtistMachineFactoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.factory = self.root / "factory"
        self.candidates = self.factory / "candidates"
        self.published = self.root / "published"
        self.public_skins = self.root / "public-skins"
        self.public_media = self.root / "public-media"
        self.base_jukebox = self.root / "aggits-cabinet.webp"
        self.default_jukebox = self.root / "aggits-artist-default.jpg"
        self.github_pages = self.root / "github-pages"
        self.contract = self.factory / "skin-contract.json"
        self.contract.parent.mkdir(parents=True)
        self.contract.write_text(json.dumps({
            "canvas": {"width": 747, "height": 1280, "aspectRatio": 747 / 1280, "maximumBytes": 5_000_000},
            "protectedZones": [{"x": 0.2, "y": 0.3, "width": 0.6, "height": 0.2}],
            "rules": [],
        }), encoding="utf-8")
        Image.new("RGB", (1024, 1536), "#4a2416").save(self.base_jukebox, format="WEBP")
        Image.new("RGB", (747, 1280), "#380008").save(self.default_jukebox, quality=90)
        self.public_skins.mkdir(parents=True)
        self.public_media.mkdir(parents=True)
        Image.new("RGBA", (2172, 724), (0, 0, 0, 0)).save(self.public_skins / "aggits-marquee-v2.webp")
        Image.new("RGB", (1254, 1254), "#050308").save(self.public_media / "qr-card-template.jpg", quality=90)
        (self.github_pages / "artist").mkdir(parents=True)
        (self.github_pages / "assets" / "music-machine").mkdir(parents=True)
        (self.github_pages / "artist" / "index.html").write_text("<!doctype html><main></main>", encoding="utf-8")
        for name in factory.PREVIEW_RUNTIME_FILES:
            (self.github_pages / "assets" / name).write_text(f"/* {name} */\n", encoding="utf-8")
        self.patches = [
            patch.object(factory, "FACTORY", self.factory),
            patch.object(factory, "CANDIDATES", self.candidates),
            patch.object(factory, "PUBLISHED", self.published),
            patch.object(factory, "PUBLIC_SKINS", self.public_skins),
            patch.object(factory, "PUBLIC_MEDIA", self.public_media),
            patch.object(factory, "SKIN_CONTRACT", self.contract),
            patch.object(factory, "BASE_JUKEBOX", self.base_jukebox),
            patch.object(factory, "DEFAULT_ARTIST_JUKEBOX", self.default_jukebox),
            patch.object(factory, "detect_bandcamp_mode", return_value={"mode": "artist"}),
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
            self.assertEqual(factory.PUBLIC_MEDIA, expected / "public" / "artist-machine-media")
            self.assertEqual(factory.BASE_JUKEBOX, expected / "public" / "music-machine" / "aggits-cabinet.webp")
            self.assertEqual(factory.DEFAULT_ARTIST_JUKEBOX, expected / "public" / "music-machine" / "aggits-artist-default.jpg")
        finally:
            factory.configure_workspace(original)

    def make_image(self, name: str, size: tuple[int, int] = (747, 1280)) -> Path:
        path = self.root / name
        Image.new("RGB", size, "#4b1919").save(path, quality=80)
        return path

    def make_intake(self, include_skin: bool = True, include_reference: bool = True) -> Path:
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
                "skinVariant": "test-band-custom",
            },
        }
        if include_reference:
            value["artwork"]["referenceImage"] = str(reference)
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

    def test_prepare_is_isolated_and_ready_when_generated_skin_passes(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(include_skin=False), replace=False)
        self.assertEqual(report["status"], "ready_for_approval")
        self.assertEqual(report["catalogue"]["playableSongCount"], 4)
        self.assertTrue(report["thirtySpinAudit"]["passed"])
        self.assertFalse((self.published / "test-band.json").exists())
        self.assertTrue((self.candidates / "test-band" / "machine.json").is_file())

    def test_prepare_without_skin_generates_reference_driven_jukebox(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(include_skin=False), replace=False)
        self.assertEqual(report["status"], "ready_for_approval")
        self.assertEqual(report["skinGeneration"]["method"], "reference-composition-jukebox-v2")
        generated = self.candidates / "test-band" / "cabinet-skin.jpg"
        self.assertTrue(generated.is_file())
        with Image.open(generated) as image:
            self.assertEqual(image.size, (747, 1280))
        self.assertTrue((self.candidates / "test-band" / "skin-brief.json").is_file())

    def test_prepare_without_reference_uses_the_standard_red_skin_unchanged(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(include_skin=False, include_reference=False), replace=False)
        generated = self.candidates / "test-band" / "cabinet-skin.jpg"
        self.assertEqual(report["status"], "ready_for_approval")
        self.assertIsNone(report["referenceImage"])
        self.assertEqual(report["skinGeneration"]["method"], "standard-red-jukebox-v1")
        self.assertEqual(generated.read_bytes(), self.default_jukebox.read_bytes())

    def test_preview_contains_every_runtime_dependency_and_artist_data(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            factory.prepare(self.make_intake(include_skin=False), replace=False)
        with patch.object(factory, "ROOT", self.root):
            result = factory.build_preview("test-band", self.root / "preview")
        public_root = self.root / "preview" / "cosmic-aquarium"
        self.assertEqual(result["previewAudit"]["artistName"], "Test Band")
        self.assertEqual(result["previewAudit"]["playableSongCount"], 4)
        self.assertEqual(result["previewAudit"]["bandcampArtistUrl"], "https://test-band.bandcamp.com/")
        for name in factory.PREVIEW_RUNTIME_FILES:
            self.assertTrue((public_root / "assets" / name).is_file(), name)

    def test_skin_geometry_is_locked(self):
        bad_skin = self.make_image("bad-skin.jpg", (1280, 747))
        with self.assertRaisesRegex(factory.FactoryError, "locked 747:1280"):
            factory.validate_artwork(bad_skin, cabinet_skin=True)

    def test_approval_promotes_only_a_passing_candidate(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            factory.prepare(self.make_intake(include_skin=False), replace=False)
        report = factory.approve("test-band", "QA operator", skip_quality_commands=True)
        published = json.loads((self.published / "test-band.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "approved")
        self.assertEqual(published["factory"]["engineVersion"], factory.ENGINE_VERSION)
        self.assertEqual(published["cabinetArtwork"], "/assets/music-machine/test-band-cabinet.jpg")
        self.assertTrue((self.public_skins / "test-band-cabinet.jpg").is_file())
        self.assertTrue((self.public_media / "test-band" / "social-card.jpg").is_file())
        self.assertTrue((self.public_media / "test-band" / "qr-card.png").is_file())
        self.assertEqual(published["publicUrl"], "https://raggedya.github.io/cosmic-aquarium/artist/test-band/")

    def test_manual_skin_remains_available_as_an_advanced_override(self):
        with patch.object(factory, "discover_complete_catalogue", return_value=self.catalogue()):
            report = factory.prepare(self.make_intake(include_skin=True), replace=False)
        self.assertEqual(report["skinGeneration"]["method"], "operator-supplied")

    def test_monochrome_black_reference_still_produces_a_usable_palette(self):
        reference = self.make_image("black-reference.jpg", (900, 900))
        Image.new("RGB", (900, 900), "#000000").save(reference)
        palette = factory.reference_palette(reference)
        self.assertEqual(len(palette), 4)
        self.assertTrue(any(any(channel > 0 for channel in colour) for colour in palette))

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

    def test_label_prepare_saves_full_catalogue_but_builds_only_35_tracks(self):
        tracks = [label_track(f"Artist {index % 20 + 1}", index) for index in range(1, 81)]
        metadata = {
            "labelName": "Test Label",
            "labelUrl": "https://test-label.bandcamp.com/",
            "bio": "A public label biography.",
            "heroArtwork": tracks[0]["artworkUrl"],
            "artistCount": 20,
            "artists": [f"Artist {index}" for index in range(1, 21)],
            "releaseCount": 20,
            "eligibleTrackCount": 80,
            "failedReleaseCount": 0,
            "unattributedTrackCount": 0,
            "duplicateTrackCount": 0,
        }
        factory.detect_bandcamp_mode.return_value = {"mode": "label", "name": "Test Label"}
        with patch.object(factory, "discover_label_catalogue", return_value=(tracks, metadata)):
            report = factory.prepare(self.make_intake(include_skin=False, include_reference=False), replace=False)
        config = json.loads((self.candidates / "test-label" / "machine.json").read_text(encoding="utf-8"))
        saved = json.loads((self.candidates / "test-label" / "label-catalogue.json").read_text(encoding="utf-8"))
        self.assertEqual(report["catalogueKind"], "label")
        self.assertEqual(config["artistName"], "Test Label")
        self.assertEqual(len(config["songs"]), 35)
        self.assertEqual(len(saved["tracks"]), 80)
        self.assertEqual(len({track["artist"] for track in config["songs"]}), 20)

    def test_label_selection_and_locks_persist_across_reshuffles(self):
        tracks = [label_track(f"Artist {index % 12 + 1}", index) for index in range(1, 61)]
        selected = bandcamp_label.artist_balanced_selection(tracks, 35)
        selected_ids = {track["id"] for track in selected}
        locked_id = selected[0]["id"]
        for track in tracks:
            track["isSelected"] = track["id"] in selected_ids
            track["isLocked"] = track["id"] == locked_id
        paths = factory.candidate_paths("test-label")
        paths["root"].mkdir(parents=True)
        config = {
            "machineMode": "artist", "catalogueKind": "label", "artistSlug": "test-label",
            "artistName": "Test Label", "labelName": "Test Label", "labelUrl": "https://test-label.bandcamp.com/",
            "bandcampArtistUrl": "https://test-label.bandcamp.com/", "songs": selected,
        }
        factory.write_json_atomic(paths["config"], config)
        factory.write_json_atomic(paths["labelCatalogue"], {"tracks": tracks, "summary": {}})
        factory.write_json_atomic(paths["report"], {"artistSlug": "test-label", "catalogue": {}})
        factory.write_json_atomic(paths["status"], {"status": "ready_for_approval"})
        self.make_image("candidate-skin.jpg").replace(paths["skin"].with_suffix(".jpg"))
        factory.reshuffle_label_selection("test-label")
        reloaded = factory.label_catalogue("test-label")["tracks"]
        locked = next(track for track in reloaded if track["id"] == locked_id)
        self.assertTrue(locked["isLocked"])
        self.assertTrue(locked["isSelected"])
        self.assertEqual(sum(bool(track["isSelected"]) for track in reloaded), 35)


class BandcampLabelSelectionTests(unittest.TestCase):
    def test_many_artists_prefers_one_track_per_artist(self):
        tracks = [label_track(f"Artist {artist}", artist * 10 + song) for artist in range(1, 43) for song in range(2)]
        selected = bandcamp_label.artist_balanced_selection(tracks, 35, rng=__import__("random").Random(7))
        self.assertEqual(len(selected), 35)
        self.assertEqual(len({track["artist"] for track in selected}), 35)

    def test_twenty_artists_receive_coverage_before_second_tracks(self):
        tracks = [label_track(f"Artist {artist}", artist * 10 + song) for artist in range(1, 21) for song in range(4)]
        selected = bandcamp_label.artist_balanced_selection(tracks, 35, rng=__import__("random").Random(3))
        counts = {artist: sum(track["artist"] == artist for track in selected) for artist in {track["artist"] for track in tracks}}
        self.assertEqual(len(selected), 35)
        self.assertTrue(all(count >= 1 for count in counts.values()))
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

    def test_fewer_than_35_tracks_uses_every_valid_track(self):
        tracks = [label_track(f"Artist {index % 5}", index) for index in range(1, 25)]
        selected = bandcamp_label.artist_balanced_selection(tracks, 35, rng=__import__("random").Random(2))
        self.assertEqual({track["id"] for track in selected}, {track["id"] for track in tracks})

    def test_duplicate_reissues_are_removed_but_distinct_versions_survive(self):
        original = label_track("Artist A", 1, "Hidden Song")
        reissue = label_track("Artist A", 2, "Hidden Song (2024 Remastered)")
        live = label_track("Artist A", 3, "Hidden Song (Live)")
        unique, excluded = bandcamp_label.deduplicate_label_tracks([original, reissue, live])
        self.assertEqual(excluded, 1)
        self.assertEqual({track["id"] for track in unique}, {original["id"], live["id"]})

    def test_compilation_tracks_use_real_attribution_or_remain_uninvented(self):
        self.assertEqual(bandcamp_label.compilation_artist_and_title(None, "Various Artists", "The Mark of Cain - Interloper"), ("The Mark of Cain", "Interloper"))
        self.assertEqual(bandcamp_label.compilation_artist_and_title(None, "Various Artists", "Unattributed title"), ("", "Unattributed title"))

    def test_one_large_artist_cannot_hide_small_catalogue_artists(self):
        tracks = [label_track("Large Artist", index) for index in range(1, 101)]
        tracks.extend(label_track(f"Small Artist {index}", 200 + index) for index in range(1, 5))
        selected = bandcamp_label.artist_balanced_selection(tracks, 35, rng=__import__("random").Random(1))
        represented = {track["artist"] for track in selected}
        self.assertTrue({f"Small Artist {index}" for index in range(1, 5)}.issubset(represented))


if __name__ == "__main__":
    unittest.main()
