from __future__ import annotations

import json
import sys
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import ttk


INK = "#100906"
PANEL = "#1b0f0a"
CREAM = "#f4dfae"
PAPER = "#fff3d3"
MUTED = "#bda885"
BURGUNDY = "#6f1423"
BRASS = "#b98439"
PUBLIC_URL = "https://raggedya.github.io/cosmic-aquarium/spotify/"


def bundled_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parents[1]


def discovery_records() -> list[dict[str, object]]:
    path = bundled_root() / "data" / "spotify" / "artist-discovery.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [dict(item) for item in value.get("records", []) if isinstance(item, dict)]


class SpotifyBandcampModeFrame(tk.Frame):
    """Integrated control surface for the frozen Spotify + Bandcamp machine."""

    def __init__(self, parent: tk.Misc, dashboard: tk.Misc) -> None:
        super().__init__(parent, bg=INK)
        self.dashboard = dashboard
        self.records = discovery_records()
        self._build()

    def _build(self) -> None:
        heading = tk.Frame(self, bg=INK)
        heading.pack(fill="x", padx=28, pady=(24, 16))
        tk.Label(heading, text="SPOTIFY + BANDCAMP", bg=INK, fg=CREAM, font=("Georgia", 20, "bold")).pack(anchor="w")
        tk.Label(
            heading,
            text="ONE SHARED AGGITS MACHINE · OFFICIAL SPOTIFY PLAYER · BANDCAMP DISCOVERY",
            bg=INK,
            fg=MUTED,
            font=("Segoe UI Semibold", 8),
        ).pack(anchor="w", pady=(4, 0))

        shell = tk.Frame(self, bg=PANEL, highlightbackground="#58331d", highlightthickness=1)
        shell.pack(fill="both", expand=True, padx=28, pady=(0, 24))
        intro = tk.Frame(shell, bg=PANEL)
        intro.pack(fill="x", padx=28, pady=(24, 18))
        tk.Label(intro, text="PROOF-OF-CONCEPT LIBRARY", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).pack(anchor="w")
        tk.Label(
            intro,
            text=f"{len(self.records)} validated artists. Pulling the lever selects an artist, retracts the mechanical panel and reveals Spotify. Bandcamp remains a separate action.",
            bg=PANEL,
            fg=PAPER,
            wraplength=920,
            justify="left",
            font=("Segoe UI", 10),
        ).pack(anchor="w", pady=(8, 14))
        actions = tk.Frame(intro, bg=PANEL)
        actions.pack(fill="x")
        tk.Button(actions, text="OPEN SPOTIFY + BANDCAMP MACHINE", command=lambda: webbrowser.open(PUBLIC_URL), bg=BURGUNDY, fg=PAPER, activebackground="#a73648", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 10), padx=22, pady=11).pack(side="left")
        tk.Button(actions, text="COPY LIVE URL", command=self._copy_url, bg="#3b2415", fg=CREAM, activebackground="#5a351e", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 10), padx=22, pady=11).pack(side="left", padx=10)

        table_shell = tk.Frame(shell, bg=PANEL)
        table_shell.pack(fill="both", expand=True, padx=28, pady=(0, 26))
        tree = ttk.Treeview(table_shell, columns=("artist", "spotify", "bandcamp"), show="headings", style="Festival.Treeview")
        tree.heading("artist", text="ARTIST")
        tree.heading("spotify", text="SPOTIFY")
        tree.heading("bandcamp", text="BANDCAMP")
        tree.column("artist", width=260, anchor="w")
        tree.column("spotify", width=180, anchor="center")
        tree.column("bandcamp", width=180, anchor="center")
        for record in self.records:
            tree.insert("", "end", values=(record.get("artistName", ""), "OFFICIAL EMBED", "BUY / EXPLORE"))
        scroll = ttk.Scrollbar(table_shell, orient="vertical", command=tree.yview, style="Factory.Vertical.TScrollbar")
        tree.configure(yscrollcommand=scroll.set)
        tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

    def _copy_url(self) -> None:
        self.clipboard_clear()
        self.clipboard_append(PUBLIC_URL)
        self.update()
