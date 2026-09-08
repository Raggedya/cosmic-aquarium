import json
import tempfile
import unittest
from pathlib import Path

from desktop.tourism_config import app_data_dir, default_config, load_draft, save_draft, validate_config


ROOT = Path(__file__).resolve().parents[1]


class TourismDesktopTests(unittest.TestCase):
    def test_default_config_validates(self):
        value = validate_config(default_config(ROOT))
        self.assertEqual(value["destination"]["name"], "Bendigo")
        self.assertGreaterEqual(len(value["discoveries"]), 10)

    def test_tourism_storage_namespace_is_distinct(self):
        self.assertEqual(app_data_dir().name, "AGGITS Things To Do Machine")
        self.assertNotEqual(app_data_dir().name, "AGGITS Festivals")

    def test_draft_round_trip_preserves_tourism_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "draft.json"
            value = default_config(ROOT)
            value["destination"]["name"] = "Castlemaine"
            save_draft(value, path)
            restored = load_draft(ROOT, path)
            self.assertEqual(restored["destination"]["name"], "Castlemaine")
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["schemaVersion"], 1)

    def test_duplicate_discoveries_are_rejected(self):
        value = default_config(ROOT)
        value["discoveries"].append(value["discoveries"][0].copy())
        with self.assertRaisesRegex(ValueError, "Duplicate discovery id"):
            validate_config(value)

    def test_desktop_target_is_separate(self):
        source = (ROOT / "desktop" / "things_to_do_machine.py").read_text(encoding="utf-8")
        spec = (ROOT / "desktop" / "ThingsToDoMachine.spec").read_text(encoding="utf-8")
        self.assertIn('APP_ID = "com.aggits.things-to-do-machine"', source)
        self.assertIn('name="ThingsToDoMachine"', spec)
        self.assertNotIn('name="Festivals"', spec)


if __name__ == "__main__":
    unittest.main()
