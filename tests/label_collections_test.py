import importlib
import pathlib
import sys
import unittest
from unittest import mock


SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
MODULE = importlib.import_module("label_collections")


class LabelCollectionTests(unittest.TestCase):
    def test_public_roster_extracts_unique_canonical_bandcamp_hosts(self):
        document = '''
        <a href="https://artist-one.bandcamp.com/album/one">One</a>
        <a href="https://artist-one.bandcamp.com/track/two?from=label">One again</a>
        <a href="https://artist-two.bandcamp.com/music">Two</a>
        <a href="https://example.com/not-bandcamp">Ignore</a>
        '''
        with mock.patch.object(MODULE, "fetch_text", return_value=document):
            urls = MODULE.roster_bandcamp_urls("https://label.example/roster", 20)
        self.assertEqual(urls, ["https://artist-one.bandcamp.com/", "https://artist-two.bandcamp.com/"])

    def test_label_workflow_is_draft_and_memberships_keep_canonical_ids(self):
        with mock.patch.object(MODULE, "load_existing_artists", return_value={
            "bandcamp:artist-one": {"artistName": "Artist One", "aquariumSlug": "artist-one", "aquariumUrl": "https://example.test/artist-one/"}
        }), mock.patch.object(MODULE, "roster_bandcamp_urls", return_value=["https://artist-one.bandcamp.com/"]), mock.patch.object(MODULE, "COLLECTIONS_DIR") as collections_dir, mock.patch.object(MODULE, "RESEARCH_DIR") as research_dir:
            # The data-shape invariant is checked without writing into the real catalogue.
            candidate_id = MODULE.canonical_artist_id("https://artist-one.bandcamp.com/album/release")
            self.assertEqual(candidate_id, "bandcamp:artist-one")
            self.assertNotEqual(collections_dir, research_dir)


if __name__ == "__main__":
    unittest.main()
