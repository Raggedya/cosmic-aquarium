from __future__ import annotations

import subprocess
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import call, patch

from desktop.artist_machine_factory_dashboard import refresh_git_workspace, run_process


class ArtistMachineFactoryDashboardTests(unittest.TestCase):
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
