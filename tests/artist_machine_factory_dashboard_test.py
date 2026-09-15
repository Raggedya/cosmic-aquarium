from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import call, patch

from desktop.artist_machine_factory_dashboard import (
    DELIVERY_BATCH_ENDPOINT,
    application_data,
    copy_missing_private_items,
    delivery_batch_status,
    load_delivery_queue,
    queue_published_machine,
    refresh_git_workspace,
    register_delivery_batch,
    run_process,
)


class ArtistMachineFactoryDashboardTests(unittest.TestCase):
    @patch("desktop.artist_machine_factory_dashboard.post_json")
    def test_delivery_batch_is_registered_as_one_cloudflare_request(self, post) -> None:
        post.return_value = {"ok": True, "id": "0f82a95d-a164-4e89-9704-296074f37931"}
        items = [{"artistSlug": "chime", "artistName": "CHIME", "publicUrl": "https://raggedya.github.io/cosmic-aquarium/artist/chime/"}]

        receipt = register_delivery_batch("artist@example.com", items)

        self.assertEqual(receipt, "0f82a95d-a164-4e89-9704-296074f37931")
        post.assert_called_once_with(DELIVERY_BATCH_ENDPOINT, {"email": "artist@example.com", "items": items})

    @patch("desktop.artist_machine_factory_dashboard.request_json")
    def test_delivery_batch_status_uses_only_the_private_receipt(self, request) -> None:
        request.return_value = {"ok": True, "status": "sent"}

        status = delivery_batch_status("0f82a95d-a164-4e89-9704-296074f37931")

        self.assertEqual(status, "sent")
        request.assert_called_once_with(DELIVERY_BATCH_ENDPOINT + "/0f82a95d-a164-4e89-9704-296074f37931")

    def test_published_machine_is_queued_once_for_batch_delivery(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "email-queue.json"
            report = {"artistSlug": "chime", "artistName": "CHIME", "deliveryEmail": "Artist@Example.com"}

            self.assertTrue(queue_published_machine(path, report))
            self.assertFalse(queue_published_machine(path, report))
            items = load_delivery_queue(path)

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["status"], "pending")
            self.assertEqual(items[0]["email"], "artist@example.com")

    def test_application_data_uses_non_virtualized_user_profile_location(self) -> None:
        with patch.dict("os.environ", {"USERPROFILE": "C:/Users/Test", "LOCALAPPDATA": "C:/Users/Test/AppData/Local"}, clear=True):
            self.assertEqual(application_data(), Path("C:/Users/Test/AGGITS/Artist Machine Factory"))

    def test_private_migration_copies_missing_items_without_overwriting(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "legacy"
            destination = root / "current"
            source.mkdir()
            destination.mkdir()
            (source / "chime.json").write_text("legacy", encoding="utf-8")
            (source / "new-band.json").write_text("new", encoding="utf-8")
            (destination / "chime.json").write_text("current", encoding="utf-8")

            copy_missing_private_items(source, destination)

            self.assertEqual((destination / "chime.json").read_text(encoding="utf-8"), "current")
            self.assertEqual((destination / "new-band.json").read_text(encoding="utf-8"), "new")

    @patch("desktop.artist_machine_factory_dashboard.run_process")
    def test_refresh_does_not_checkout_main_when_already_on_main(self, process) -> None:
        process.side_effect = [SimpleNamespace(stdout="main\n"), SimpleNamespace(stdout="Already up to date.\n")]

        refresh_git_workspace("git", Path("C:/Factory/workspace"))

        self.assertEqual(
            process.call_args_list,
            [
                call(["git", "-C", "C:\\Factory\\workspace", "branch", "--show-current"]),
                call(["git", "-C", "C:\\Factory\\workspace", "pull", "--ff-only", "origin", "main"]),
            ],
        )

    @patch("desktop.artist_machine_factory_dashboard.run_process")
    def test_refresh_returns_to_main_before_pulling_when_needed(self, process) -> None:
        process.side_effect = [SimpleNamespace(stdout="factory-candidate\n"), SimpleNamespace(stdout=""), SimpleNamespace(stdout="")]

        refresh_git_workspace("git", Path("C:/Factory/workspace"))

        self.assertEqual(process.call_args_list[1].args[0][-2:], ["checkout", "main"])
        self.assertEqual(process.call_args_list[2].args[0][-4:], ["pull", "--ff-only", "origin", "main"])

    @patch("desktop.artist_machine_factory_dashboard.subprocess.run")
    def test_git_stderr_is_shown_instead_of_only_exit_status(self, process) -> None:
        process.side_effect = subprocess.CalledProcessError(
            128,
            ["git", "checkout", "main"],
            stderr="fatal: Unable to create index.lock: File exists",
        )

        with self.assertRaisesRegex(RuntimeError, "index.lock: File exists"):
            run_process(["git", "checkout", "main"])


if __name__ == "__main__":
    unittest.main()
