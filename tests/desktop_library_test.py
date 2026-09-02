import unittest

from desktop.cosmic_aquarium_studio import decode_json_object


class DesktopLibraryJsonTests(unittest.TestCase):
    def test_decodes_utf8_bytes(self) -> None:
        self.assertEqual(decode_json_object(b'{"artists": []}', "artists-index.json"), {"artists": []})

    def test_empty_response_has_a_useful_error(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "No catalogue data was returned"):
            decode_json_object(None, "artists-index.json")

    def test_non_object_response_is_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "unexpected format"):
            decode_json_object("[]", "artists-index.json")


if __name__ == "__main__":
    unittest.main()
