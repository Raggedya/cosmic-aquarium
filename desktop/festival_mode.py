from __future__ import annotations

import concurrent.futures
import datetime as dt
import functools
import json
import os
import re
import shutil
import subprocess
import threading
import urllib.parse
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from PIL import Image, ImageOps, ImageTk


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = SOURCE_ROOT / "scripts"
import sys
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from create_festival_machine import build_festival_config  # noqa: E402
from festival_discovery_service import FestivalArtist, inspect_bandcamp_artist_url, match_bandcamp_artist, validate_bandcamp_artist_url  # noqa: E402
from festival_projects import (  # noqa: E402
    FestivalProjectStore, approved_bandcamp_urls, calculate_reporting, classification, empty_project,
    extract_lineup_from_blocks, festival_request, read_poster, slugify, validate_poster,
)


INK = "#100906"
PANEL = "#1b0f0a"
PANEL_LIGHT = "#28150e"
CREAM = "#f4dfae"
PAPER = "#fff3d3"
MUTED = "#bda885"
BURGUNDY = "#6f1423"
BURGUNDY_LIGHT = "#a73648"
BRASS = "#b98439"
SUCCESS = "#b7d79a"
ERROR = "#e89a9f"
WARN = "#e7bb70"
REPOSITORY = "Raggedya/cosmic-aquarium"
PUBLISH_WORKFLOW = "publish-festival-machine.yml"
PUBLIC_BASE = "https://raggedya.github.io/cosmic-aquarium/festival/"


def run_process(command: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(detail) from error


class FestivalModeFrame(tk.Frame):
    """Integrated Festival Mode surface hosted by the Artist Machine Factory."""

    def __init__(self, parent: tk.Widget, host: object, data_root: Path) -> None:
        super().__init__(parent, bg=INK)
        self.host = host
        self.data_root = data_root / "festival-projects"
        self.store = FestivalProjectStore(self.data_root)
        self.project = empty_project()
        self.lineup: list[dict[str, object]] = []
        self.matches: list[dict[str, object]] = []
        self.poster_path = tk.StringVar()
        self.logo_path = tk.StringVar()
        self.header_path = tk.StringVar()
        self.background_path = tk.StringVar()
        self.current_project_id = ""
        self.dirty = False
        self.busy = False
        self.loading_project = False
        self._poster_photo: ImageTk.PhotoImage | None = None
        self._build_interface()
        self._refresh_project_label()

    def _build_interface(self) -> None:
        body = tk.PanedWindow(self, orient="horizontal", bg=INK, sashwidth=8, sashrelief="flat", bd=0)
        body.pack(fill="both", expand=True, padx=22, pady=(14, 16))
        left_shell = tk.Frame(body, bg=PANEL, highlightbackground="#58331d", highlightthickness=1)
        right_shell = tk.Frame(body, bg=PANEL, highlightbackground="#58331d", highlightthickness=1, width=430)
        body.add(left_shell, stretch="always", minsize=650)
        body.add(right_shell, stretch="never", minsize=390)

        canvas = tk.Canvas(left_shell, bg=PANEL, highlightthickness=0)
        scrollbar = ttk.Scrollbar(left_shell, orient="vertical", command=canvas.yview, style="Factory.Vertical.TScrollbar")
        self.form = tk.Frame(canvas, bg=PANEL)
        window = canvas.create_window((0, 0), window=self.form, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.form.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
        self.form.grid_columnconfigure(0, weight=1)
        self.form.grid_columnconfigure(1, weight=1)

        project_bar = tk.Frame(self.form, bg="#0d0805", padx=14, pady=11)
        project_bar.grid(row=0, column=0, columnspan=2, sticky="ew", padx=24, pady=(22, 14))
        self.project_label = tk.Label(project_bar, text="NEW FESTIVAL", bg="#0d0805", fg=CREAM, font=("Segoe UI Semibold", 9))
        self.project_label.pack(side="left")
        for label, command in (("NEW", self.new_project), ("OPEN", self.open_project), ("SAVE", self.save_project), ("SAVE AS", self.save_as), ("DUPLICATE", self.duplicate_project), ("DELETE", self.delete_project)):
            self._small_button(project_bar, label, command).pack(side="right", padx=(5, 0))

        self._section(1, "1  FESTIVAL DETAILS")
        self.festival_name = self._entry(2, 0, "FESTIVAL NAME")
        self.festival_year = self._entry(2, 1, "FESTIVAL YEAR")
        self.festival_website = self._entry(3, 0, "FESTIVAL WEBSITE URL · OPTIONAL")
        self.festival_location = self._entry(3, 1, "LOCATION · OPTIONAL")
        self.description = self._text(4, "SHORT DESCRIPTION · OPTIONAL", 3)

        self._section(5, "2  POSTER / LINEUP IMAGE")
        poster_shell = tk.Frame(self.form, bg="#0d0805", highlightbackground="#58331d", highlightthickness=1)
        poster_shell.grid(row=6, column=0, columnspan=2, sticky="ew", padx=24, pady=(8, 0))
        poster_shell.grid_columnconfigure(0, weight=1)
        self.poster_preview = tk.Label(poster_shell, text="DROP A FESTIVAL POSTER HERE\nOR BROWSE FOR PNG / JPG / JPEG / WEBP", bg="#0d0805", fg=MUTED, height=10, font=("Segoe UI Semibold", 9))
        self.poster_preview.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
        controls = tk.Frame(poster_shell, bg="#0d0805")
        controls.grid(row=1, column=0, sticky="ew", padx=10, pady=(0, 10))
        self._small_button(controls, "BROWSE FOR FILE", self.choose_poster).pack(side="left")
        self.read_button = self._button(controls, "READ FESTIVAL LINEUP", self.read_lineup)
        self.read_button.pack(side="right")
        self.poster_hint = tk.Label(poster_shell, textvariable=self.poster_path, bg="#0d0805", fg=MUTED, font=("Segoe UI", 8), anchor="w", wraplength=560)
        self.poster_hint.grid(row=2, column=0, sticky="ew", padx=10, pady=(0, 10))
        self._enable_drop(self.poster_preview)

        self._section(7, "3  EXTRACTED LINEUP · REVIEW BEFORE SEARCH")
        lineup_shell = tk.Frame(self.form, bg=PANEL)
        lineup_shell.grid(row=8, column=0, columnspan=2, sticky="ew", padx=24, pady=(8, 0))
        lineup_shell.grid_columnconfigure(0, weight=1)
        self.lineup_tree = ttk.Treeview(lineup_shell, columns=("order", "artist", "confidence"), show="headings", height=9, selectmode="extended", style="Festival.Treeview")
        self.lineup_tree.heading("order", text="#")
        self.lineup_tree.heading("artist", text="ARTIST")
        self.lineup_tree.heading("confidence", text="OCR")
        self.lineup_tree.column("order", width=42, stretch=False, anchor="center")
        self.lineup_tree.column("artist", width=410)
        self.lineup_tree.column("confidence", width=70, stretch=False, anchor="center")
        self.lineup_tree.grid(row=0, column=0, sticky="ew")
        row = tk.Frame(lineup_shell, bg=PANEL)
        row.grid(row=1, column=0, sticky="ew", pady=(7, 0))
        for label, command in (("ADD", self.add_artist), ("EDIT", self.edit_artist), ("DELETE", self.remove_artist), ("MERGE", self.merge_artists), ("↑", lambda: self.move_artist(-1)), ("↓", lambda: self.move_artist(1))):
            self._small_button(row, label, command).pack(side="left", padx=(0, 5))
        self.match_button = self._button(row, "FIND BANDCAMP ARTISTS", self.find_matches)
        self.match_button.pack(side="right")

        self._section(9, "4  FESTIVAL BRANDING")
        self._file_row(10, "FESTIVAL LOGO · OPTIONAL", self.logo_path)
        self._file_row(11, "HEADER IMAGE · OPTIONAL · POSTER USED WHEN BLANK", self.header_path)
        self._file_row(12, "BACKGROUND IMAGE · OPTIONAL", self.background_path)
        self.primary_title = self._entry(13, 0, "PRIMARY TITLE · DEFAULTS TO FESTIVAL + YEAR")
        self.subtitle = self._entry(13, 1, "SUBTITLE · DEFAULTS TO DISCOVERY MACHINE")
        self.website_button = tk.BooleanVar(value=True)
        tk.Checkbutton(self.form, text="SHOW FESTIVAL WEBSITE BUTTON", variable=self.website_button, command=self._mark_dirty, bg=PANEL, fg=CREAM, activebackground=PANEL, activeforeground=PAPER, selectcolor=BURGUNDY, bd=0).grid(row=14, column=0, columnspan=2, sticky="w", padx=24, pady=(10, 24))

        self._build_review(right_shell)

    def _build_review(self, parent: tk.Frame) -> None:
        canvas = tk.Canvas(parent, bg=PANEL, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview, style="Factory.Vertical.TScrollbar")
        inner = tk.Frame(canvas, bg=PANEL)
        window = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True, padx=(20, 0), pady=20)
        scrollbar.pack(side="right", fill="y")
        inner.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
        tk.Label(inner, text="BANDCAMP MATCH REVIEW", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).pack(anchor="w")
        tk.Label(inner, text="Only explicitly approved artists enter the festival library.", bg=PANEL, fg=MUTED, font=("Segoe UI", 8), wraplength=355, justify="left").pack(anchor="w", pady=(4, 10))
        self.match_summary = tk.Label(inner, text="READ A POSTER TO BEGIN", bg=PANEL_LIGHT, fg=PAPER, font=("Georgia", 12, "bold"), wraplength=350, justify="left", padx=12, pady=10)
        self.match_summary.pack(fill="x")
        self.match_tree = ttk.Treeview(inner, columns=("artist", "status", "confidence", "decision"), show="headings", height=13, selectmode="extended", style="Festival.Treeview")
        for key, title, width in (("artist", "ARTIST", 145), ("status", "MATCH", 85), ("confidence", "%", 45), ("decision", "DECISION", 75)):
            self.match_tree.heading(key, text=title)
            self.match_tree.column(key, width=width, stretch=key == "artist")
        self.match_tree.pack(fill="x", pady=(10, 0))
        self.match_tree.bind("<<TreeviewSelect>>", self._show_match_detail)
        self.match_detail = tk.Label(inner, text="Select a result to inspect its URL, location and evidence.", bg="#0d0805", fg=MUTED, wraplength=350, justify="left", anchor="nw", padx=10, pady=9)
        self.match_detail.pack(fill="x", pady=(7, 0))
        actions = tk.Frame(inner, bg=PANEL)
        actions.pack(fill="x", pady=(8, 0))
        for label, command in (("APPROVE", self.approve_selected), ("REJECT", self.reject_selected), ("CHANGE MATCH", self.change_match), ("SEARCH AGAIN", self.search_again)):
            self._small_button(actions, label, command).pack(side="left", padx=(0, 4), pady=(0, 4))
        bulk = tk.Frame(inner, bg=PANEL)
        bulk.pack(fill="x")
        for label, command in (("APPROVE ALL CONFIRMED", self.approve_confirmed), ("REJECT ALL NOT FOUND", self.reject_not_found), ("RECHECK UNRESOLVED", self.recheck_unresolved)):
            self._small_button(bulk, label, command).pack(side="left", padx=(0, 4), pady=(0, 4))
        self.coverage = tk.Label(inner, text="0 ARTISTS DETECTED", bg=PANEL, fg=CREAM, font=("Segoe UI Semibold", 9), wraplength=350, justify="left")
        self.coverage.pack(anchor="w", pady=(12, 0))

        tk.Label(inner, text="MACHINE", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).pack(anchor="w", pady=(22, 0))
        self.build_button = self._button(inner, "BUILD FESTIVAL MACHINE", self.build_machine)
        self.build_button.pack(fill="x", pady=(9, 5))
        self.preview_button = self._button(inner, "OPEN PRIVATE PREVIEW", self.open_preview, secondary=True)
        self.preview_button.pack(fill="x", pady=5)
        self.publish_button = self._button(inner, "APPROVE + PUBLISH", self.publish_machine)
        self.publish_button.pack(fill="x", pady=5)
        self.open_live_button = self._button(inner, "OPEN PUBLISHED FESTIVAL", self.open_live, secondary=True)
        self.open_live_button.pack(fill="x", pady=5)
        self.open_live_button.configure(state="disabled")
        self.machine_status = tk.Label(inner, text="NO FESTIVAL LIBRARY BUILT", bg=PANEL, fg=MUTED, wraplength=350, justify="left", font=("Segoe UI", 8))
        self.machine_status.pack(anchor="w", pady=(8, 0))

    def _section(self, row: int, text: str) -> None:
        tk.Label(self.form, text=text, bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).grid(row=row, column=0, columnspan=2, sticky="w", padx=24, pady=(16, 0))

    def _entry(self, row: int, column: int, label: str) -> tk.Entry:
        shell = tk.Frame(self.form, bg=PANEL)
        shell.grid(row=row, column=column, sticky="ew", padx=(24 if column == 0 else 8, 8 if column == 0 else 24), pady=(9, 0))
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).pack(anchor="w")
        entry = tk.Entry(shell, bg="#0d0805", fg=PAPER, insertbackground=CREAM, selectbackground=BURGUNDY, relief="flat", bd=0, font=("Segoe UI", 10))
        entry.pack(fill="x", pady=(5, 0), ipady=8)
        entry.bind("<KeyRelease>", self._mark_dirty, add="+")
        return entry

    def _text(self, row: int, label: str, height: int) -> tk.Text:
        shell = tk.Frame(self.form, bg=PANEL)
        shell.grid(row=row, column=0, columnspan=2, sticky="ew", padx=24, pady=(9, 0))
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).pack(anchor="w")
        widget = tk.Text(shell, height=height, wrap="word", bg="#0d0805", fg=PAPER, insertbackground=CREAM, selectbackground=BURGUNDY, relief="flat", bd=0, font=("Segoe UI", 10), padx=9, pady=7)
        widget.pack(fill="x", pady=(5, 0))
        widget.bind("<KeyRelease>", self._mark_dirty, add="+")
        return widget

    def _file_row(self, row: int, label: str, variable: tk.StringVar) -> None:
        shell = tk.Frame(self.form, bg=PANEL)
        shell.grid(row=row, column=0, columnspan=2, sticky="ew", padx=24, pady=(9, 0))
        shell.grid_columnconfigure(0, weight=1)
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).grid(row=0, column=0, columnspan=3, sticky="w")
        tk.Entry(shell, textvariable=variable, state="readonly", readonlybackground="#0d0805", fg=PAPER, relief="flat", bd=0).grid(row=1, column=0, sticky="ew", pady=(5, 0), ipady=8)
        self._small_button(shell, "CHOOSE", lambda: self.choose_branding(variable)).grid(row=1, column=1, padx=(6, 0), pady=(5, 0), sticky="ns")
        self._small_button(shell, "CLEAR", lambda: (variable.set(""), self._mark_dirty())).grid(row=1, column=2, padx=(6, 0), pady=(5, 0), sticky="ns")

    @staticmethod
    def _button(parent: tk.Widget, text: str, command: object, secondary: bool = False) -> tk.Button:
        return tk.Button(parent, text=text, command=command, bg="#3b2415" if secondary else BURGUNDY, fg=PAPER, activebackground="#5a351e" if secondary else BURGUNDY_LIGHT, activeforeground=PAPER, disabledforeground="#786b58", relief="flat", bd=0, cursor="hand2", font=("Segoe UI Semibold", 9), padx=12, pady=10)

    @staticmethod
    def _small_button(parent: tk.Widget, text: str, command: object) -> tk.Button:
        return tk.Button(parent, text=text, command=command, bg="#3b2415", fg=CREAM, activebackground="#5a351e", activeforeground=PAPER, relief="flat", bd=0, cursor="hand2", font=("Segoe UI Semibold", 7), padx=8, pady=6)

    def _enable_drop(self, widget: tk.Widget) -> None:
        try:
            from tkinterdnd2 import DND_FILES
            widget.drop_target_register(DND_FILES)  # type: ignore[attr-defined]
            widget.dnd_bind("<<Drop>>", self._poster_dropped)  # type: ignore[attr-defined]
        except Exception:
            pass

    def _poster_dropped(self, event: object) -> None:
        raw = str(getattr(event, "data", "")).strip()
        values = list(self.tk.splitlist(raw)) if raw else []
        if values:
            self.set_poster(values[0])

    def choose_poster(self) -> None:
        selected = filedialog.askopenfilename(parent=self, title="Choose festival poster", filetypes=(("Poster images", "*.png *.jpg *.jpeg *.webp"),))
        if selected:
            self.set_poster(selected)

    def set_poster(self, value: str) -> None:
        try:
            path = validate_poster(Path(value))
        except ValueError as error:
            messagebox.showerror("Festival poster", str(error), parent=self)
            return
        self.poster_path.set(str(path))
        try:
            with Image.open(path) as raw:
                image = ImageOps.exif_transpose(raw).convert("RGB")
                image.thumbnail((570, 270), Image.Resampling.LANCZOS)
                self._poster_photo = ImageTk.PhotoImage(image)
            self.poster_preview.configure(image=self._poster_photo, text="", height=270)
        except OSError:
            self.poster_preview.configure(image="", text="POSTER SELECTED")
        self._mark_dirty()

    def choose_branding(self, variable: tk.StringVar) -> None:
        selected = filedialog.askopenfilename(parent=self, title="Choose festival artwork", filetypes=(("Images", "*.png *.jpg *.jpeg *.webp"),))
        if selected:
            variable.set(str(validate_poster(Path(selected))))
            self._mark_dirty()

    def _mark_dirty(self, _event: object = None) -> None:
        if self.loading_project:
            return
        self.dirty = True
        if isinstance(self.project.get("festivalLibrary"), dict):
            self.project["festivalLibrary"] = None
            self.machine_status.configure(text="PROJECT CHANGED · REBUILD THE FESTIVAL MACHINE BEFORE PREVIEW OR PUBLISH", fg=WARN)
        self._refresh_project_label()

    def _refresh_project_label(self) -> None:
        name = self.current_project_id.upper() if self.current_project_id else "NEW FESTIVAL"
        self.project_label.configure(text=name + ("  ·  UNSAVED" if self.dirty else ""))

    def _set_busy(self, busy: bool, text: str = "") -> None:
        self.busy = busy
        state = "disabled" if busy else "normal"
        for button in (self.read_button, self.match_button, self.build_button, self.preview_button, self.publish_button):
            button.configure(state=state)
        if text:
            self.machine_status.configure(text=text, fg=BRASS if busy else MUTED)

    def _async(self, label: str, operation: object, complete: object) -> None:
        if self.busy:
            return
        self._set_busy(True, label)
        def worker() -> None:
            try:
                result = operation()  # type: ignore[operator]
            except Exception as error:
                self.after(0, lambda message=str(error): self._failed(message))
                return
            self.after(0, lambda: self._completed(complete, result))
        threading.Thread(target=worker, daemon=True).start()

    def _completed(self, complete: object, result: object) -> None:
        self._set_busy(False)
        complete(result)  # type: ignore[operator]

    def _failed(self, message: str) -> None:
        self._set_busy(False)
        self.machine_status.configure(text="FESTIVAL MODE PAUSED SAFELY", fg=ERROR)
        messagebox.showerror("Festival Mode", message, parent=self)

    def read_lineup(self) -> None:
        if not self.poster_path.get():
            messagebox.showerror("Festival poster", "Choose or drop a festival poster first.", parent=self)
            return
        self._async("READING POSTER · IDENTIFYING PERFORMERS…", lambda: self._read_lineup_worker(), self._lineup_ready)

    def _read_lineup_worker(self) -> tuple[list[dict[str, object]], list[str], str]:
        blocks = read_poster(Path(self.poster_path.get()))
        lineup, rejected = extract_lineup_from_blocks(blocks, festival_name=self.festival_name.get(), year=self.festival_year.get(), location=self.festival_location.get())
        if not lineup:
            raise RuntimeError("Text was read, but no likely artist names survived the poster filters. You can add artists manually or try a clearer poster.")
        provider = str(blocks[0].provider) if blocks else "OCR"
        return lineup, rejected, provider

    def _lineup_ready(self, result: tuple[list[dict[str, object]], list[str], str]) -> None:
        self.lineup, rejected, provider = result
        self.matches = []
        self.project["rawExtractedLineup"] = list(self.lineup)
        self.project["rejectedPosterText"] = rejected
        self._render_lineup()
        self._render_matches()
        self.machine_status.configure(text=f"{len(self.lineup)} LIKELY ARTISTS READ WITH {provider} · REVIEW, CORRECT, THEN FIND BANDCAMP", fg=SUCCESS)
        self._mark_dirty()

    def _render_lineup(self) -> None:
        self.lineup_tree.delete(*self.lineup_tree.get_children())
        for index, item in enumerate(self.lineup):
            confidence = item.get("ocrConfidence")
            label = "MANUAL" if item.get("source") == "manual" else f"{float(confidence or 0):.0%}"
            self.lineup_tree.insert("", "end", iid=str(index), values=(index + 1, item.get("artistName"), label))
        self.coverage.configure(text=f"{len(self.lineup)} POSTER ARTISTS · BANDCAMP MATCHING NOT YET COMPLETE")

    def _selected_lineup_indices(self) -> list[int]:
        return sorted((int(value) for value in self.lineup_tree.selection()), reverse=True)

    def add_artist(self) -> None:
        name = simpledialog.askstring("Add artist", "Artist name:", parent=self)
        if name and name.strip():
            self.lineup.append({"artistName": name.strip(), "ocrConfidence": 1, "source": "manual"})
            self._lineup_changed()

    def edit_artist(self) -> None:
        selected = self._selected_lineup_indices()
        if len(selected) != 1:
            messagebox.showinfo("Edit artist", "Select one lineup artist.", parent=self); return
        index = selected[0]
        previous_name = str(self.lineup[index].get("artistName") or "")
        name = simpledialog.askstring("Edit artist", "Correct artist name:", initialvalue=str(self.lineup[index].get("artistName") or ""), parent=self)
        if name and name.strip():
            self.lineup[index].update({"artistName": name.strip(), "source": "edited"})
            self.matches = [item for item in self.matches if item.get("artistName") != previous_name]
            self._lineup_changed()

    def remove_artist(self) -> None:
        for index in self._selected_lineup_indices():
            self.lineup.pop(index)
        self._lineup_changed()

    def merge_artists(self) -> None:
        selected = self._selected_lineup_indices()
        if len(selected) < 2:
            messagebox.showinfo("Merge duplicates", "Select two or more duplicate entries.", parent=self); return
        names = [str(self.lineup[index].get("artistName") or "") for index in reversed(selected)]
        name = simpledialog.askstring("Merge duplicates", "Name for the merged artist:", initialvalue=names[0], parent=self)
        if not name or not name.strip():
            return
        insert_at = min(selected)
        for index in selected:
            self.lineup.pop(index)
        self.lineup.insert(insert_at, {"artistName": name.strip(), "ocrConfidence": 1, "source": "merged"})
        self._lineup_changed()

    def _lineup_changed(self) -> None:
        valid = {str(item.get("artistName") or "") for item in self.lineup}
        self.matches = [item for item in self.matches if str(item.get("artistName") or "") in valid]
        self._render_lineup(); self._render_matches(); self._mark_dirty()

    def move_artist(self, direction: int) -> None:
        selected = self._selected_lineup_indices()
        if len(selected) != 1:
            return
        index = selected[0]; target = index + direction
        if 0 <= target < len(self.lineup):
            self.lineup[index], self.lineup[target] = self.lineup[target], self.lineup[index]
            self._render_lineup(); self.lineup_tree.selection_set(str(target)); self._mark_dirty()

    def find_matches(self) -> None:
        if not self.lineup:
            messagebox.showerror("Festival lineup", "Read a poster or add lineup artists first.", parent=self); return
        self._async(f"CHECKING BANDCAMP FOR {len(self.lineup)} ARTISTS…", self._match_worker, self._matches_ready)

    def _match_worker(self, only_names: set[str] | None = None) -> list[dict[str, object]]:
        items = [item for item in self.lineup if only_names is None or str(item.get("artistName")) in only_names]
        results: list[dict[str, object] | None] = [None] * len(items)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="festival-match") as executor:
            futures = {executor.submit(match_bandcamp_artist, FestivalArtist(str(item.get("artistName") or ""))): index for index, item in enumerate(items)}
            for future in concurrent.futures.as_completed(futures):
                index = futures[future]
                match = future.result()
                results[index] = {
                    "artistName": match.artist_name, "bandcampUrl": match.bandcamp_url or "", "rawStatus": match.match_status,
                    "status": classification(match.match_status, match.confidence, match.bandcamp_url), "confidence": match.confidence,
                    "location": match.location or "", "preview": match.preview or "", "evidence": list(match.evidence),
                    "candidates": list(match.candidates), "decision": "pending", "matchMethod": "automatic",
                }
        return [item for item in results if item is not None]

    def _matches_ready(self, matches: list[dict[str, object]]) -> None:
        self.matches = matches
        self._render_matches(); self._mark_dirty()
        self.machine_status.configure(text="BANDCAMP CHECK COMPLETE · REVIEW EVERY LIKELY OR AMBIGUOUS RESULT", fg=SUCCESS)

    def _render_matches(self) -> None:
        self.match_tree.delete(*self.match_tree.get_children())
        for index, item in enumerate(self.matches):
            self.match_tree.insert("", "end", iid=str(index), values=(item.get("artistName"), item.get("status"), f"{float(item.get('confidence') or 0):.0%}", str(item.get("decision") or "pending").upper()))
        counts = {status: sum(item.get("status") == status for item in self.matches) for status in ("CONFIRMED", "LIKELY", "AMBIGUOUS", "NOT FOUND")}
        self.match_summary.configure(text=f"{len(self.lineup)} ARTISTS DETECTED\n{counts['CONFIRMED']} CONFIRMED · {counts['LIKELY']} LIKELY\n{counts['AMBIGUOUS']} AMBIGUOUS · {counts['NOT FOUND']} NOT FOUND")
        self._update_coverage()

    def _show_match_detail(self, _event: object = None) -> None:
        selected = self.match_tree.selection()
        if not selected:
            return
        item = self.matches[int(selected[0])]
        alternatives = item.get("candidates") or []
        detail = [str(item.get("artistName") or ""), str(item.get("bandcampUrl") or "NO BANDCAMP URL"), f"STATUS: {item.get('status')} · CONFIDENCE: {float(item.get('confidence') or 0):.0%}"]
        if item.get("location"): detail.append(f"LOCATION: {item['location']}")
        if item.get("preview"): detail.append(f"RELEASE / TRACK: {item['preview']}")
        detail.extend(str(value) for value in (item.get("evidence") or [])[:2])
        if len(alternatives) > 1: detail.append(f"{len(alternatives)} POSSIBLE BANDCAMP PROFILES FOUND")
        self.match_detail.configure(text="\n".join(detail))

    def _selected_match_indices(self) -> list[int]:
        return [int(value) for value in self.match_tree.selection()]

    def approve_selected(self) -> None:
        for index in self._selected_match_indices():
            if self.matches[index].get("bandcampUrl"):
                self.matches[index]["decision"] = "approved"
            else:
                messagebox.showwarning("Cannot approve", f"{self.matches[index].get('artistName')} has no Bandcamp URL. Use Change Match first.", parent=self)
        self._render_matches(); self._mark_dirty()

    def reject_selected(self) -> None:
        for index in self._selected_match_indices(): self.matches[index]["decision"] = "rejected"
        self._render_matches(); self._mark_dirty()

    def approve_confirmed(self) -> None:
        for item in self.matches:
            if item.get("status") == "CONFIRMED" and item.get("bandcampUrl"): item["decision"] = "approved"
        self._render_matches(); self._mark_dirty()

    def reject_not_found(self) -> None:
        for item in self.matches:
            if item.get("status") == "NOT FOUND": item["decision"] = "rejected"
        self._render_matches(); self._mark_dirty()

    def change_match(self) -> None:
        selected = self._selected_match_indices()
        if len(selected) != 1:
            messagebox.showinfo("Change match", "Select one artist result.", parent=self); return
        item = self.matches[selected[0]]
        value = simpledialog.askstring("Manual Bandcamp match", f"Bandcamp artist URL for {item.get('artistName')}:", initialvalue=str(item.get("bandcampUrl") or "https://"), parent=self)
        if not value: return
        try: url = validate_bandcamp_artist_url(value)
        except ValueError as error: messagebox.showerror("Bandcamp URL", str(error), parent=self); return
        index = selected[0]
        self._async(f"VALIDATING MANUAL BANDCAMP MATCH…", lambda: inspect_bandcamp_artist_url(url), lambda profile: self._manual_match_ready(index, url, profile))

    def _manual_match_ready(self, index: int, url: str, profile: dict[str, object]) -> None:
        item = self.matches[index]
        item.update({"bandcampUrl": url, "status": "CONFIRMED", "confidence": 1.0, "decision": "pending", "matchMethod": "manual", "location": profile.get("location") or "", "preview": profile.get("preview") or "", "evidence": [f"Manually supplied and verified as public Bandcamp profile {profile.get('artistName') or ''}".strip()]})
        self._render_matches(); self.match_tree.selection_set(str(index)); self._mark_dirty()

    def search_again(self) -> None:
        selected = self._selected_match_indices()
        if len(selected) != 1:
            messagebox.showinfo("Search again", "Select one artist result.", parent=self); return
        name = str(self.matches[selected[0]].get("artistName") or "")
        self._async(f"SEARCHING AGAIN FOR {name.upper()}…", lambda: self._match_worker({name}), lambda values: self._replace_matches(values))

    def recheck_unresolved(self) -> None:
        names = {str(item.get("artistName") or "") for item in self.matches if item.get("status") != "CONFIRMED" and item.get("decision") != "approved"}
        if names: self._async(f"RECHECKING {len(names)} UNRESOLVED ARTISTS…", lambda: self._match_worker(names), self._replace_matches)

    def _replace_matches(self, values: list[dict[str, object]]) -> None:
        replacements = {str(item.get("artistName")): item for item in values}
        self.matches = [replacements.get(str(item.get("artistName")), item) for item in self.matches]
        self._render_matches(); self._mark_dirty()

    def _update_coverage(self) -> None:
        project = self._collect_project()
        report = calculate_reporting(project)
        self.coverage.configure(text=f"{report['posterArtistsFound']} ARTISTS DETECTED · {report['confirmed']} AUTO APPROVED · {report['manual']} MANUAL · {report['notFound']} NOT FOUND · {report['coveragePercent']}% BANDCAMP COVERAGE")

    def _collect_project(self) -> dict[str, object]:
        value = json.loads(json.dumps(self.project))
        value["projectId"] = self.current_project_id
        value["festival"] = {"name": self.festival_name.get().strip(), "year": self.festival_year.get().strip(), "website": self.festival_website.get().strip(), "location": self.festival_location.get().strip(), "description": self.description.get("1.0", "end-1c").strip()}
        value["poster"] = {"path": self.poster_path.get(), "originalName": Path(self.poster_path.get()).name if self.poster_path.get() else ""}
        value["editedLineup"] = list(self.lineup)
        value["bandcampMatches"] = list(self.matches)
        value["branding"] = {"logo": self.logo_path.get(), "headerImage": self.header_path.get(), "posterImage": self.poster_path.get(), "backgroundImage": self.background_path.get(), "primaryTitle": self.primary_title.get().strip(), "subtitle": self.subtitle.get().strip(), "showWebsiteButton": self.website_button.get()}
        value["reporting"] = calculate_reporting(value)
        return value

    def save_project(self, announce: bool = True) -> Path | None:
        name = self.festival_name.get().strip()
        if not name:
            if announce: messagebox.showerror("Save festival", "Enter the festival name first.", parent=self)
            return None
        value = self._collect_project()
        project_id = self.current_project_id or slugify(f"{name}-{self.festival_year.get().strip()}")
        value, path = self.store.save(value, project_id=project_id)
        self.current_project_id = str(value["projectId"])
        assets = (("poster", self.poster_path, "poster"), ("logo", self.logo_path, "logo"), ("header", self.header_path, "header"), ("background", self.background_path, "background"))
        for key, variable, role in assets:
            source = variable.get().strip()
            if not source or not Path(source).is_file():
                continue
            stored = self.store.import_asset(self.current_project_id, Path(source), role)
            variable.set(stored)
            if key == "poster":
                value["poster"] = {"path": stored, "originalName": Path(source).name}
            else:
                value.setdefault("branding", {})[{"logo": "logo", "header": "headerImage", "background": "backgroundImage"}[key]] = stored
        value["branding"]["posterImage"] = self.poster_path.get()
        value, path = self.store.save(value, project_id=self.current_project_id)
        self.project = value
        self.dirty = False; self._refresh_project_label()
        if announce: messagebox.showinfo("Festival saved", f"Festival project saved privately.\n\n{path}", parent=self)
        return path

    def save_as(self) -> None:
        default = slugify(f"{self.festival_name.get()}-{self.festival_year.get()}")
        project_id = simpledialog.askstring("Save Festival As", "Project identifier:", initialvalue=default, parent=self)
        if project_id:
            self.current_project_id = slugify(project_id); self.save_project()

    def new_project(self) -> None:
        if self.dirty and not messagebox.askyesno("New festival", "Start a new festival without saving current changes?", parent=self): return
        self._load_into_form(empty_project())

    def open_project(self) -> None:
        projects = self.store.list_projects()
        if not projects:
            messagebox.showinfo("Open festival", "No saved Festival Mode projects were found.", parent=self); return
        choices = [f"{item.get('projectId')}  ·  {(item.get('festival') or {}).get('name')} {(item.get('festival') or {}).get('year')}" for item in projects]
        selected = simpledialog.askstring("Open Festival", "Enter a project identifier:\n\n" + "\n".join(choices[:18]), initialvalue=str(projects[0].get("projectId")), parent=self)
        if selected:
            self._load_into_form(self.store.load(selected.strip()))

    def duplicate_project(self) -> None:
        if not self.current_project_id:
            messagebox.showinfo("Duplicate festival", "Save this festival first.", parent=self); return
        self.save_project(False); self._load_into_form(self.store.duplicate(self.current_project_id)); self.dirty = True; self._refresh_project_label()

    def delete_project(self) -> None:
        if not self.current_project_id: return
        target = self.current_project_id
        if messagebox.askyesno("Delete festival", f"Delete the private project {target}? Published pages are not removed.", parent=self):
            self.store.delete(target); self._load_into_form(empty_project())

    def _load_into_form(self, value: dict[str, object]) -> None:
        self.loading_project = True
        self.project = value; self.current_project_id = str(value.get("projectId") or "")
        festival = value.get("festival") if isinstance(value.get("festival"), dict) else {}
        branding = value.get("branding") if isinstance(value.get("branding"), dict) else {}
        fields = ((self.festival_name, festival.get("name")), (self.festival_year, festival.get("year")), (self.festival_website, festival.get("website")), (self.festival_location, festival.get("location")), (self.primary_title, branding.get("primaryTitle")), (self.subtitle, branding.get("subtitle")))
        for widget, content in fields:
            widget.delete(0, "end"); widget.insert(0, str(content or ""))
        self.description.delete("1.0", "end"); self.description.insert("1.0", str(festival.get("description") or ""))
        poster = value.get("poster") if isinstance(value.get("poster"), dict) else {}
        poster_path = str(poster.get("path") or "")
        self.poster_path.set(poster_path)
        if poster_path and Path(poster_path).is_file(): self.set_poster(poster_path)
        else: self.poster_preview.configure(image="", text="DROP A FESTIVAL POSTER HERE\nOR BROWSE FOR PNG / JPG / JPEG / WEBP", height=10)
        self.logo_path.set(str(branding.get("logo") or "")); self.header_path.set(str(branding.get("headerImage") or "")); self.background_path.set(str(branding.get("backgroundImage") or "")); self.website_button.set(bool(branding.get("showWebsiteButton", True)))
        self.lineup = list(value.get("editedLineup") or [])
        self.matches = list(value.get("bandcampMatches") or [])
        self._render_lineup(); self._render_matches()
        published = str(value.get("publishedUrl") or "")
        self.open_live_button.configure(state="normal" if published else "disabled")
        library = value.get("festivalLibrary")
        if isinstance(library, dict): self.machine_status.configure(text=f"LIBRARY READY · {len(library.get('artists') or [])} ARTISTS · {len(library.get('songs') or [])} TRACKS", fg=SUCCESS)
        self.dirty = False; self.loading_project = False; self._refresh_project_label()

    def build_machine(self) -> None:
        self.save_project(False)
        project = self._collect_project()
        urls = approved_bandcamp_urls(project)
        if not urls:
            messagebox.showerror("Festival library", "Approve at least one reviewed Bandcamp artist first.", parent=self); return
        self._async(f"IMPORTING {len(urls)} APPROVED BANDCAMP CATALOGUES…", lambda: self._build_machine_worker(project), self._machine_built)

    @staticmethod
    def _build_machine_worker(project: dict[str, object]) -> dict[str, object]:
        config = build_festival_config(festival_request(project))
        festival = project.get("festival") if isinstance(project.get("festival"), dict) else {}
        matches = {str(item.get("bandcampUrl") or "").rstrip("/") + "/": item for item in (project.get("bandcampMatches") or []) if isinstance(item, dict)}
        added = dt.datetime.now(dt.timezone.utc).isoformat()
        for artist in config.get("artists") or []:
            match = matches.get(str(artist.get("bandcampUrl") or "").rstrip("/") + "/", {})
            artist.update({
                "reviewedArtistName": match.get("artistName") or artist.get("artistName"),
                "festivalLocation": match.get("location") or "",
                "sourceFestival": festival.get("name") or config.get("festivalName"),
                "dateAdded": added,
                "matchConfidence": match.get("confidence"),
                "matchMethod": match.get("matchMethod") or "automatic",
            })
        return config

    def _machine_built(self, config: dict[str, object]) -> None:
        self.project = self._collect_project(); self.project["festivalLibrary"] = config
        self.project["machineSettings"] = {"engine": "shared-discovery-machine", "mode": "festival", "artists": len(config.get("artists") or []), "tracks": len(config.get("songs") or [])}
        self.store.save(self.project, project_id=self.current_project_id)
        self.dirty = False; self._refresh_project_label()
        failures = config.get("importFailures") or []
        self.machine_status.configure(text=f"LIBRARY READY · {len(config.get('artists') or [])} ARTISTS · {len(config.get('songs') or [])} TRACKS" + (f" · {len(failures)} IMPORT ISSUES" if failures else ""), fg=SUCCESS)

    def _preview_worker(self) -> dict[str, object]:
        config = self.project.get("festivalLibrary")
        if not isinstance(config, dict): raise RuntimeError("Build the Festival Machine before opening a preview.")
        workspace = self.host._ensure_workspace()  # type: ignore[attr-defined]
        project_dir = self.data_root / self.current_project_id
        preview_root = project_dir / "preview"
        if preview_root.exists():
            resolved = preview_root.resolve()
            if resolved.parent != project_dir.resolve(): raise RuntimeError("Unsafe preview directory.")
            shutil.rmtree(resolved)
        site = preview_root / "cosmic-aquarium"
        shutil.copytree(workspace / "github-pages", site)
        preview_config = json.loads(json.dumps(config))
        media_dir = site / "assets" / "festival-machines" / str(config["festivalSlug"])
        media_dir.mkdir(parents=True, exist_ok=True)
        header = next((Path(value) for value in (self.header_path.get(), self.logo_path.get(), self.poster_path.get()) if value and Path(value).is_file()), None)
        if header:
            target = media_dir / f"header{header.suffix.casefold()}"; shutil.copy2(header, target)
            preview_config["machineHeaderArtwork"] = f"/cosmic-aquarium/assets/festival-machines/{config['festivalSlug']}/{target.name}"
        background = Path(self.background_path.get()) if self.background_path.get() else None
        if background and background.is_file():
            target = media_dir / f"background{background.suffix.casefold()}"; shutil.copy2(background, target)
            preview_config["festivalBackgroundArtwork"] = f"/cosmic-aquarium/assets/festival-machines/{config['festivalSlug']}/{target.name}"
        self._write_preview_config(site, preview_config)
        return {"previewRoot": str(preview_root), "previewPath": f"/cosmic-aquarium/festival/?festival={urllib.parse.quote(str(config['festivalSlug']))}"}

    @staticmethod
    def _write_preview_config(site: Path, config: dict[str, object]) -> None:
        slug = str(config["festivalSlug"])
        songs = list(config.get("songs") or [])
        catalogue_dir = site / "festival-machine-catalogues"; catalogue_dir.mkdir(parents=True, exist_ok=True)
        (catalogue_dir / f"{slug}.json").write_text(json.dumps({"schemaVersion": 1, "festivalSlug": slug, "songs": songs}, ensure_ascii=False, indent=2), encoding="utf-8")
        metadata = {key: value for key, value in config.items() if key != "songs"}
        metadata.update({"cataloguePath": f"/festival-machine-catalogues/{slug}.json", "songCount": len(songs), "artistCount": len(config.get("artists") or []), "status": "preview"})
        (site / "festival-machines.json").write_text(json.dumps({"schemaVersion": 1, "festivals": [metadata]}, ensure_ascii=False, indent=2), encoding="utf-8")

    def open_preview(self) -> None:
        if not isinstance(self.project.get("festivalLibrary"), dict):
            messagebox.showerror("Private preview", "Build the Festival Machine first.", parent=self); return
        self._async("BUILDING PRIVATE FESTIVAL PREVIEW…", self._preview_worker, self._preview_ready)

    def _preview_ready(self, result: dict[str, object]) -> None:
        self.host._preview_complete(result)  # type: ignore[attr-defined]
        self.machine_status.configure(text="PRIVATE FESTIVAL PREVIEW OPEN · VERIFY BEFORE PUBLISHING", fg=SUCCESS)

    def publish_machine(self) -> None:
        if not isinstance(self.project.get("festivalLibrary"), dict):
            messagebox.showerror("Publish festival", "Build and preview the Festival Machine first.", parent=self); return
        unresolved = [item for item in self.matches if item.get("decision") == "pending"]
        if unresolved and not messagebox.askyesno("Unresolved matches", f"{len(unresolved)} lineup matches remain unresolved and will be excluded. Continue?", parent=self): return
        if not messagebox.askyesno("Approve and publish?", "Publish this reviewed Festival Machine to the existing public festival route?", parent=self): return
        self._async("RUNNING FESTIVAL CHECKS + PUBLISHING…", self._publish_worker, self._publish_ready)

    def _publish_worker(self) -> dict[str, str]:
        workspace = self.host._ensure_workspace()  # type: ignore[attr-defined]
        git = self.host._git_cli()  # type: ignore[attr-defined]
        gh = self.host._github_cli()  # type: ignore[attr-defined]
        config = json.loads(json.dumps(self.project["festivalLibrary"]))
        slug = str(config["festivalSlug"])
        config_path = workspace / "automation" / "festival-machines" / f"{slug}.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        source_art = next((Path(value) for value in (self.header_path.get(), self.logo_path.get(), self.poster_path.get()) if value and Path(value).is_file()), None)
        paths = [config_path]
        if source_art:
            media_dir = workspace / "public" / "festival-machine-media" / slug
            media_dir.mkdir(parents=True, exist_ok=True)
            artwork = media_dir / f"header{source_art.suffix.casefold()}"
            shutil.copy2(source_art, artwork)
            config["machineHeaderArtwork"] = f"/assets/festival-machines/{slug}/{artwork.name}"
            paths.append(artwork)
        background_art = Path(self.background_path.get()) if self.background_path.get() else None
        if background_art and background_art.is_file():
            media_dir = workspace / "public" / "festival-machine-media" / slug
            media_dir.mkdir(parents=True, exist_ok=True)
            background = media_dir / f"background{background_art.suffix.casefold()}"
            shutil.copy2(background_art, background)
            config["festivalBackgroundArtwork"] = f"/assets/festival-machines/{slug}/{background.name}"
            paths.append(background)
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        branch = f"codex/festival-{slug}-{stamp}"
        run_process([git, "-C", str(workspace), "checkout", "-b", branch])
        try:
            run_process([git, "-C", str(workspace), "config", "user.name", "AGGITS Artist Machine Factory"])
            run_process([git, "-C", str(workspace), "config", "user.email", "artist-machine-factory@users.noreply.github.com"])
            run_process([git, "-C", str(workspace), "add", *[str(path.relative_to(workspace)) for path in paths]])
            staged = subprocess.run([git, "-C", str(workspace), "diff", "--cached", "--quiet"], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if staged.returncode != 0:
                run_process([git, "-C", str(workspace), "commit", "-m", f"Publish {config['title']} Festival Machine"])
                run_process([git, "-C", str(workspace), "push", "-u", "origin", branch])
        finally:
            run_process([git, "-C", str(workspace), "checkout", "main"])
        if staged.returncode != 0:
            started = dt.datetime.now(dt.timezone.utc)
            run_process([gh, "workflow", "run", PUBLISH_WORKFLOW, "--repo", REPOSITORY, "--ref", "main", "-f", f"candidate_ref={branch}", "-f", f"festival_slug={slug}"])
            run_id = self.host._find_run(gh, started, PUBLISH_WORKFLOW)  # type: ignore[attr-defined]
            if self.host._watch_run(gh, run_id) != "success":  # type: ignore[attr-defined]
                raise RuntimeError("Festival production checks stopped the release safely. Review the GitHub Actions run.")
        url = f"{PUBLIC_BASE}?festival={urllib.parse.quote(slug)}&edition={stamp}"
        self.project["festivalLibrary"] = config
        self.project["publishedUrl"] = url
        self.project["reporting"] = calculate_reporting(self.project)
        self.store.save(self.project, project_id=self.current_project_id)
        return {"url": url, "slug": slug}

    def _publish_ready(self, result: dict[str, str]) -> None:
        self.project["publishedUrl"] = result["url"]
        self.open_live_button.configure(state="normal")
        self.clipboard_clear(); self.clipboard_append(result["url"])
        self.machine_status.configure(text="PUBLISHED · FESTIVAL LINK COPIED", fg=SUCCESS)
        messagebox.showinfo("Festival published", "The reviewed Festival Machine is live and its link has been copied.", parent=self)

    def open_live(self) -> None:
        url = str(self.project.get("publishedUrl") or "")
        if url: webbrowser.open(url)
