from __future__ import annotations

import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from festival_discovery_service import (  # noqa: E402
    FestivalDiscoveryCache,
    FestivalImportResult,
    MAX_FESTIVAL_ARTISTS,
    discover_festival,
    festival_result_from_dict,
    selected_confident_matches,
    validate_bandcamp_artist_url,
    validate_public_url,
)


REPOSITORY = "Raggedya/cosmic-aquarium"
CREATE_WORKFLOW = "create-festival-machine.yml"
DELIVERY_REPOSITORY = "Raggedya/groove-vultures-deep-cuts-fan-challenge"
DELIVERY_WORKFLOW = "cosmic-aquarium-delivery.yml"
DELIVERY_EMAIL = "andrewharris501@gmail.com"
PAGES_BASE = "https://raggedya.github.io/cosmic-aquarium"

INK = "#07120f"
PANEL = "#0d211a"
PANEL_ALT = "#10281f"
EMERALD = "#163c2e"
GOLD = "#d9ad62"
GOLD_BRIGHT = "#f2d59c"
IVORY = "#fff2d0"
MUTED = "#9eaa9d"
LINE = "#355b47"
GOOD = "#b8d6a6"
WARN = "#e9bd75"
ERROR = "#e88d86"


def slugify(value: str) -> str:
    import unicodedata

    normal = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normal.casefold()).strip("-")[:72]


def app_data_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    return base / "AGGITS Festivals"


class FestivalsApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Festivals")
        self.geometry("1180x900")
        self.minsize(1040, 720)
        self.configure(bg=INK)
        self.protocol("WM_DELETE_WINDOW", self._close)

        self._busy = False
        self._ticker_dirty = False
        self._title_dirty = False
        self._loading_draft = False
        self._save_after = ""
        self._latest_url = ""
        self._festival_result: FestivalImportResult | None = None
        self._review_rows: list[dict[str, object]] = []
        self._imported_urls: list[str] = []
        self._imported_ticker = ""
        self._imported_title = ""
        self._cache = FestivalDiscoveryCache(app_data_dir() / "festival-cache.json")
        self.url_entries: list[tk.Entry] = []
        self._brave_key = ""

        self._load_search_settings()
        self._build_interface()
        self._load_draft()

    def _load_search_settings(self) -> None:
        environment_key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
        if environment_key:
            self._brave_key = environment_key
            return
        path = app_data_dir() / "settings.json"
        try:
            payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            self._brave_key = str(payload.get("braveSearchApiKey") or "").strip()
        except (OSError, json.JSONDecodeError, TypeError):
            self._brave_key = ""
        if self._brave_key:
            os.environ["BRAVE_SEARCH_API_KEY"] = self._brave_key

    def _save_search_settings(self, key: str) -> None:
        self._brave_key = key.strip()
        if self._brave_key:
            os.environ["BRAVE_SEARCH_API_KEY"] = self._brave_key
        else:
            os.environ.pop("BRAVE_SEARCH_API_KEY", None)
        directory = app_data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "settings.json"
        temporary = directory / "settings.tmp"
        temporary.write_text(json.dumps({"schemaVersion": 1, "braveSearchApiKey": self._brave_key}, indent=2), encoding="utf-8")
        try:
            temporary.chmod(0o600)
        except OSError:
            pass
        temporary.replace(path)

    def _update_search_status(self) -> None:
        configured = bool(os.environ.get("BRAVE_SEARCH_API_KEY", "").strip())
        self.search_status.configure(
            text="BRAVE SEARCH · CONFIGURED" if configured else "MULTI-SOURCE FALLBACK · BRAVE OPTIONAL",
            fg=GOOD if configured else MUTED,
        )

    def _configure_brave_search(self) -> None:
        dialog = tk.Toplevel(self)
        dialog.title("Brave Search")
        dialog.configure(bg=INK)
        dialog.geometry("590x245")
        dialog.resizable(False, False)
        dialog.transient(self)
        dialog.grab_set()
        body = tk.Frame(dialog, bg=PANEL, padx=28, pady=24)
        body.pack(fill="both", expand=True, padx=1, pady=1)
        tk.Label(body, text="BRAVE SEARCH API KEY", bg=PANEL, fg=IVORY, font=("Georgia", 15, "bold")).pack(anchor="w")
        tk.Label(body, text="Optional. Stored only in your local AGGITS Festivals settings and sent only to Brave Search as an API header.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9), wraplength=520, justify="left").pack(anchor="w", pady=(7, 14))
        entry = tk.Entry(body, show="•", bg=PANEL_ALT, fg=IVORY, insertbackground=GOLD, relief="flat", bd=0, font=("Segoe UI", 11))
        entry.pack(fill="x", ipady=10)
        if self._brave_key:
            entry.insert(0, self._brave_key)
        controls = tk.Frame(body, bg=PANEL)
        controls.pack(fill="x", pady=(16, 0))

        def save() -> None:
            try:
                self._save_search_settings(entry.get())
            except OSError as error:
                messagebox.showerror("Brave Search", f"The search setting could not be saved.\n\n{error}", parent=dialog)
                return
            self._update_search_status()
            dialog.destroy()

        tk.Button(controls, text="SAVE", command=save, bg=GOLD, fg=INK, activebackground=GOLD_BRIGHT, relief="flat", bd=0, font=("Segoe UI Semibold", 9), padx=20, pady=9).pack(side="left")
        tk.Button(controls, text="REMOVE KEY", command=lambda: (entry.delete(0, "end"), save()), bg=PANEL_ALT, fg=MUTED, activebackground=EMERALD, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=14, pady=9).pack(side="left", padx=(8, 0))
        tk.Button(controls, text="CANCEL", command=dialog.destroy, bg=PANEL, fg=MUTED, activebackground=PANEL_ALT, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=14, pady=9).pack(side="right")
        entry.focus_set()

    def _build_interface(self) -> None:
        self.canvas = tk.Canvas(self, bg=INK, highlightthickness=0)
        scrollbar = tk.Scrollbar(self, orient="vertical", command=self.canvas.yview, bg=PANEL, troughcolor=INK)
        self.canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.page = tk.Frame(self.canvas, bg=INK)
        self.page_window = self.canvas.create_window((0, 0), window=self.page, anchor="nw")
        self.page.bind("<Configure>", lambda _event: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda event: self.canvas.itemconfigure(self.page_window, width=event.width))
        self.bind_all("<MouseWheel>", lambda event: self.canvas.yview_scroll(int(-event.delta / 120) * 3, "units"))
        self.page.grid_columnconfigure(0, weight=1)

        header = tk.Frame(self.page, bg=INK)
        header.grid(row=0, column=0, sticky="ew", padx=56, pady=(38, 22))
        header.grid_columnconfigure(0, weight=1)
        tk.Label(header, text="AGGITS", bg=INK, fg=GOLD, font=("Georgia", 15, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(header, text="FESTIVALS", bg=INK, fg=IVORY, font=("Georgia", 34, "bold")).grid(row=1, column=0, sticky="w", pady=(5, 0))
        tk.Label(header, text="FESTIVAL MUSIC MACHINE STUDIO", bg=INK, fg=MUTED, font=("Segoe UI Semibold", 8)).grid(row=2, column=0, sticky="w", pady=(5, 0))
        seal = tk.Canvas(header, width=82, height=82, bg=INK, highlightthickness=0)
        seal.grid(row=0, column=1, rowspan=3, sticky="e")
        seal.create_oval(5, 5, 77, 77, outline=GOLD, width=2)
        seal.create_oval(13, 13, 69, 69, outline=LINE, width=1)
        seal.create_text(41, 41, text="F", fill=GOLD_BRIGHT, font=("Georgia", 28, "bold"))

        self._build_festival_import(self._panel(self.page, 1, "01", "FESTIVAL IMPORT"))
        self._build_review(self._panel(self.page, 2, "02", "MATCH REVIEW", hidden=True))
        self._build_configuration(self._panel(self.page, 3, "03", "MACHINE CONFIGURATION"))
        self._build_delivery(self._panel(self.page, 4, "04", "CREATE & DELIVER"))

    def _panel(self, parent: tk.Widget, row: int, number: str, title: str, hidden: bool = False) -> tk.Frame:
        outer = tk.Frame(parent, bg=LINE, padx=1, pady=1)
        outer.grid(row=row, column=0, sticky="ew", padx=56, pady=(0, 18))
        outer.grid_columnconfigure(0, weight=1)
        panel = tk.Frame(outer, bg=PANEL, padx=28, pady=24)
        panel.grid(row=0, column=0, sticky="ew")
        panel.grid_columnconfigure(0, weight=1)
        title_row = tk.Frame(panel, bg=PANEL)
        title_row.grid(row=0, column=0, sticky="ew", pady=(0, 20))
        tk.Label(title_row, text=number, bg=EMERALD, fg=GOLD_BRIGHT, font=("Segoe UI Semibold", 8), padx=9, pady=5).pack(side="left")
        tk.Label(title_row, text=title, bg=PANEL, fg=IVORY, font=("Segoe UI Semibold", 11), padx=12).pack(side="left")
        panel._outer = outer  # type: ignore[attr-defined]
        if hidden:
            outer.grid_remove()
        return panel

    def _entry(self, parent: tk.Widget, label: str, row: int, column: int = 0, width: int = 1, placeholder: str = "") -> tk.Entry:
        frame = tk.Frame(parent, bg=PANEL)
        frame.grid(row=row, column=column, columnspan=width, sticky="ew", padx=(0, 14 if column == 0 else 0), pady=(0, 14))
        frame.grid_columnconfigure(0, weight=1)
        tk.Label(frame, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).grid(row=0, column=0, sticky="w", pady=(0, 6))
        entry = tk.Entry(frame, bg=PANEL_ALT, fg=IVORY, insertbackground=GOLD, selectbackground=EMERALD, relief="flat", bd=0, font=("Segoe UI", 11))
        entry.grid(row=1, column=0, sticky="ew", ipady=10)
        if placeholder:
            entry.insert(0, placeholder)
            entry.configure(fg=MUTED)
            entry.bind("<FocusIn>", lambda _event, target=entry, value=placeholder: self._clear_placeholder(target, value))
            entry.bind("<FocusOut>", lambda _event, target=entry, value=placeholder: self._restore_placeholder(target, value))
        entry.bind("<KeyRelease>", self._schedule_save, add="+")
        return entry

    @staticmethod
    def _clear_placeholder(entry: tk.Entry, placeholder: str) -> None:
        if entry.get() == placeholder:
            entry.delete(0, "end")
            entry.configure(fg=IVORY)

    @staticmethod
    def _restore_placeholder(entry: tk.Entry, placeholder: str) -> None:
        if not entry.get().strip():
            entry.insert(0, placeholder)
            entry.configure(fg=MUTED)

    @staticmethod
    def _value(entry: tk.Entry, placeholder: str = "") -> str:
        value = entry.get().strip()
        return "" if placeholder and value == placeholder else value

    def _build_festival_import(self, panel: tk.Frame) -> None:
        panel.grid_columnconfigure(0, weight=1)
        panel.grid_columnconfigure(1, weight=1)
        tk.Label(panel, text="Find an official festival page, extract its lineup and cautiously match performers to playable Bandcamp profiles.", bg=PANEL, fg=MUTED, font=("Segoe UI", 10), anchor="w").grid(row=1, column=0, columnspan=2, sticky="ew", pady=(0, 20))
        self.festival_name = self._entry(panel, "FESTIVAL NAME · REQUIRED", 2, 0)
        self.festival_year = self._entry(panel, "FESTIVAL YEAR · OPTIONAL", 2, 1)
        self.festival_url = self._entry(panel, "FESTIVAL OR LINEUP URL · OPTIONAL", 3, 0, 2, "https://")

        search_settings = tk.Frame(panel, bg=PANEL_ALT, padx=12, pady=9)
        search_settings.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        search_settings.grid_columnconfigure(0, weight=1)
        self.search_status = tk.Label(search_settings, text="", bg=PANEL_ALT, fg=MUTED, font=("Segoe UI Semibold", 8), anchor="w")
        self.search_status.grid(row=0, column=0, sticky="ew")
        tk.Button(search_settings, text="CONFIGURE SEARCH", command=self._configure_brave_search, bg=EMERALD, fg=GOLD_BRIGHT, activebackground=LINE, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=13, pady=7).grid(row=0, column=1)
        self._update_search_status()

        controls = tk.Frame(panel, bg=PANEL)
        controls.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(4, 0))
        self.find_button = tk.Button(controls, text="FIND FESTIVAL & IMPORT ARTISTS", command=self._start_discovery, bg=GOLD, fg=INK, activebackground=GOLD_BRIGHT, activeforeground=INK, relief="flat", bd=0, font=("Segoe UI Semibold", 9), padx=22, pady=12, cursor="hand2")
        self.find_button.pack(side="left")
        tk.Button(controls, text="CLEAR FESTIVAL IMPORT", command=self._clear_festival_import, bg=PANEL, fg=MUTED, activebackground=PANEL_ALT, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, pady=12, cursor="hand2").pack(side="left", padx=(10, 0))
        self.import_status = tk.Label(controls, text="READY", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8), anchor="e")
        self.import_status.pack(side="right")
        self.progress_track = tk.Canvas(panel, height=4, bg="#091712", highlightthickness=0)
        self.progress_track.grid(row=6, column=0, columnspan=2, sticky="ew", pady=(16, 0))
        self.progress_bar = self.progress_track.create_rectangle(0, 0, 0, 4, fill=GOLD, outline="")

    def _build_review(self, panel: tk.Frame) -> None:
        self.review_panel = panel
        self.review_summary = tk.Label(panel, text="", bg=PANEL, fg=IVORY, justify="left", anchor="w", font=("Georgia", 15, "bold"))
        self.review_summary.grid(row=1, column=0, sticky="ew", pady=(0, 14))
        self.review_warning = tk.Label(panel, text="", bg="#2b2516", fg=WARN, justify="left", anchor="w", wraplength=980, font=("Segoe UI", 9), padx=12, pady=9)
        self.review_warning.grid(row=2, column=0, sticky="ew", pady=(0, 14))
        self.review_warning.grid_remove()
        review_controls = tk.Frame(panel, bg=PANEL)
        review_controls.grid(row=3, column=0, sticky="ew", pady=(0, 14))
        self.selection_count = tk.Label(review_controls, text="0 / 35 SELECTED", bg=PANEL, fg=GOLD_BRIGHT, font=("Segoe UI Semibold", 9))
        self.selection_count.pack(side="left")
        tk.Button(review_controls, text="SELECT ALL CONFIDENT", command=self._select_all_confident, bg=PANEL_ALT, fg=IVORY, activebackground=EMERALD, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, pady=8).pack(side="right")
        tk.Button(review_controls, text="CLEAR ALL", command=self._clear_review_selection, bg=PANEL, fg=MUTED, activebackground=PANEL_ALT, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, pady=8).pack(side="right", padx=(0, 8))
        self.review_content = tk.Frame(panel, bg=PANEL)
        self.review_content.grid(row=4, column=0, sticky="ew")
        self.review_content.grid_columnconfigure(0, weight=1)
        self.import_matches_button = tk.Button(panel, text="IMPORT SELECTED ARTISTS INTO URL FIELDS", command=self._import_selected, bg=GOLD, fg=INK, activebackground=GOLD_BRIGHT, relief="flat", bd=0, font=("Segoe UI Semibold", 9), padx=20, pady=12)
        self.import_matches_button.grid(row=5, column=0, sticky="w", pady=(18, 0))

    def _build_configuration(self, panel: tk.Frame) -> None:
        self.title_entry = self._entry(panel, "MACHINE TITLE", 1, 0)
        self.title_entry.bind("<KeyRelease>", self._mark_title_dirty, add="+")
        tk.Label(panel, text=f"BANDCAMP ARTIST URLS · UP TO {MAX_FESTIVAL_ARTISTS}", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).grid(row=2, column=0, sticky="w", pady=(8, 10))
        url_grid = tk.Frame(panel, bg=PANEL)
        url_grid.grid(row=3, column=0, sticky="ew")
        for column in range(2):
            url_grid.grid_columnconfigure(column, weight=1)
        for index in range(MAX_FESTIVAL_ARTISTS):
            cell = tk.Frame(url_grid, bg=PANEL)
            cell.grid(row=index // 2, column=index % 2, sticky="ew", padx=(0, 14 if index % 2 == 0 else 0), pady=(0, 8))
            cell.grid_columnconfigure(1, weight=1)
            tk.Label(cell, text=f"{index + 1:02}", bg=EMERALD, fg=GOLD_BRIGHT, font=("Consolas", 8), width=3, pady=8).grid(row=0, column=0)
            entry = tk.Entry(cell, bg=PANEL_ALT, fg=IVORY, insertbackground=GOLD, relief="flat", bd=0, font=("Segoe UI", 9))
            entry.grid(row=0, column=1, sticky="ew", ipady=8)
            entry.bind("<KeyRelease>", self._schedule_save)
            self.url_entries.append(entry)

        ticker_header = tk.Frame(panel, bg=PANEL)
        ticker_header.grid(row=4, column=0, sticky="ew", pady=(20, 8))
        tk.Label(ticker_header, text="FESTIVAL TICKER TEXT · 1,000 CHARACTERS MAXIMUM", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).pack(side="left")
        self.ticker_count = tk.Label(ticker_header, text="0 / 1000", bg=PANEL, fg=MUTED, font=("Consolas", 8))
        self.ticker_count.pack(side="right")
        self.ticker = tk.Text(panel, height=7, wrap="word", bg=PANEL_ALT, fg=IVORY, insertbackground=GOLD, selectbackground=EMERALD, relief="flat", bd=0, font=("Segoe UI", 10), padx=13, pady=12, undo=True)
        self.ticker.grid(row=5, column=0, sticky="ew")
        self.ticker.bind("<KeyRelease>", self._ticker_changed)
        ticker_controls = tk.Frame(panel, bg=PANEL)
        ticker_controls.grid(row=6, column=0, sticky="ew", pady=(8, 0))
        tk.Button(ticker_controls, text="USE IMPORTED TEXT", command=self._use_imported_ticker, bg=PANEL_ALT, fg=IVORY, activebackground=EMERALD, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, pady=8).pack(side="left")
        tk.Button(ticker_controls, text="REGENERATE FROM FESTIVAL PAGE", command=lambda: self._start_discovery(force=True), bg=PANEL, fg=GOLD_BRIGHT, activebackground=PANEL_ALT, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, pady=8).pack(side="left", padx=(8, 0))
        tk.Button(ticker_controls, text="CLEAR", command=self._clear_ticker, bg=PANEL, fg=MUTED, activebackground=PANEL_ALT, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, pady=8).pack(side="left", padx=(8, 0))

    def _build_delivery(self, panel: tk.Frame) -> None:
        tk.Label(panel, text=f"Publishes the reviewed machine, creates a scan-verified QR and emails the link and QR to {DELIVERY_EMAIL}.", bg=PANEL, fg=MUTED, font=("Segoe UI", 10), anchor="w", wraplength=900, justify="left").grid(row=1, column=0, sticky="ew", pady=(0, 18))
        controls = tk.Frame(panel, bg=PANEL)
        controls.grid(row=2, column=0, sticky="ew")
        self.create_button = tk.Button(controls, text="CREATE FESTIVAL MACHINE", command=self._start_create, bg=GOLD, fg=INK, activebackground=GOLD_BRIGHT, activeforeground=INK, relief="flat", bd=0, font=("Segoe UI Semibold", 10), padx=24, pady=14, cursor="hand2")
        self.create_button.pack(side="left")
        self.delivery_status = tk.Label(controls, text="READY TO CREATE", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8), padx=16)
        self.delivery_status.pack(side="left")
        self.open_button = tk.Button(controls, text="OPEN MACHINE", command=self._open_latest, bg=PANEL_ALT, fg=IVORY, activebackground=EMERALD, activeforeground=IVORY, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=15, pady=11)
        self.open_button.pack(side="right")
        self.open_button.pack_forget()

    def _mark_title_dirty(self, _event: object = None) -> None:
        if not self._loading_draft:
            self._title_dirty = True
        self._schedule_save()

    def _ticker_changed(self, _event: object = None) -> None:
        text = self.ticker.get("1.0", "end-1c")
        if len(text) > 1000:
            self.ticker.delete("1.0+1000c", "end")
            text = self.ticker.get("1.0", "end-1c")
        if not self._loading_draft:
            self._ticker_dirty = True
        self.ticker_count.configure(text=f"{len(text)} / 1000", fg=ERROR if len(text) >= 1000 else MUTED)
        self._schedule_save()

    def _set_progress(self, message: str, current: int | None = None, total: int | None = None) -> None:
        def update() -> None:
            self.import_status.configure(text=message.upper(), fg=GOLD_BRIGHT)
            width = max(1, self.progress_track.winfo_width())
            ratio = (current / total) if current is not None and total else 0.12
            self.progress_track.coords(self.progress_bar, 0, 0, max(8, width * min(1, ratio)), 4)
        self.after(0, update)

    def _start_discovery(self, force: bool = False) -> None:
        if self._busy:
            return
        name = self.festival_name.get().strip()
        url = self._value(self.festival_url, "https://")
        year_text = self.festival_year.get().strip()
        if not name:
            messagebox.showerror("Festival needed", "Enter the festival name.")
            return
        try:
            year = int(year_text) if year_text else None
            if url:
                validate_public_url(url)
        except ValueError as error:
            messagebox.showerror("Festival details", str(error))
            return
        self._busy = True
        self.find_button.configure(state="disabled", text="FINDING FESTIVAL…")
        self._set_progress("Locating festival…")
        threading.Thread(target=self._run_discovery, args=(name, url or None, year, force), daemon=True).start()

    def _run_discovery(self, name: str, url: str | None, year: int | None, force: bool) -> None:
        try:
            result = discover_festival(name, url, year, progress=self._set_progress, cache=None if force else self._cache)
            self.after(0, lambda: self._finish_discovery(result))
        except Exception as error:
            self.after(0, lambda message=str(error): self._discovery_error(message))

    def _finish_discovery(self, result: FestivalImportResult) -> None:
        self._busy = False
        self._festival_result = result
        self.find_button.configure(state="normal", text="FIND FESTIVAL & IMPORT ARTISTS")
        matched = [item for item in result.artists if item.match_status == "matched"]
        possible = [item for item in result.artists if item.match_status == "possible_match"]
        missing = [item for item in result.artists if item.match_status == "not_found"]
        incomplete = [item for item in result.artists if item.match_status == "check_failed"]
        self.import_status.configure(text=f"{len(matched)} BANDCAMP MATCHES", fg=GOOD)
        self.progress_track.coords(self.progress_bar, 0, 0, max(8, self.progress_track.winfo_width()), 4)
        identity = f"{result.festival_name.upper()} {result.festival_year or ''}".strip()
        location = result.location or "LOCATION NOT CONFIRMED"
        summary = f"{len(result.artists)} lineup artists · {len(matched)} matched · {len(possible)} possible · {len(missing)} not found"
        if incomplete:
            summary += f" · {len(incomplete)} checks incomplete"
        self.review_summary.configure(text=f"{identity}\n{location}\n\n{summary}")
        if result.warnings or len(matched) > MAX_FESTIVAL_ARTISTS:
            messages = list(result.warnings)
            if len(matched) > MAX_FESTIVAL_ARTISTS:
                messages.append(f"{len(matched)} Bandcamp artists were found. This machine supports a maximum of {MAX_FESTIVAL_ARTISTS}; choose the final lineup below.")
            self.review_warning.configure(text="\n".join(messages))
            self.review_warning.grid()
        else:
            self.review_warning.grid_remove()
        self._render_review(result)
        self.review_panel._outer.grid()  # type: ignore[attr-defined]

        suggestion = identity.title()
        if not self.title_entry.get().strip() or (self._imported_title and self.title_entry.get().strip() == self._imported_title and not self._title_dirty):
            self.title_entry.delete(0, "end")
            self.title_entry.insert(0, suggestion)
            self._imported_title = suggestion
            self._title_dirty = False
        self._imported_ticker = result.ticker_text
        if not self._ticker_dirty or not self.ticker.get("1.0", "end-1c").strip():
            self._use_imported_ticker()
        self._schedule_save()
        self.canvas.update_idletasks()
        self.canvas.yview_moveto(max(0, self.review_panel._outer.winfo_y() / max(1, self.page.winfo_height())))  # type: ignore[attr-defined]

    def _discovery_error(self, message: str) -> None:
        self._busy = False
        self.find_button.configure(state="normal", text="FIND FESTIVAL & IMPORT ARTISTS")
        self.import_status.configure(text="IMPORT PAUSED", fg=ERROR)
        self.progress_track.coords(self.progress_bar, 0, 0, 0, 4)
        messagebox.showerror("Festival Import", message + "\n\nYour current machine configuration has not been changed.")

    def _render_review(self, result: FestivalImportResult) -> None:
        for child in self.review_content.winfo_children():
            child.destroy()
        self._review_rows = []
        confident = {item.artist_name for item in selected_confident_matches(result)}
        groups = [
            ("MATCHED ARTISTS", "matched", GOOD),
            ("POSSIBLE MATCHES · REVIEW BEFORE ADDING", "possible_match", WARN),
            ("BANDCAMP CHECK INCOMPLETE · RETRY OR CONFIGURE SEARCH", "check_failed", ERROR),
            ("NO BANDCAMP MATCH FOUND", "not_found", MUTED),
        ]
        row = 0
        for heading, status, colour in groups:
            items = [item for item in result.artists if item.match_status == status]
            if not items:
                continue
            tk.Label(self.review_content, text=heading, bg=PANEL, fg=colour, font=("Segoe UI Semibold", 8)).grid(row=row, column=0, sticky="w", pady=(14 if row else 0, 7))
            row += 1
            for item in items:
                line = tk.Frame(self.review_content, bg=PANEL_ALT, padx=10, pady=7)
                line.grid(row=row, column=0, sticky="ew", pady=(0, 3))
                line.grid_columnconfigure(2, weight=1)
                selected = tk.BooleanVar(value=item.artist_name in confident and status == "matched")
                toggle = tk.Checkbutton(line, variable=selected, command=self._selection_changed, bg=PANEL_ALT, activebackground=PANEL_ALT, selectcolor=EMERALD, fg=IVORY, activeforeground=IVORY, bd=0, highlightthickness=0)
                toggle.grid(row=0, column=0, padx=(0, 7))
                if status in {"not_found", "check_failed"}:
                    toggle.configure(state="disabled")
                tk.Label(line, text=item.artist_name, bg=PANEL_ALT, fg=IVORY, font=("Segoe UI Semibold", 9), width=27, anchor="w").grid(row=0, column=1, sticky="w")
                url = tk.Entry(line, bg="#0a1a15", fg=IVORY if item.bandcamp_url else MUTED, insertbackground=GOLD, relief="flat", bd=0, font=("Segoe UI", 9))
                url.grid(row=0, column=2, sticky="ew", ipady=7, padx=(8, 8))
                if item.bandcamp_url:
                    url.insert(0, item.bandcamp_url)
                else:
                    url.insert(0, "No reliable Bandcamp profile found")
                    url.configure(state="disabled")
                evidence = "; ".join(item.evidence[:2])
                tk.Label(line, text=f"{item.confidence:.0%} · {evidence}", bg=PANEL_ALT, fg=MUTED, font=("Segoe UI", 7), anchor="w", wraplength=310, justify="left").grid(row=1, column=1, columnspan=2, sticky="w", pady=(3, 0))
                self._review_rows.append({"match": item, "selected": selected, "url": url, "toggle": toggle})
                row += 1
        self._selection_changed()

    def _selection_changed(self) -> None:
        selected_rows = [row for row in self._review_rows if isinstance(row["selected"], tk.BooleanVar) and row["selected"].get()]
        if len(selected_rows) > MAX_FESTIVAL_ARTISTS:
            selected_rows[-1]["selected"].set(False)
            messagebox.showwarning("35 artist maximum", f"This machine supports a maximum of {MAX_FESTIVAL_ARTISTS} artists. Clear another selection before adding this artist.")
            selected_rows.pop()
        self.selection_count.configure(text=f"{len(selected_rows)} / {MAX_FESTIVAL_ARTISTS} SELECTED", fg=ERROR if len(selected_rows) >= MAX_FESTIVAL_ARTISTS else GOLD_BRIGHT)

    def _select_all_confident(self) -> None:
        count = 0
        for row in self._review_rows:
            match = row["match"]
            select = getattr(match, "match_status", "") == "matched" and count < MAX_FESTIVAL_ARTISTS
            row["selected"].set(select)
            if select:
                count += 1
        self._selection_changed()

    def _clear_review_selection(self) -> None:
        for row in self._review_rows:
            row["selected"].set(False)
        self._selection_changed()

    def _import_selected(self) -> None:
        urls: list[str] = []
        for row in self._review_rows:
            if not row["selected"].get():
                continue
            value = row["url"].get().strip()
            try:
                value = validate_bandcamp_artist_url(value)
            except ValueError as error:
                messagebox.showerror("Bandcamp URL", f"{row['match'].artist_name}: {error}")
                return
            if value not in urls:
                urls.append(value)
        if not urls:
            messagebox.showinfo("No artists selected", "Select at least one matched artist.")
            return
        existing = [entry.get().strip() for entry in self.url_entries if entry.get().strip()]
        if existing and existing != urls:
            if not messagebox.askyesno("Replace artist list?", f"This will replace the current artist list with {len(urls)} festival artists. Continue?"):
                return
        for index, entry in enumerate(self.url_entries):
            entry.delete(0, "end")
            if index < len(urls):
                entry.insert(0, urls[index])
        self._imported_urls = urls
        self.delivery_status.configure(text=f"{len(urls)} ARTISTS READY", fg=GOOD)
        self._schedule_save()

    def _use_imported_ticker(self) -> None:
        if not self._imported_ticker:
            return
        self.ticker.delete("1.0", "end")
        self.ticker.insert("1.0", self._imported_ticker[:1000])
        self._ticker_dirty = False
        self._ticker_changed()
        self._ticker_dirty = False

    def _clear_ticker(self) -> None:
        self.ticker.delete("1.0", "end")
        self._ticker_dirty = True
        self._ticker_changed()

    def _clear_festival_import(self) -> None:
        if self._festival_result and not messagebox.askyesno("Clear Festival Import", "Clear festival research and imported selections? Manually changed machine settings will be preserved."):
            return
        imported = set(self._imported_urls)
        for entry in self.url_entries:
            if entry.get().strip() in imported:
                entry.delete(0, "end")
        if self._imported_ticker and self.ticker.get("1.0", "end-1c").strip() == self._imported_ticker:
            self.ticker.delete("1.0", "end")
        if self._imported_title and self.title_entry.get().strip() == self._imported_title:
            self.title_entry.delete(0, "end")
        for entry in (self.festival_name, self.festival_year):
            entry.delete(0, "end")
        self.festival_url.delete(0, "end")
        self._restore_placeholder(self.festival_url, "https://")
        self._festival_result = None
        self._review_rows = []
        self._imported_urls = []
        self._imported_ticker = ""
        self._imported_title = ""
        self.review_panel._outer.grid_remove()  # type: ignore[attr-defined]
        self.import_status.configure(text="READY", fg=MUTED)
        self._schedule_save()

    def _draft_payload(self) -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "title": self.title_entry.get().strip(),
            "bandcampUrls": [entry.get().strip() for entry in self.url_entries],
            "tickerText": self.ticker.get("1.0", "end-1c"),
            "festivalName": self.festival_name.get().strip(),
            "festivalYear": self.festival_year.get().strip(),
            "festivalUrl": self._value(self.festival_url, "https://"),
            "festivalResult": self._festival_result.as_dict() if self._festival_result else None,
            "importedUrls": self._imported_urls,
            "importedTicker": self._imported_ticker,
            "importedTitle": self._imported_title,
            "tickerDirty": self._ticker_dirty,
            "titleDirty": self._title_dirty,
        }

    def _schedule_save(self, _event: object = None) -> None:
        if self._loading_draft:
            return
        if self._save_after:
            self.after_cancel(self._save_after)
        self._save_after = self.after(450, self._save_draft)

    def _save_draft(self) -> None:
        self._save_after = ""
        directory = app_data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / "festival-draft.tmp"
        temporary.write_text(json.dumps(self._draft_payload(), ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(directory / "festival-draft.json")

    def _load_draft(self) -> None:
        path = app_data_dir() / "festival-draft.json"
        if not path.exists():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("schemaVersion") != 1:
                return
            self._loading_draft = True
            self.title_entry.insert(0, str(payload.get("title") or ""))
            for entry, value in zip(self.url_entries, payload.get("bandcampUrls") or []):
                entry.insert(0, str(value or ""))
            self.ticker.insert("1.0", str(payload.get("tickerText") or "")[:1000])
            self.festival_name.insert(0, str(payload.get("festivalName") or ""))
            self.festival_year.insert(0, str(payload.get("festivalYear") or ""))
            url = str(payload.get("festivalUrl") or "")
            if url:
                self.festival_url.delete(0, "end")
                self.festival_url.insert(0, url)
                self.festival_url.configure(fg=IVORY)
            self._imported_urls = [str(value) for value in payload.get("importedUrls") or []]
            self._imported_ticker = str(payload.get("importedTicker") or "")
            self._imported_title = str(payload.get("importedTitle") or "")
            self._ticker_dirty = bool(payload.get("tickerDirty"))
            self._title_dirty = bool(payload.get("titleDirty"))
            saved_result = payload.get("festivalResult")
            if isinstance(saved_result, dict):
                self._finish_discovery(festival_result_from_dict(saved_result))
            self._ticker_changed()
        except (OSError, json.JSONDecodeError, TypeError):
            pass
        finally:
            self._loading_draft = False

    def _validated_create_payload(self) -> dict[str, object]:
        title = self.title_entry.get().strip()
        if not title:
            raise ValueError("Enter the machine title.")
        ticker = self.ticker.get("1.0", "end-1c").strip()
        if len(ticker) > 1000:
            raise ValueError("Ticker text must be 1,000 characters or fewer.")
        urls: list[str] = []
        for index, entry in enumerate(self.url_entries, 1):
            value = entry.get().strip()
            if not value:
                continue
            try:
                value = validate_bandcamp_artist_url(value)
            except ValueError as error:
                raise ValueError(f"URL {index:02}: {error}") from error
            if value not in urls:
                urls.append(value)
        if not urls:
            raise ValueError("Add at least one Bandcamp artist URL.")
        if len(urls) > MAX_FESTIVAL_ARTISTS:
            raise ValueError(f"A machine supports a maximum of {MAX_FESTIVAL_ARTISTS} artists.")
        result = self._festival_result
        return {
            "title": title,
            "festivalName": self.festival_name.get().strip() or title,
            "festivalYear": self.festival_year.get().strip() or None,
            "festivalUrl": self._value(self.festival_url, "https://") or None,
            "festivalSourceUrl": result.source_url if result else None,
            "festivalDates": result.dates if result else None,
            "festivalLocation": result.location if result else None,
            "tickerText": ticker,
            "bandcampUrls": urls,
        }

    def _start_create(self) -> None:
        if self._busy:
            return
        try:
            payload = self._validated_create_payload()
        except ValueError as error:
            messagebox.showerror("Festival machine", str(error))
            return
        if not messagebox.askyesno("Create Festival Machine", f"Publish {payload['title']} with {len(payload['bandcampUrls'])} Bandcamp artists and email the link and QR to {DELIVERY_EMAIL}?"):
            return
        self._busy = True
        self.create_button.configure(state="disabled", text="CREATING…")
        self.delivery_status.configure(text="PREPARING FESTIVAL MACHINE", fg=GOLD_BRIGHT)
        started = dt.datetime.now(dt.timezone.utc)
        threading.Thread(target=self._run_create, args=(payload, started), daemon=True).start()

    def _run_create(self, payload: dict[str, object], started: dt.datetime) -> None:
        try:
            gh = self._github_cli()
            cache_key = started.strftime("%Y%m%d%H%M%S")
            payload = {**payload, "cacheKey": cache_key}
            request_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            subprocess.run([
                gh, "workflow", "run", CREATE_WORKFLOW, "--repo", REPOSITORY,
                "-f", f"request_json={request_json}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            run_id = self._find_run(gh, started, REPOSITORY, CREATE_WORKFLOW)
            if self._watch_run(gh, run_id, REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "The festival machine could not be published."))
            slug = slugify(str(payload["title"]))
            page_url = f"{PAGES_BASE}/festival/?festival={urllib.parse.quote(slug)}&edition={cache_key}"
            qr_url = f"{PAGES_BASE}/festival-qr/{urllib.parse.quote(slug)}.png?edition={cache_key}"
            self.after(0, lambda: self.delivery_status.configure(text="PUBLISHED · SENDING EMAIL", fg=GOLD_BRIGHT))
            delivery_started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([
                gh, "workflow", "run", DELIVERY_WORKFLOW, "--repo", DELIVERY_REPOSITORY,
                "-f", "operation=deliver_artist", "-f", f"artist_title={payload['title']}",
                "-f", f"page_url={page_url}", "-f", f"qr_url={qr_url}", "-f", f"recipient_email={DELIVERY_EMAIL}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            delivery_id = self._find_run(gh, delivery_started, DELIVERY_REPOSITORY, DELIVERY_WORKFLOW)
            if self._watch_run(gh, delivery_id, DELIVERY_REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, delivery_id, DELIVERY_REPOSITORY, "The machine was published, but email delivery paused."))
            self.after(0, lambda: self._finish_create(page_url))
        except Exception as error:
            self.after(0, lambda message=str(error): self._create_error(message))

    def _github_cli(self) -> str:
        executable = shutil.which("gh")
        if not executable:
            raise RuntimeError("GitHub CLI is required. Install it and sign in before creating a festival machine.")
        check = subprocess.run([executable, "auth", "status"], capture_output=True, text=True, creationflags=self._creation_flags())
        if check.returncode != 0:
            raise RuntimeError("GitHub CLI is not signed in. Run gh auth login, then try again.")
        return executable

    def _find_run(self, gh: str, started: dt.datetime, repository: str, workflow: str) -> int:
        for _ in range(28):
            process = subprocess.run([gh, "run", "list", "--repo", repository, "--workflow", workflow, "--limit", "10", "--json", "databaseId,createdAt"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            for item in json.loads(process.stdout):
                created = dt.datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00"))
                if created >= started - dt.timedelta(seconds=5):
                    return int(item["databaseId"])
            time.sleep(2.5)
        raise RuntimeError("GitHub accepted the request, but the workflow run could not be located.")

    def _watch_run(self, gh: str, run_id: int, repository: str) -> str:
        for _ in range(360):
            process = subprocess.run([gh, "run", "view", str(run_id), "--repo", repository, "--json", "status,conclusion"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            value = json.loads(process.stdout)
            if value.get("status") == "completed":
                return str(value.get("conclusion") or "failure")
            time.sleep(5)
        return "timed_out"

    def _workflow_failure(self, gh: str, run_id: int, repository: str, fallback: str) -> str:
        try:
            process = subprocess.run([gh, "run", "view", str(run_id), "--repo", repository, "--log-failed"], capture_output=True, text=True, creationflags=self._creation_flags())
            tail = "\n".join((process.stdout or process.stderr).splitlines()[-12:]).strip()
            return f"{fallback}\n\n{tail}" if tail else fallback
        except OSError:
            return fallback

    @staticmethod
    def _creation_flags() -> int:
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)

    def _finish_create(self, url: str) -> None:
        self._busy = False
        self._latest_url = url
        self.create_button.configure(state="normal", text="CREATE ANOTHER FESTIVAL MACHINE")
        self.delivery_status.configure(text="CREATED · LINK + QR EMAILED", fg=GOOD)
        self.open_button.pack(side="right")

    def _create_error(self, message: str) -> None:
        self._busy = False
        self.create_button.configure(state="normal", text="TRY AGAIN")
        self.delivery_status.configure(text="CREATION PAUSED", fg=ERROR)
        messagebox.showerror("Festivals", message)

    def _open_latest(self) -> None:
        if self._latest_url:
            webbrowser.open(self._latest_url)

    def _close(self) -> None:
        try:
            self._save_draft()
        finally:
            self.destroy()


def main() -> None:
    app = FestivalsApp()
    app.mainloop()


if __name__ == "__main__":
    main()
