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
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from email.utils import parsedate_to_datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageTk


REPOSITORY = "Raggedya/cosmic-aquarium"
WORKFLOW = "create-artist.yml"
STATUS_WORKFLOW = "set-aquarium-status.yml"
LOCATION_WORKFLOW = "research-location.yml"
LABEL_WORKFLOW = "research-label.yml"
LOCATION_STATUS_WORKFLOW = "set-collection-status.yml"
DELIVERY_REPOSITORY = "Raggedya/groove-vultures-deep-cuts-fan-challenge"
DELIVERY_WORKFLOW = "cosmic-aquarium-delivery.yml"
PAGES_BASE = "https://raggedya.github.io/cosmic-aquarium"
RAW_CATALOGUE_BASE = "https://raw.githubusercontent.com/Raggedya/cosmic-aquarium/main"
INK = "#07071d"
PAPER = "#f5f3fb"
MUTED = "#9993ad"
LAVENDER = "#c7b8f4"
LINE = "#302d4b"
THEMES = (
    {"id": "cosmic", "label": "COSMIC BLOOM", "asset": "flowers/anemone.png", "bg": "#080822", "accent": "#c7b8f4"},
    {"id": "violet", "label": "VIOLET HAZE", "asset": "flowers/anemone.png", "bg": "#17103b", "accent": "#c584f0"},
    {"id": "chrome", "label": "CHROME SKULLS", "asset": "skulls/chrome-skull-silver.png", "bg": "#020305", "accent": "#a9c8f6"},
    {"id": "glass", "label": "GLASS GARDEN", "asset": "glass/crystal-flower.png", "bg": "#080721", "accent": "#b49cff"},
)
LIBRARY_MODES = (
    ("master", "MASTER LIBRARY"),
    ("locations", "LOCATIONS"),
    ("labels", "LABELS"),
    ("styles", "STYLES"),
    ("daily", "DAILY DISCOVERY"),
    ("published", "PUBLISHED"),
    ("themes", "THEMES"),
)


def release_date_label(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return "RELEASE DATE UNKNOWN"
    try:
        parsed = dt.datetime.fromisoformat(text.replace(" UTC", "+00:00").replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return "RELEASE DATE UNKNOWN"
    return f"RELEASED {parsed.day} {parsed.strftime('%b %Y').upper()}"


def resource_path(relative: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / relative


def decode_json_object(raw: object, source: str) -> dict:
    """Decode one catalogue document without leaking low-level JSON errors to the UI."""
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8-sig", errors="replace")
    if not isinstance(raw, str) or not raw.strip():
        raise RuntimeError(f"No catalogue data was returned for {source}. Please check your connection and try again.")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"The catalogue response for {source} was incomplete. Please refresh the library.") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"The catalogue response for {source} had an unexpected format.")
    return value


def slugify(value: str) -> str:
    import unicodedata
    normal = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normal.lower()).strip("-")[:72]


def valid_bandcamp(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value.strip())
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and (host == "bandcamp.com" or host.endswith(".bandcamp.com")) and not parsed.username and not parsed.password
    except ValueError:
        return False


class CosmicAquariumStudio(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Cosmic Aquaria Studio")
        self.geometry("1280x820")
        self.minsize(1120, 720)
        self.configure(bg=INK)
        self.protocol("WM_DELETE_WINDOW", self.destroy)
        self._images: list[ImageTk.PhotoImage] = []
        self._latest_url = ""
        self._busy = False
        self._library_busy = False
        self._library_entries: list[dict] = []
        self.library_mode = "master"
        self.visual_style = "cosmic"
        self.theme_canvases: dict[str, tk.Canvas] = {}
        self.theme_images: list[ImageTk.PhotoImage] = []
        self._build_interface()

    def _build_interface(self) -> None:
        self.canvas = tk.Canvas(self, bg=INK, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", self._draw_background)

        shell = tk.Frame(self.canvas, bg=INK)
        self.shell = shell
        self.shell_window = self.canvas.create_window(0, 0, anchor="nw", window=shell)
        shell.grid_columnconfigure(0, weight=1)
        shell.grid_columnconfigure(1, weight=0)
        shell.grid_rowconfigure(1, weight=1)

        brand = tk.Frame(shell, bg=INK)
        brand.grid(row=0, column=0, columnspan=2, sticky="ew", padx=58, pady=(42, 0))
        mark = tk.Canvas(brand, width=42, height=42, bg=INK, highlightthickness=0)
        mark.pack(side="left")
        mark.create_oval(3, 3, 39, 39, outline="#8d88aa", width=1)
        mark.create_line(12, 21, 30, 21, fill="#a9a3c6")
        mark.create_line(14, 15, 28, 27, fill="#a9a3c6")
        mark.create_line(14, 27, 28, 15, fill="#a9a3c6")
        tk.Label(brand, text="COSMIC AQUARIA", bg=INK, fg=PAPER, font=("Segoe UI", 11), padx=15).pack(side="left")
        tk.Label(brand, text="CREATOR", bg=INK, fg=MUTED, font=("Segoe UI", 8)).pack(side="left")
        self.library_nav = tk.Button(brand, text="LIBRARY", command=self._show_library, bg=INK, fg=MUTED, activebackground=INK, activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, cursor="hand2")
        self.library_nav.pack(side="right")
        self.creator_nav = tk.Button(brand, text="CREATE", command=self._show_creator, bg=INK, fg=LAVENDER, activebackground=INK, activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=12, cursor="hand2")
        self.creator_nav.pack(side="right")

        content = tk.Frame(shell, bg=INK)
        self.creator_content = content
        content.grid(row=1, column=0, sticky="nsew", padx=(82, 38), pady=(58, 36))
        content.grid_columnconfigure(0, weight=1)

        tk.Label(content, text="MAKE AN AQUARIUM", bg=INK, fg=LAVENDER, font=("Segoe UI Semibold", 9)).grid(row=0, column=0, sticky="w")
        tk.Label(content, text="A band. A link.\nA living world.", justify="left", bg=INK, fg=PAPER, font=("Georgia", 36), pady=15).grid(row=1, column=0, sticky="w")
        tk.Label(
            content,
            text="Every living object becomes a discovery.\nThe finished link and scan-tested QR arrive by email.",
            justify="left", bg=INK, fg=MUTED, font=("Segoe UI", 11), pady=4,
        ).grid(row=2, column=0, sticky="w")

        self.artist = self._field(content, 3, "BAND OR ARTIST", "Immigrant Union")
        self.bandcamp = self._field(content, 4, "BANDCAMP URL", "https://artist.bandcamp.com/")
        self.recipient = self._field(content, 5, "DELIVER TO", "andrewharris501@gmail.com")
        self.recipient.insert(0, "andrewharris501@gmail.com")

        self.create_button = tk.Button(
            content, text="CREATE  ✦", command=self._start_create, bg=LAVENDER, fg="#09091e",
            activebackground="#ded4ff", activeforeground="#09091e", relief="flat", bd=0,
            font=("Segoe UI Semibold", 11), padx=28, pady=15, cursor="hand2",
        )
        self.create_button.grid(row=6, column=0, sticky="w", pady=(32, 0))

        self.status = tk.Label(content, text="READY", bg=INK, fg=MUTED, font=("Segoe UI Semibold", 8), pady=16)
        self.status.grid(row=7, column=0, sticky="w")

        self.result_row = tk.Frame(content, bg=INK)
        self.result_row.grid(row=8, column=0, sticky="w")
        self.open_button = tk.Button(self.result_row, text="OPEN AQUARIUM", command=self._open_result, bg=INK, fg=LAVENDER, activebackground=INK, activeforeground=PAPER, relief="flat", font=("Segoe UI Semibold", 8), cursor="hand2")
        self.copy_button = tk.Button(self.result_row, text="COPY LINK", command=self._copy_result, bg=INK, fg=MUTED, activebackground=INK, activeforeground=PAPER, relief="flat", font=("Segoe UI Semibold", 8), cursor="hand2")
        self.open_button.pack(side="left", padx=(0, 20))
        self.copy_button.pack(side="left")
        self.result_row.grid_remove()

        chooser = tk.Frame(shell, width=366, bg=INK)
        self.creator_chooser = chooser
        chooser.grid(row=1, column=1, sticky="n", padx=(0, 54), pady=(43, 20))
        chooser.grid_propagate(False)
        chooser.configure(height=610)
        tk.Label(chooser, text="CHOOSE A VISUAL WORLD", bg=INK, fg=LAVENDER, font=("Segoe UI Semibold", 9)).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 7))
        tk.Label(chooser, text="The artwork is a creative choice — never assigned by genre.", bg=INK, fg=MUTED, font=("Segoe UI", 9)).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 20))
        for index, theme in enumerate(THEMES):
            row, column = divmod(index, 2)
            tile = tk.Canvas(chooser, width=168, height=146, bg=INK, highlightthickness=0, cursor="hand2")
            tile.grid(row=row + 2, column=column, padx=(0, 14), pady=(0, 18), sticky="nw")
            tile.bind("<Button-1>", lambda _event, style=theme["id"]: self._select_style(style))
            tile.bind("<Return>", lambda _event, style=theme["id"]: self._select_style(style))
            tile.configure(takefocus=True)
            self.theme_canvases[theme["id"]] = tile
            self._draw_theme_thumbnail(tile, theme)
        self._select_style("cosmic", announce=False)

        self._build_library(shell)

        footer = tk.Frame(shell, bg=INK)
        footer.grid(row=2, column=0, columnspan=2, sticky="ew", padx=58, pady=(0, 28))
        tk.Label(footer, text="© CLEARLIGHT CREATIVE 2026", bg=INK, fg="#5d5871", font=("Segoe UI", 7)).pack(side="left")
        tk.Label(footer, text="GITHUB PAGES  ·  BANDCAMP  ·  SCAN VERIFIED", bg=INK, fg="#5d5871", font=("Segoe UI", 7)).pack(side="right")

        self.artist.focus_set()

    def _build_library(self, shell: tk.Frame) -> None:
        library = tk.Frame(shell, bg=INK)
        self.library_view = library
        library.grid(row=1, column=0, columnspan=2, sticky="nsew", padx=58, pady=(30, 22))
        library.grid_columnconfigure(0, weight=1)
        library.grid_rowconfigure(6, weight=1)

        heading = tk.Frame(library, bg=INK)
        heading.grid(row=0, column=0, sticky="ew")
        tk.Label(heading, text="COSMIC AQUARIA CONTROL ROOM", bg=INK, fg=LAVENDER, font=("Segoe UI Semibold", 9)).pack(side="left")
        tk.Button(heading, text="REFRESH", command=self._start_load_library, bg=INK, fg=MUTED, activebackground=INK, activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), cursor="hand2").pack(side="right")

        mode_bar = tk.Frame(library, bg=INK)
        mode_bar.grid(row=1, column=0, sticky="ew", pady=(14, 0))
        self.library_mode_buttons: dict[str, tk.Button] = {}
        for mode, label in LIBRARY_MODES:
            button = tk.Button(mode_bar, text=label, command=lambda value=mode: self._set_library_mode(value), bg=INK, fg=LAVENDER if mode == "master" else MUTED, activebackground=INK, activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 7), padx=9, cursor="hand2")
            button.pack(side="left")
            self.library_mode_buttons[mode] = button

        self.library_heading = tk.Label(library, text="ONE ARTIST. ONE AQUARIUM. MANY DOORWAYS.", bg=INK, fg=PAPER, font=("Georgia", 22), anchor="w")
        self.library_heading.grid(row=2, column=0, sticky="ew", pady=(14, 6))
        self.library_status = tk.Label(library, text="", bg=INK, fg=MUTED, font=("Segoe UI", 9), anchor="w")
        self.library_status.grid(row=3, column=0, sticky="ew", pady=(0, 12))

        self.location_form = tk.Frame(library, bg="#0b0b24", padx=18, pady=14)
        self.location_form.grid(row=4, column=0, sticky="ew", pady=(0, 10))
        self.location_form.grid_columnconfigure(0, weight=1)
        tk.Label(self.location_form, text="NEW LOCATION", bg="#0b0b24", fg=LAVENDER, font=("Segoe UI Semibold", 8)).grid(row=0, column=0, sticky="w")
        self.location_entry = tk.Entry(self.location_form, bg="#0b0b24", fg=PAPER, insertbackground=LAVENDER, relief="flat", bd=0, font=("Segoe UI", 11))
        self.location_entry.grid(row=1, column=0, sticky="ew", pady=(8, 3), padx=(0, 14))
        self.location_entry.insert(0, "Portland, Oregon")
        self.location_max = tk.Spinbox(self.location_form, from_=1, to=100, width=5, bg="#12112e", fg=PAPER, buttonbackground="#12112e", relief="flat", font=("Segoe UI", 10))
        self.location_max.delete(0, "end"); self.location_max.insert(0, "25")
        self.location_max.grid(row=1, column=1, padx=(0, 12))
        tk.Button(self.location_form, text="CREATE LOCATION", command=self._start_create_location, bg=LAVENDER, fg="#09091e", activebackground="#ded4ff", relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, pady=9, cursor="hand2").grid(row=1, column=2)
        tk.Label(self.location_form, text="Research creates a reviewable draft. Verified artists reuse their canonical Artist Aquarium; publishing remains your decision.", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=2, column=0, columnspan=3, sticky="w", pady=(6, 0))

        self.label_form = tk.Frame(library, bg="#0b0b24", padx=18, pady=14)
        self.label_form.grid(row=4, column=0, sticky="ew", pady=(0, 10))
        self.label_form.grid_columnconfigure(1, weight=1)
        tk.Label(self.label_form, text="NEW LABEL", bg="#0b0b24", fg=LAVENDER, font=("Segoe UI Semibold", 8)).grid(row=0, column=0, columnspan=4, sticky="w")
        tk.Label(self.label_form, text="NAME", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 7)).grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.label_name_entry = tk.Entry(self.label_form, bg="#12112e", fg=PAPER, insertbackground=LAVENDER, relief="flat", bd=0, font=("Segoe UI", 10), width=24)
        self.label_name_entry.grid(row=2, column=0, sticky="ew", padx=(0, 10), ipady=7)
        tk.Label(self.label_form, text="PUBLIC WEBSITE OR ROSTER URL", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 7)).grid(row=1, column=1, sticky="w", pady=(8, 0))
        self.label_url_entry = tk.Entry(self.label_form, bg="#12112e", fg=PAPER, insertbackground=LAVENDER, relief="flat", bd=0, font=("Segoe UI", 10))
        self.label_url_entry.grid(row=2, column=1, sticky="ew", padx=(0, 10), ipady=7)
        tk.Button(self.label_form, text="RESEARCH LABEL", command=self._start_create_label, bg=LAVENDER, fg="#09091e", activebackground="#ded4ff", relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, pady=9, cursor="hand2").grid(row=2, column=2)

        filter_bar = tk.Frame(library, bg=INK)
        filter_bar.grid(row=5, column=0, sticky="ew", pady=(0, 10))
        filter_bar.grid_columnconfigure(0, weight=1)
        self.library_search = tk.Entry(filter_bar, bg="#0b0b24", fg=PAPER, insertbackground=LAVENDER, relief="flat", bd=0, font=("Segoe UI", 9))
        self.library_search.grid(row=0, column=0, sticky="ew", ipady=8, padx=(0, 10))
        self.library_search.insert(0, "")
        self.library_search.bind("<KeyRelease>", lambda _event: self._apply_library_filters())
        self.library_filter = tk.StringVar(value="all")
        self.library_sort = tk.StringVar(value="name")
        status_menu = tk.OptionMenu(filter_bar, self.library_filter, "all", "published", "draft", "disabled", command=lambda _value: self._apply_library_filters())
        status_menu.configure(bg="#0b0b24", fg=MUTED, activebackground="#171531", activeforeground=PAPER, relief="flat", bd=0, highlightthickness=0, font=("Segoe UI", 8), width=10)
        status_menu["menu"].configure(bg="#0b0b24", fg=PAPER)
        status_menu.grid(row=0, column=1, padx=(0, 8))
        sort_menu = tk.OptionMenu(filter_bar, self.library_sort, "name", "updated", "status", command=lambda _value: self._apply_library_filters())
        sort_menu.configure(bg="#0b0b24", fg=MUTED, activebackground="#171531", activeforeground=PAPER, relief="flat", bd=0, highlightthickness=0, font=("Segoe UI", 8), width=9)
        sort_menu["menu"].configure(bg="#0b0b24", fg=PAPER)
        sort_menu.grid(row=0, column=2)

        list_shell = tk.Frame(library, bg=INK, highlightbackground=LINE, highlightthickness=1)
        list_shell.grid(row=6, column=0, sticky="nsew")
        list_shell.grid_columnconfigure(0, weight=1)
        list_shell.grid_rowconfigure(0, weight=1)
        self.library_canvas = tk.Canvas(list_shell, bg=INK, highlightthickness=0)
        scrollbar = tk.Scrollbar(list_shell, orient="vertical", command=self.library_canvas.yview)
        self.library_canvas.configure(yscrollcommand=scrollbar.set)
        self.library_canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.library_list = tk.Frame(self.library_canvas, bg=INK)
        self.library_window = self.library_canvas.create_window(0, 0, anchor="nw", window=self.library_list)
        self.library_list.bind("<Configure>", lambda _event: self.library_canvas.configure(scrollregion=self.library_canvas.bbox("all")))
        self.library_canvas.bind("<Configure>", lambda event: self.library_canvas.itemconfigure(self.library_window, width=event.width))
        self.location_form.grid_remove()
        self.label_form.grid_remove()
        self.library_view.grid_remove()

    def _set_library_mode(self, mode: str) -> None:
        valid = {item[0] for item in LIBRARY_MODES}
        self.library_mode = mode if mode in valid else "master"
        for key, button in self.library_mode_buttons.items():
            button.configure(fg=LAVENDER if key == self.library_mode else MUTED)
        self.location_form.grid() if self.library_mode == "locations" else self.location_form.grid_remove()
        self.label_form.grid() if self.library_mode == "labels" else self.label_form.grid_remove()
        headings = {
            "master": "ONE ARTIST. ONE AQUARIUM. MANY DOORWAYS.", "locations": "BUILD A WORLD ATLAS OF INDEPENDENT MUSIC.",
            "labels": "LABEL ROSTERS BECOME DOORWAYS, NOT COPIES.", "styles": "SEVEN WATERS. ONE CANONICAL LIBRARY.",
            "daily": "TODAY'S DISCOVERIES STRENGTHEN THE MASTER LIBRARY.", "published": "EVERY LIVE AQUARIUM AND COLLECTION.",
            "themes": "VISUAL WORLDS REMAIN INDEPENDENT OF GENRE.",
        }
        self.library_heading.configure(text=headings[self.library_mode])
        self._start_load_library()

    def _show_creator(self) -> None:
        self.library_view.grid_remove()
        self.creator_content.grid()
        self.creator_chooser.grid()
        self.creator_nav.configure(fg=LAVENDER)
        self.library_nav.configure(fg=MUTED)
        self.artist.focus_set()

    def _show_library(self) -> None:
        self.creator_content.grid_remove()
        self.creator_chooser.grid_remove()
        self.library_view.grid()
        self.creator_nav.configure(fg=MUTED)
        self.library_nav.configure(fg=LAVENDER)
        self._start_load_library()

    def _start_load_library(self) -> None:
        if self._library_busy:
            return
        self._library_busy = True
        self.library_status.configure(text="REFRESHING LIBRARY…", fg=LAVENDER)
        threading.Thread(target=self._load_library, daemon=True).start()

    def _load_library(self) -> None:
        try:
            artists = self._remote_json("github-pages/artists-index.json").get("artists", [])
            aquariums = self._remote_json("github-pages/aquariums.json").get("aquariums", [])
            collections = self._remote_json("github-pages/collections/index.json").get("collections", [])
            aquarium_by_slug = {entry.get("slug"): entry for entry in aquariums}
            mode = self.library_mode
            if mode == "master":
                entries = [{**artist, **{key: value for key, value in aquarium_by_slug.get(artist.get("aquariumSlug"), {}).items() if key not in {"id", "status"}}, "artistStatus": artist.get("status", "published"), "status": aquarium_by_slug.get(artist.get("aquariumSlug"), {}).get("status", artist.get("status", "published"))} for artist in artists]
            elif mode == "locations":
                entries = [entry for entry in collections if entry.get("type") == "location"]
            elif mode == "labels":
                entries = [entry for entry in collections if entry.get("type") == "label"]
            elif mode == "styles":
                entries = [entry for entry in collections if entry.get("type") in {"genre", "style"}]
                if not entries:
                    entries = [{"name": water.upper(), "slug": "style-" + water, "type": "genre", "status": "published", "memberCount": sum(water in (artist.get("waters") or []) for artist in artists), "url": PAGES_BASE + "/collections/style-" + water + "/"} for water in ("heavy", "dreamy", "quiet", "electronic", "dark", "loud", "strange")]
            elif mode == "daily":
                entries = [entry for entry in aquariums if entry.get("dailyBatchId")]
            elif mode == "published":
                entries = [entry for entry in aquariums if entry.get("status", "published") == "published"]
            else:
                entries = [{**theme, "name": theme["label"], "status": "available", "memberCount": sum(entry.get("visualStyle") == theme["id"] for entry in aquariums)} for theme in THEMES]
            self.after(0, lambda: self._render_library(entries))
        except Exception as error:
            self.after(0, lambda message=str(error): self._library_error(message))

    def _remote_json(self, source: str) -> dict:
        """Read public catalogue data directly, with the GitHub CLI as a fallback."""
        url = RAW_CATALOGUE_BASE + "/" + urllib.parse.quote(source, safe="/")
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "Cosmic-Aquaria-Library/1.0"},
        )
        direct_error: Exception | None = None
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return decode_json_object(response.read(), source)
        except (OSError, urllib.error.URLError, RuntimeError) as error:
            direct_error = error

        gh = shutil.which("gh")
        if gh:
            try:
                process = subprocess.run(
                    [gh, "api", "-H", "Accept: application/vnd.github.raw+json", f"repos/{REPOSITORY}/contents/{source}"],
                    check=True,
                    capture_output=True,
                    text=True,
                    creationflags=self._creation_flags(),
                )
                return decode_json_object(process.stdout, source)
            except (OSError, subprocess.SubprocessError, RuntimeError):
                pass

        raise RuntimeError(
            f"The Cosmic Aquaria catalogue could not be reached for {source}. "
            "Please check your internet connection and refresh the library."
        ) from direct_error

    def _render_library(self, entries: list[dict]) -> None:
        self._library_busy = False
        self._library_entries = list(entries)
        self._apply_library_filters()

    def _apply_library_filters(self) -> None:
        if not hasattr(self, "library_list"):
            return
        query = self.library_search.get().strip().casefold() if hasattr(self, "library_search") else ""
        status_filter = self.library_filter.get() if hasattr(self, "library_filter") else "all"
        entries = [entry for entry in self._library_entries if (not query or query in json.dumps(entry, ensure_ascii=False).casefold()) and (status_filter == "all" or str(entry.get("status", "published")) == status_filter)]
        sort_mode = self.library_sort.get() if hasattr(self, "library_sort") else "name"
        if sort_mode == "updated":
            entries.sort(key=lambda entry: str(entry.get("updatedAt") or entry.get("lastUpdated") or entry.get("releaseDate") or ""), reverse=True)
        elif sort_mode == "status":
            entries.sort(key=lambda entry: (str(entry.get("status", "")), self._entry_name(entry).casefold()))
        else:
            entries.sort(key=lambda entry: self._entry_name(entry).casefold())
        for child in self.library_list.winfo_children():
            child.destroy()
        if not entries:
            empty = tk.Frame(self.library_list, bg=INK, padx=34, pady=64)
            empty.pack(fill="both", expand=True)
            tk.Label(empty, text="NO MATCHING RESULTS", bg=INK, fg=PAPER, font=("Georgia", 23)).pack()
            tk.Label(empty, text="Adjust the search or create a new collection.", bg=INK, fg=MUTED, font=("Segoe UI", 10), pady=12).pack()
            self.library_status.configure(text="0 RESULTS", fg=MUTED)
            return
        published = sum(1 for entry in entries if entry.get("status", "published") == "published")
        noun = {"master": "CANONICAL ARTISTS", "locations": "LOCATIONS", "labels": "LABELS", "styles": "STYLE COLLECTIONS", "daily": "DAILY AQUARIA", "published": "PUBLISHED AQUARIA", "themes": "THEMES"}[self.library_mode]
        self.library_status.configure(text=f"{len(entries)} {noun}" + (f"  ·  {published} PUBLISHED" if self.library_mode != "themes" else ""), fg=MUTED)
        for entry in entries:
            if self.library_mode == "master": self._master_row(entry)
            elif self.library_mode in {"locations", "labels", "styles"}: self._collection_row(entry)
            elif self.library_mode == "themes": self._theme_row(entry)
            else: self._library_row(entry)

    @staticmethod
    def _entry_name(entry: dict) -> str:
        return str(entry.get("name") or entry.get("artist") or entry.get("label") or entry.get("slug") or "")

    def _master_row(self, entry: dict) -> None:
        row = tk.Frame(self.library_list, bg="#0b0b24", padx=18, pady=12)
        row.pack(fill="x", padx=1, pady=(1, 0)); row.grid_columnconfigure(0, weight=1)
        name = str(entry.get("name") or entry.get("artist") or "Untitled artist")
        release = str(entry.get("release") or "Bandcamp")
        location = str(entry.get("primaryLocation") or entry.get("location") or "LOCATION UNVERIFIED")
        styles = ", ".join(str(value).upper() for value in (entry.get("waters") or [])) or "STYLE REVIEW"
        labels = ", ".join(str(value) for value in (entry.get("labels") or [])) or "NO LABEL MEMBERSHIP"
        updated = release_date_label(entry.get("lastUpdated") or entry.get("releaseDate"))
        tk.Label(row, text=name.upper(), bg="#0b0b24", fg=PAPER, font=("Segoe UI Semibold", 10), anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(row, text=f"{location}   ·   {styles}", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=1, column=0, sticky="w", pady=(3, 0))
        tk.Label(row, text=f"{release}   ·   {labels}   ·   {updated}", bg="#0b0b24", fg="#746f87", font=("Segoe UI", 8), anchor="w").grid(row=2, column=0, sticky="w", pady=(3, 0))
        actions = tk.Frame(row, bg="#0b0b24"); actions.grid(row=0, column=1, rowspan=3)
        for label, command in (
            ("OPEN ARTIST", lambda item=entry: webbrowser.open(str(item.get("aquariumUrl") or item.get("url") or ""))),
            ("BANDCAMP", lambda item=entry: webbrowser.open(str(item.get("bandcampArtistUrl") or item.get("bandcampUrl") or ""))),
            ("EDIT", lambda item=entry: webbrowser.open(f"https://github.com/{REPOSITORY}/blob/main/github-pages/artists/{item.get('aquariumSlug') or item.get('slug')}.json")),
            ("REBUILD", lambda item=entry: self._prepare_rebuild(item)),
        ):
            tk.Button(actions, text=label, command=command, bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 7), padx=7, cursor="hand2").pack(side="left")
        published = entry.get("status", "published") == "published"
        tk.Button(row, text="ON" if published else "OFF", command=lambda item=entry: self._start_toggle(item), bg=LAVENDER if published else "#26243b", fg="#09091e" if published else MUTED, activebackground="#ded4ff", relief="flat", bd=0, font=("Segoe UI Semibold", 8), width=7, pady=7, cursor="hand2").grid(row=0, column=2, rowspan=3, padx=(8, 0))

    def _prepare_rebuild(self, entry: dict) -> None:
        self.artist.delete(0, "end"); self.artist.insert(0, str(entry.get("name") or entry.get("artist") or ""))
        self.bandcamp.delete(0, "end"); self.bandcamp.insert(0, str(entry.get("bandcampArtistUrl") or entry.get("bandcampUrl") or ""))
        style = str(entry.get("visualStyle") or "cosmic")
        self._select_style(style if style in self.theme_canvases else "cosmic", announce=False)
        self._show_creator(); self.status.configure(text="READY TO REBUILD THE CANONICAL ARTIST AQUARIUM", fg=LAVENDER)

    def _collection_row(self, entry: dict) -> None:
        row = tk.Frame(self.library_list, bg="#0b0b24", padx=20, pady=14)
        row.pack(fill="x", padx=1, pady=(1, 0)); row.grid_columnconfigure(0, weight=1)
        name = str(entry.get("name") or entry.get("slug") or "Untitled collection")
        count = int(entry.get("memberCount") or 0)
        kind = "STYLE" if entry.get("type") in {"genre", "style"} else str(entry.get("type") or "collection").upper()
        tk.Label(row, text=name.upper(), bg="#0b0b24", fg=PAPER, font=("Segoe UI Semibold", 10), anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(row, text=f"{count} CANONICAL ARTIST" + ("" if count == 1 else "S") + f"  ·  {kind} DOORWAY  ·  NO DUPLICATE ARTIST AQUARIA", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=1, column=0, sticky="w", pady=(4, 0))
        actions = tk.Frame(row, bg="#0b0b24"); actions.grid(row=0, column=1, rowspan=2)
        url = str(entry.get("url") or f"{PAGES_BASE}/collections/{entry.get('slug')}/")
        json_url = f"{PAGES_BASE}/collections/{entry.get('slug')}.json"
        tk.Button(actions, text="OPEN", command=lambda: webbrowser.open(url), bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 7), padx=8, cursor="hand2").pack(side="left")
        tk.Button(actions, text="VIEW ARTISTS", command=lambda: webbrowser.open(json_url), bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 7), padx=8, cursor="hand2").pack(side="left")
        if entry.get("type") == "location":
            tk.Button(actions, text="REFRESH RESEARCH", command=lambda item=entry: self._refresh_location(item), bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 7), padx=8, cursor="hand2").pack(side="left")
        published = entry.get("status") == "published"
        if entry.get("type") in {"genre", "style"}:
            tk.Label(row, text="LIVE", bg="#161330", fg=LAVENDER, font=("Segoe UI Semibold", 8), width=7, pady=8).grid(row=0, column=2, rowspan=2, padx=(8, 0))
        else:
            tk.Button(row, text="ON" if published else "OFF", command=lambda item=entry: self._start_location_toggle(item), bg=LAVENDER if published else "#26243b", fg="#09091e" if published else MUTED, activebackground="#ded4ff", relief="flat", bd=0, font=("Segoe UI Semibold", 8), width=7, pady=7, cursor="hand2").grid(row=0, column=2, rowspan=2, padx=(8, 0))

    def _refresh_location(self, entry: dict) -> None:
        self.location_entry.delete(0, "end"); self.location_entry.insert(0, str(entry.get("name") or ""))
        self._start_create_location()

    def _theme_row(self, entry: dict) -> None:
        row = tk.Frame(self.library_list, bg="#0b0b24", padx=20, pady=15)
        row.pack(fill="x", padx=1, pady=(1, 0)); row.grid_columnconfigure(0, weight=1)
        tk.Label(row, text=str(entry.get("name") or "THEME"), bg="#0b0b24", fg=PAPER, font=("Segoe UI Semibold", 10), anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(row, text=f"{int(entry.get('memberCount') or 0)} ARTIST AQUARIA  ·  CREATIVE CHOICE, NEVER GENRE-ASSIGNED", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=1, column=0, sticky="w", pady=(4, 0))
        tk.Button(row, text="USE THEME", command=lambda item=entry: (self._select_style(str(item.get("id")), announce=False), self._show_creator()), bg="#0b0b24", fg=LAVENDER, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, cursor="hand2").grid(row=0, column=1, rowspan=2)

    def _location_row(self, entry: dict) -> None:
        row = tk.Frame(self.library_list, bg="#0b0b24", padx=20, pady=14)
        row.pack(fill="x", padx=1, pady=(1, 0)); row.grid_columnconfigure(0, weight=1)
        name = str(entry.get("name") or entry.get("slug") or "Untitled location")
        count = int(entry.get("memberCount") or 0)
        tk.Label(row, text=name.upper(), bg="#0b0b24", fg=PAPER, font=("Segoe UI Semibold", 10), anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(row, text=f"{count} CANONICAL ARTIST" + ("" if count == 1 else "S") + "  ·  SEPARATE LOCATION LIBRARY", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=1, column=0, sticky="w", pady=(4, 0))
        url = str(entry.get("url") or "")
        tk.Button(row, text="OPEN", command=lambda: webbrowser.open(url), bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, cursor="hand2").grid(row=0, column=1, rowspan=2)
        published = entry.get("status") == "published"
        tk.Button(row, text="ON" if published else "OFF", command=lambda item=entry: self._start_location_toggle(item), bg=LAVENDER if published else "#26243b", fg="#09091e" if published else MUTED, activebackground="#ded4ff", relief="flat", bd=0, font=("Segoe UI Semibold", 8), width=7, pady=7, cursor="hand2").grid(row=0, column=2, rowspan=2, padx=(8, 0))

    def _start_create_location(self) -> None:
        if self._library_busy:
            return
        location = self.location_entry.get().strip()
        if "," not in location:
            messagebox.showerror("Location Library", "Use a specific place such as Portland, Oregon.")
            return
        try:
            maximum = max(1, min(100, int(self.location_max.get())))
        except ValueError:
            maximum = 25
        self._library_busy = True
        self.library_status.configure(text=f"RESEARCHING {location.upper()}…", fg=LAVENDER)
        threading.Thread(target=self._run_create_location, args=(location, maximum), daemon=True).start()

    def _run_create_location(self, location: str, maximum: int) -> None:
        try:
            gh = self._github_cli(); started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([gh, "workflow", "run", LOCATION_WORKFLOW, "--repo", REPOSITORY, "-f", f"location={location}", "-f", f"max_artists={maximum}", "-f", "build_missing=true"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            run_id = self._find_run(gh, started, REPOSITORY, LOCATION_WORKFLOW)
            if self._watch_run(gh, run_id, REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "The location research could not be completed."))
            self._load_library()
        except Exception as error:
            self.after(0, lambda message=str(error): self._library_error(message))

    def _start_create_label(self) -> None:
        if self._library_busy:
            return
        name = self.label_name_entry.get().strip()
        url = self.label_url_entry.get().strip()
        if not name:
            messagebox.showerror("Label Library", "Enter the label name.")
            return
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError
        except ValueError:
            messagebox.showerror("Label Library", "Enter the public HTTPS label or roster URL.")
            return
        self._library_busy = True
        self.library_status.configure(text=f"RESEARCHING {name.upper()}…", fg=LAVENDER)
        threading.Thread(target=self._run_create_label, args=(name, url), daemon=True).start()

    def _run_create_label(self, name: str, url: str) -> None:
        try:
            gh = self._github_cli(); started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([gh, "workflow", "run", LABEL_WORKFLOW, "--repo", REPOSITORY, "-f", f"label_name={name}", "-f", f"website={url}", "-f", f"roster_url={url}", "-f", "max_artists=100", "-f", "build_missing=true"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            run_id = self._find_run(gh, started, REPOSITORY, LABEL_WORKFLOW)
            if self._watch_run(gh, run_id, REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "The label research could not be completed."))
            self._load_library()
        except Exception as error:
            self.after(0, lambda message=str(error): self._library_error(message))

    def _start_location_toggle(self, entry: dict) -> None:
        if self._library_busy:
            return
        next_status = "disabled" if entry.get("status") == "published" else "published"
        self._library_busy = True
        threading.Thread(target=self._run_location_toggle, args=(entry, next_status), daemon=True).start()

    def _run_location_toggle(self, entry: dict, status: str) -> None:
        try:
            gh = self._github_cli(); started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([gh, "workflow", "run", LOCATION_STATUS_WORKFLOW, "--repo", REPOSITORY, "-f", f"slug={entry['slug']}", "-f", f"status={status}"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            run_id = self._find_run(gh, started, REPOSITORY, LOCATION_STATUS_WORKFLOW)
            if self._watch_run(gh, run_id, REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "The location publish setting could not be changed."))
            self._load_library()
        except Exception as error:
            self.after(0, lambda message=str(error): self._library_error(message))

    def _library_row(self, entry: dict) -> None:
        row = tk.Frame(self.library_list, bg="#0b0b24", padx=20, pady=14)
        row.pack(fill="x", padx=1, pady=(1, 0))
        row.grid_columnconfigure(0, weight=1)
        title = str(entry.get("artist") or entry.get("slug") or "Untitled")
        release = str(entry.get("release") or "Bandcamp")
        flower_min = int(entry.get("flowerCountMin") or entry.get("flowerCount") or 10)
        flower_max = int(entry.get("flowerCountMax") or entry.get("flowerCount") or flower_min)
        track_count = int(entry.get("trackCount") or 0)
        date_label = release_date_label(entry.get("releaseDate"))
        object_name = str(entry.get("objectType") or "FLOWERS").upper()
        flower_label = (
            f"{flower_min}\N{EN DASH}{flower_max} {object_name}"
            if flower_min != flower_max
            else f"{flower_min} {object_name.rstrip('S') if flower_min == 1 else object_name}"
        )
        song_label = f"{track_count} SONG" + ("" if track_count == 1 else "S")
        tk.Label(row, text=title.upper(), bg="#0b0b24", fg=PAPER, font=("Segoe UI Semibold", 10), anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(row, text=release, bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=1, column=0, sticky="w", pady=(4, 0))
        tk.Label(row, text=f"{date_label}   ·   {flower_label}   ·   {song_label}", bg="#0b0b24", fg=MUTED, font=("Segoe UI", 8), anchor="w").grid(row=2, column=0, sticky="w", pady=(3, 0))
        url = str(entry.get("url") or "")
        tk.Button(row, text="OPEN", command=lambda: webbrowser.open(url), bg="#0b0b24", fg=MUTED, activebackground="#0b0b24", activeforeground=PAPER, relief="flat", bd=0, font=("Segoe UI Semibold", 8), padx=18, cursor="hand2").grid(row=0, column=1, rowspan=3)
        published = entry.get("status", "published") == "published"
        toggle = tk.Button(
            row, text="ON" if published else "OFF",
            command=lambda item=entry: self._start_toggle(item),
            bg="#c7b8f4" if published else "#26243b", fg="#09091e" if published else MUTED,
            activebackground="#ded4ff", activeforeground="#09091e", relief="flat", bd=0,
            font=("Segoe UI Semibold", 8), width=7, pady=7, cursor="hand2",
        )
        toggle.grid(row=0, column=2, rowspan=3, padx=(8, 0))

    def _start_toggle(self, entry: dict) -> None:
        if self._library_busy:
            return
        self._library_busy = True
        published = entry.get("status", "published") == "published"
        next_published = not published
        self.library_status.configure(text=("PUBLISHING " if next_published else "UNPUBLISHING ") + str(entry.get("artist", "AQUARIUM")).upper() + "…", fg=LAVENDER)
        threading.Thread(target=self._run_toggle, args=(entry, next_published), daemon=True).start()

    def _run_toggle(self, entry: dict, published: bool) -> None:
        try:
            gh = self._github_cli()
            started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([
                gh, "workflow", "run", STATUS_WORKFLOW, "--repo", REPOSITORY,
                "-f", f"slug={entry['slug']}", "-f", f"published={'true' if published else 'false'}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            run_id = self._find_run(gh, started, REPOSITORY, STATUS_WORKFLOW)
            if self._watch_run(gh, run_id, REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "The publish setting could not be changed."))
            sync_started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([
                gh, "workflow", "run", DELIVERY_WORKFLOW, "--repo", DELIVERY_REPOSITORY,
                "-f", "operation=sync_catalogue",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            sync_id = self._find_run(gh, sync_started, DELIVERY_REPOSITORY, DELIVERY_WORKFLOW)
            if self._watch_run(gh, sync_id, DELIVERY_REPOSITORY) != "success":
                raise RuntimeError(self._workflow_failure(gh, sync_id, DELIVERY_REPOSITORY, "The page changed, but the discovery service has not caught up yet."))
            self._load_library()
        except Exception as error:
            self.after(0, lambda message=str(error): self._library_error(message))

    def _library_error(self, message: str) -> None:
        self._library_busy = False
        self.library_status.configure(text="LIBRARY UPDATE PAUSED", fg="#e995a5")
        messagebox.showerror("Cosmic Aquaria Library", message)

    def _github_cli(self) -> str:
        gh = shutil.which("gh")
        if not gh:
            raise RuntimeError("GitHub is not connected on this computer yet.")
        subprocess.run([gh, "auth", "status"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
        return gh

    def _field(self, parent: tk.Widget, row: int, label: str, placeholder: str) -> tk.Entry:
        frame = tk.Frame(parent, bg=INK)
        frame.grid(row=row, column=0, sticky="ew", pady=(23 if row == 3 else 17, 0))
        frame.grid_columnconfigure(0, weight=1)
        tk.Label(frame, text=label, bg=INK, fg="#77718d", font=("Segoe UI Semibold", 8)).grid(row=0, column=0, sticky="w")
        entry = tk.Entry(frame, bg=INK, fg=PAPER, insertbackground=LAVENDER, selectbackground="#51477b", relief="flat", bd=0, font=("Segoe UI", 13))
        entry.grid(row=1, column=0, sticky="ew", pady=(8, 7))
        tk.Frame(frame, height=1, bg=LINE).grid(row=2, column=0, sticky="ew")
        entry.placeholder = placeholder  # type: ignore[attr-defined]
        return entry

    def _draw_background(self, event: tk.Event) -> None:
        width, height = max(1, event.width), max(1, event.height)
        self.canvas.coords(self.shell_window, 0, 0)
        self.canvas.itemconfigure(self.shell_window, width=width, height=height)
        self.canvas.delete("star")
        import random
        rng = random.Random(47)
        for _ in range(max(34, width * height // 22000)):
            x, y = rng.randrange(width), rng.randrange(height)
            shade = rng.choice(("#555178", "#3f557d", "#6d466f", "#8580a7"))
            self.canvas.create_oval(x, y, x + 1.5, y + 1.5, fill=shade, outline="", tags="star")
        self.canvas.tag_lower("star")

    def _draw_theme_thumbnail(self, canvas: tk.Canvas, theme: dict[str, str]) -> None:
        width, height = 164, 112
        preview = Image.new("RGB", (width, height), theme["bg"])
        draw = ImageDraw.Draw(preview, "RGBA")
        style = theme["id"]
        if style == "paper":
            for x, y, w, h in ((8, 17, 44, 29), (108, 9, 49, 35), (102, 76, 57, 25), (3, 87, 39, 19)):
                draw.rectangle((x, y, x + w, y + h), fill=(218, 201, 170, 22), outline=(222, 208, 179, 30))
        elif style == "neon":
            for x in range(10, width, 18): draw.line((x, 0, x, height), fill=(24, 209, 255, 28))
            for y in range(8, height, 19): draw.line((0, y, width, y), fill=(255, 31, 204, 24))
        elif style == "desert":
            draw.polygon(((0, 89), (35, 67), (65, 82), (96, 57), (132, 83), (164, 70), (164, 112), (0, 112)), fill=(54, 31, 23, 115))
        else:
            for x, y in ((17, 21), (139, 18), (41, 92), (122, 78), (78, 13), (151, 99)):
                color = theme["accent"]
                draw.ellipse((x, y, x + 2, y + 2), fill=color)

        source = resource_path("assets/" + theme["asset"])
        if not source.exists():
            source = resource_path("public/" + theme["asset"])
        flower = Image.open(source).convert("RGBA")
        if style == "paper":
            flower = ImageEnhance.Color(flower).enhance(.12)
            flower = ImageEnhance.Contrast(flower).enhance(.85)
        elif style == "violet":
            flower = ImageEnhance.Color(flower).enhance(1.5)
        elif style == "neon":
            flower = ImageEnhance.Color(flower).enhance(1.9)
            flower = ImageEnhance.Contrast(flower).enhance(1.15)
        elif style == "desert":
            flower = ImageEnhance.Color(flower).enhance(.82)

        target_height = 88 if style == "chrome" else 108 if style == "glass" else 118
        ratio = target_height / flower.height
        flower = flower.resize((max(1, int(flower.width * ratio)), target_height), Image.Resampling.LANCZOS)
        layer = Image.new("RGBA", preview.size, (0, 0, 0, 0))
        x = int(width * .54 - flower.width / 2)
        y = 10 if style == "chrome" else 0 if style == "glass" else -2
        if style in {"crimson", "thorn"}:
            black_layer = Image.new("RGB", preview.size, (0, 0, 0))
            black_layer.paste(flower.convert("RGB"), (x, y))
            preview = ImageChops.screen(preview, black_layer)
        else:
            layer.alpha_composite(flower, (x, y))
            preview = Image.alpha_composite(preview.convert("RGBA"), layer).convert("RGB")

        photo = ImageTk.PhotoImage(preview)
        self.theme_images.append(photo)
        canvas.create_image(82, 56, image=photo)
        canvas.create_rectangle(1, 1, 163, 111, fill="", outline=LINE, width=1, tags="selection")
        canvas.create_text(4, 130, text=theme["label"], anchor="w", fill=PAPER, font=("Segoe UI Semibold", 8), tags="label")

    def _select_style(self, style: str, announce: bool = True) -> None:
        self.visual_style = style
        for theme_id, canvas in self.theme_canvases.items():
            selected = theme_id == style
            canvas.itemconfigure("selection", outline=LAVENDER if selected else LINE, width=2 if selected else 1)
            canvas.itemconfigure("label", fill=LAVENDER if selected else PAPER)
        if announce and hasattr(self, "status"):
            label = next(theme["label"] for theme in THEMES if theme["id"] == style)
            self.status.configure(text=label + " SELECTED", fg=LAVENDER)

    def _start_create(self) -> None:
        if self._busy:
            return
        title = self.artist.get().strip()
        bandcamp_url = self.bandcamp.get().strip()
        recipient = self.recipient.get().strip()
        visual_style = self.visual_style
        if not title:
            messagebox.showerror("Artist needed", "Enter the band or artist name.")
            return
        if not valid_bandcamp(bandcamp_url):
            messagebox.showerror("Bandcamp URL needed", "Enter an official HTTPS Bandcamp URL.")
            return
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", recipient):
            messagebox.showerror("Email needed", "Enter a valid delivery email.")
            return
        self._busy = True
        self.create_button.configure(state="disabled", text="CREATING…")
        self.status.configure(text="OPENING THE AQUARIUM", fg=LAVENDER)
        self.result_row.grid_remove()
        started = dt.datetime.now(dt.timezone.utc)
        threading.Thread(target=self._run_create, args=(title, bandcamp_url, recipient, visual_style, started), daemon=True).start()

    def _run_create(self, title: str, bandcamp_url: str, recipient: str, visual_style: str, started: dt.datetime) -> None:
        try:
            gh = self._github_cli()
            cache_key = started.strftime("%Y%m%d%H%M%S")
            subprocess.run([
                gh, "workflow", "run", WORKFLOW, "--repo", REPOSITORY,
                "-f", f"artist_title={title}", "-f", f"bandcamp_url={bandcamp_url}", "-f", f"visual_style={visual_style}", "-f", f"cache_key={cache_key}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            self.after(0, lambda: self.status.configure(text="GROWING FLOWERS  ·  BUILDING QR", fg=LAVENDER))
            run_id = self._find_run(gh, started, REPOSITORY, WORKFLOW)
            conclusion = self._watch_run(gh, run_id, REPOSITORY)
            if conclusion != "success":
                raise RuntimeError(self._workflow_failure(gh, run_id, REPOSITORY, "GitHub could not create this aquarium."))
            base_url = PAGES_BASE.rstrip("/") + "/" + slugify(title) + "/"
            url = base_url + "?edition=" + cache_key
            qr_url = base_url + "cosmic-aquarium-qr.png?edition=" + cache_key
            self.after(0, lambda: self.status.configure(text="PUBLISHED  ·  UPDATING LIBRARY", fg=LAVENDER))
            library_current = True
            try:
                sync_started = dt.datetime.now(dt.timezone.utc)
                subprocess.run([
                    gh, "workflow", "run", DELIVERY_WORKFLOW, "--repo", DELIVERY_REPOSITORY,
                    "-f", "operation=sync_catalogue",
                ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
                sync_run_id = self._find_run(gh, sync_started, DELIVERY_REPOSITORY, DELIVERY_WORKFLOW)
                library_current = self._watch_run(gh, sync_run_id, DELIVERY_REPOSITORY) == "success"
            except (OSError, subprocess.SubprocessError, RuntimeError):
                library_current = False
            self.after(0, lambda: self.status.configure(text="PUBLISHED  ·  SENDING EMAIL", fg=LAVENDER))
            delivery_started = dt.datetime.now(dt.timezone.utc)
            subprocess.run([
                gh, "workflow", "run", DELIVERY_WORKFLOW, "--repo", DELIVERY_REPOSITORY,
                "-f", "operation=deliver_artist",
                "-f", f"artist_title={title}", "-f", f"page_url={url}", "-f", f"qr_url={qr_url}", "-f", f"recipient_email={recipient}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            delivery_run_id = self._find_run(gh, delivery_started, DELIVERY_REPOSITORY, DELIVERY_WORKFLOW)
            delivery_conclusion = self._watch_run(gh, delivery_run_id, DELIVERY_REPOSITORY)
            if delivery_conclusion != "success":
                raise RuntimeError(self._workflow_failure(gh, delivery_run_id, DELIVERY_REPOSITORY, "The page was published, but email delivery paused."))
            self.after(0, lambda: self._finish_success(url, library_current))
        except Exception as error:
            self.after(0, lambda message=str(error): self._finish_error(message))

    def _find_run(self, gh: str, started: dt.datetime, repository: str, workflow: str) -> int:
        for _ in range(24):
            data = self._runs(gh, repository, workflow)
            for item in data:
                created = dt.datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00"))
                if created >= started - dt.timedelta(seconds=5):
                    return int(item["databaseId"])
            time.sleep(2.5)
        raise RuntimeError("GitHub accepted the request but the workflow run could not be located.")

    def _watch_run(self, gh: str, run_id: int, repository: str) -> str:
        for _ in range(240):
            process = subprocess.run([
                gh, "run", "view", str(run_id), "--repo", repository, "--json", "status,conclusion"
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            data = json.loads(process.stdout)
            if data.get("status") == "completed":
                return str(data.get("conclusion") or "unknown")
            time.sleep(5)
        raise RuntimeError("The creation is still running. Open GitHub Actions to continue watching it.")

    def _runs(self, gh: str, repository: str, workflow: str) -> list[dict]:
        process = subprocess.run([
            gh, "run", "list", "--repo", repository, "--workflow", workflow,
            "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,createdAt,status,conclusion"
        ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
        return json.loads(process.stdout)

    def _workflow_failure(self, gh: str, run_id: int, repository: str, heading: str) -> str:
        view = subprocess.run([gh, "run", "view", str(run_id), "--repo", repository, "--json", "url"], capture_output=True, text=True, creationflags=self._creation_flags())
        log = subprocess.run([gh, "run", "view", str(run_id), "--repo", repository, "--log-failed"], capture_output=True, text=True, creationflags=self._creation_flags())
        url = ""
        try:
            url = json.loads(view.stdout).get("url", "")
        except json.JSONDecodeError:
            pass
        errors = [line.split("##[error]", 1)[-1].strip() for line in log.stdout.splitlines() if "##[error]" in line]
        track_rule = next((line.strip() for line in log.stdout.splitlines() if "requires at least 3 publicly available Bandcamp songs" in line), "")
        detail = track_rule or (errors[-1] if errors else "Open the GitHub run for the detailed reason.")
        return heading + "\n\n" + detail + ("\n\n" + url if url else "")

    @staticmethod
    def _creation_flags() -> int:
        return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    def _finish_success(self, url: str, library_current: bool = True) -> None:
        self._busy = False
        self._latest_url = url
        self.create_button.configure(state="normal", text="CREATE ANOTHER  ✦")
        status = "CREATED  ·  LINK + QR EMAILED" if library_current else "CREATED  ·  EMAIL SENT  ·  LIBRARY WILL RETRY"
        self.status.configure(text=status, fg="#cbdba5")
        self.result_row.grid()

    def _finish_error(self, message: str) -> None:
        self._busy = False
        self.create_button.configure(state="normal", text="TRY AGAIN  ✦")
        self.status.configure(text="CREATION PAUSED", fg="#e995a5")
        messagebox.showerror("Cosmic Aquaria", message)

    def _open_result(self) -> None:
        if self._latest_url:
            webbrowser.open(self._latest_url)

    def _copy_result(self) -> None:
        if self._latest_url:
            self.clipboard_clear()
            self.clipboard_append(self._latest_url)
            self.status.configure(text="LINK COPIED", fg=LAVENDER)


if __name__ == "__main__":
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    application = CosmicAquariumStudio()
    if "--smoke-test" in sys.argv:
        application.update_idletasks()
        if application.artist.winfo_exists() != 1 or application.create_button.cget("text") != "CREATE  ✦" or len(application.theme_canvases) != len(THEMES) or application.library_view.winfo_exists() != 1:
            raise RuntimeError("Desktop interface did not initialise correctly")
        application.destroy()
        print("Cosmic Aquaria Studio smoke test passed.")
    else:
        application.mainloop()
