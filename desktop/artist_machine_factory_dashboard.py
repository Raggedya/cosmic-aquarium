from __future__ import annotations

import datetime as dt
import functools
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageOps, ImageTk


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = SOURCE_ROOT / "scripts"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

import artist_machine_factory as factory  # noqa: E402


REPOSITORY = "Raggedya/cosmic-aquarium"
PUBLISH_WORKFLOW = "publish-artist-machine.yml"
PUBLIC_BASE = "https://raggedya.github.io/cosmic-aquarium/artist/?artist="

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


def application_data() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    return base / "AGGITS" / "Artist Machine Factory"


def creation_flags() -> int:
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def run_process(command: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creation_flags(),
    )


class QuietRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


class ArtistMachineFactoryDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("AGGITS Artist Machine Factory")
        self.geometry("1240x840")
        self.minsize(1040, 720)
        self.configure(bg=INK)

        self.data_root = application_data()
        self.workspace = self.data_root / "workspace"
        self.drafts = self.data_root / "drafts"
        self.data_root.mkdir(parents=True, exist_ok=True)
        self.drafts.mkdir(parents=True, exist_ok=True)

        self.reference_path = tk.StringVar()
        self.skin_path = tk.StringVar()
        self.current_slug = ""
        self.latest_url = ""
        self.preview_server: ThreadingHTTPServer | None = None
        self.preview_thread: threading.Thread | None = None
        self.preview_url = ""
        self.busy = False
        self._image_refs: list[ImageTk.PhotoImage] = []

        self._configure_styles()
        self._build_interface()
        self.after(250, self._refresh_candidates_if_ready)

    def _configure_styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(
            "Factory.Vertical.TScrollbar",
            background=BRASS,
            troughcolor=PANEL,
            bordercolor=PANEL,
            arrowcolor=INK,
            lightcolor=BRASS,
            darkcolor=BRASS,
        )

    def _build_interface(self) -> None:
        header = tk.Frame(self, bg="#090503", height=88, highlightbackground="#4a2b17", highlightthickness=1)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="AGGITS", bg="#090503", fg=CREAM, font=("Georgia", 22, "bold")).pack(side="left", padx=(30, 12))
        title = tk.Frame(header, bg="#090503")
        title.pack(side="left", pady=18)
        tk.Label(title, text="ARTIST MACHINE FACTORY", bg="#090503", fg=PAPER, font=("Segoe UI Semibold", 15)).pack(anchor="w")
        tk.Label(title, text="ONE LOCKED MACHINE  ·  A NEW BAND IN THREE APPROVED CHANGES", bg="#090503", fg=MUTED, font=("Segoe UI", 8)).pack(anchor="w", pady=(3, 0))
        self.connection = tk.Label(header, text="PRIVATE DESKTOP WORKSPACE", bg="#090503", fg=BRASS, font=("Segoe UI Semibold", 9))
        self.connection.pack(side="right", padx=30)

        body = tk.PanedWindow(self, orient="horizontal", bg=INK, sashwidth=8, sashrelief="flat", bd=0)
        body.pack(fill="both", expand=True, padx=22, pady=(20, 16))

        form_shell = tk.Frame(body, bg=PANEL, highlightbackground="#58331d", highlightthickness=1)
        status_shell = tk.Frame(body, bg=PANEL, highlightbackground="#58331d", highlightthickness=1, width=365)
        body.add(form_shell, stretch="always", minsize=620)
        body.add(status_shell, stretch="never", minsize=340)
        self._build_form(form_shell)
        self._build_status(status_shell)

        footer = tk.Frame(self, bg="#090503", height=52)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        self.status = tk.Label(footer, text="READY — ENTER THE BAND DETAILS", bg="#090503", fg=MUTED, font=("Segoe UI Semibold", 9))
        self.status.pack(side="left", padx=28)
        tk.Label(footer, text="Reference images and drafts stay on this computer.", bg="#090503", fg="#7f6a52", font=("Segoe UI", 8)).pack(side="right", padx=28)

    def _build_form(self, parent: tk.Frame) -> None:
        canvas = tk.Canvas(parent, bg=PANEL, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview, style="Factory.Vertical.TScrollbar")
        scroll = tk.Frame(canvas, bg=PANEL)
        window = canvas.create_window((0, 0), window=scroll, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        scroll.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
        canvas.bind_all("<MouseWheel>", lambda event: canvas.yview_scroll(int(-event.delta / 120), "units"))

        content = tk.Frame(scroll, bg=PANEL)
        content.pack(fill="both", expand=True, padx=28, pady=24)
        content.grid_columnconfigure(0, weight=1)
        content.grid_columnconfigure(1, weight=1)

        tk.Label(content, text="1  BAND", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).grid(row=0, column=0, columnspan=2, sticky="w")
        self.artist = self._entry(content, 1, 0, "BAND / ARTIST NAME")
        self.city = self._entry(content, 1, 1, "CITY / LOCATION")
        self.bandcamp = self._entry(content, 2, 0, "OFFICIAL BANDCAMP URL", span=2)

        tk.Label(content, text="2  WORDS", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).grid(row=3, column=0, columnspan=2, sticky="w", pady=(26, 0))
        self.bio = self._text(content, 4, "BAND BIO", 5)
        self.ticker = self._text(content, 5, "TICKER TEXT — ONE ITEM PER LINE", 4)

        tk.Label(content, text="3  VISUALS", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).grid(row=6, column=0, columnspan=2, sticky="w", pady=(26, 0))
        self._file_row(content, 7, "REFERENCE IMAGE  ·  REQUIRED", self.reference_path, self._choose_reference)
        self._file_row(content, 8, "FINAL CABINET SKIN  ·  OPTIONAL FOR FIRST PASS", self.skin_path, self._choose_skin)
        self.art_notes = self._text(content, 9, "COLOUR, TONE AND VIBE NOTES", 3)

        tk.Label(content, text="4  DELIVERY", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).grid(row=10, column=0, columnspan=2, sticky="w", pady=(26, 0))
        self.requested_by = self._entry(content, 11, 0, "PREPARED / APPROVED BY")
        self.delivery_email = self._entry(content, 11, 1, "CONTACT / DELIVERY EMAIL")
        self.request_notes = self._text(content, 12, "PRIVATE REQUEST NOTES", 3)

        actions = tk.Frame(content, bg=PANEL)
        actions.grid(row=13, column=0, columnspan=2, sticky="ew", pady=(28, 12))
        actions.grid_columnconfigure(0, weight=1)
        actions.grid_columnconfigure(1, weight=1)
        self.save_button = self._button(actions, "SAVE DRAFT", self._save_draft, secondary=True)
        self.save_button.grid(row=0, column=0, sticky="ew", padx=(0, 7))
        self.process_button = self._button(actions, "PROCESS BANDCAMP CATALOGUE", self._start_prepare)
        self.process_button.grid(row=0, column=1, sticky="ew", padx=(7, 0))

    def _build_status(self, parent: tk.Frame) -> None:
        canvas = tk.Canvas(parent, bg=PANEL, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview, style="Factory.Vertical.TScrollbar")
        inner = tk.Frame(canvas, bg=PANEL)
        window = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True, padx=(24, 0), pady=24)
        scrollbar.pack(side="right", fill="y")
        inner.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
        tk.Label(inner, text="FACTORY QUEUE", bg=PANEL, fg=BRASS, font=("Segoe UI Semibold", 10)).pack(anchor="w")
        tk.Label(inner, text="Select a candidate to preview or approve.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w", pady=(5, 14))

        list_frame = tk.Frame(inner, bg="#0c0705", highlightbackground="#4f2c19", highlightthickness=1)
        list_frame.pack(fill="x")
        self.candidates = tk.Listbox(
            list_frame,
            height=8,
            bg="#0c0705",
            fg=PAPER,
            selectbackground=BURGUNDY,
            selectforeground=PAPER,
            borderwidth=0,
            highlightthickness=0,
            activestyle="none",
            font=("Segoe UI", 10),
        )
        self.candidates.pack(fill="x", padx=7, pady=7)
        self.candidates.bind("<<ListboxSelect>>", self._candidate_selected)

        report = tk.Frame(inner, bg=PANEL_LIGHT, highlightbackground="#58331d", highlightthickness=1)
        report.pack(fill="x", pady=(18, 0))
        self.report_artist = tk.Label(report, text="NO CANDIDATE SELECTED", bg=PANEL_LIGHT, fg=PAPER, font=("Georgia", 14, "bold"), wraplength=285, justify="left")
        self.report_artist.pack(anchor="w", padx=16, pady=(15, 4))
        self.report_status = tk.Label(report, text="Create a candidate from the form.", bg=PANEL_LIGHT, fg=MUTED, font=("Segoe UI", 9), wraplength=285, justify="left")
        self.report_status.pack(anchor="w", padx=16)
        self.report_count = tk.Label(report, text="", bg=PANEL_LIGHT, fg=CREAM, font=("Segoe UI Semibold", 11))
        self.report_count.pack(anchor="w", padx=16, pady=(9, 15))

        self.attach_button = self._button(inner, "ATTACH / REPLACE FINAL SKIN", self._attach_skin, secondary=True)
        self.attach_button.pack(fill="x", pady=(18, 7))
        self.preview_button = self._button(inner, "BUILD + OPEN PRIVATE PREVIEW", self._start_preview, secondary=True)
        self.preview_button.pack(fill="x", pady=7)
        self.publish_button = self._button(inner, "APPROVE + PUBLISH", self._confirm_publish)
        self.publish_button.pack(fill="x", pady=7)
        self.open_live_button = self._button(inner, "OPEN FINISHED MACHINE", self._open_live, secondary=True)
        self.open_live_button.pack(fill="x", pady=7)
        self.open_live_button.configure(state="disabled")

        note = (
            "The locked controls and operating model are never edited here. "
            "Only the Bandcamp catalogue, ticker copy and approved cabinet skin change."
        )
        tk.Label(inner, text=note, bg=PANEL, fg="#8e765c", font=("Segoe UI", 8), wraplength=300, justify="left").pack(side="bottom", anchor="w", pady=(22, 0))
        self._set_candidate_controls(False, False)

    def _entry(self, parent: tk.Widget, row: int, column: int, label: str, span: int = 1) -> tk.Entry:
        shell = tk.Frame(parent, bg=PANEL)
        shell.grid(row=row, column=column, columnspan=span, sticky="ew", padx=(0 if column == 0 else 9, 9 if span == 1 and column == 0 else 0), pady=(10, 0))
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).pack(anchor="w")
        entry = tk.Entry(shell, bg="#0d0805", fg=PAPER, insertbackground=CREAM, selectbackground=BURGUNDY, relief="flat", bd=0, font=("Segoe UI", 11))
        entry.pack(fill="x", pady=(6, 0), ipady=9, padx=1)
        return entry

    def _text(self, parent: tk.Widget, row: int, label: str, height: int) -> tk.Text:
        shell = tk.Frame(parent, bg=PANEL)
        shell.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).pack(anchor="w")
        widget = tk.Text(shell, height=height, wrap="word", bg="#0d0805", fg=PAPER, insertbackground=CREAM, selectbackground=BURGUNDY, relief="flat", bd=0, font=("Segoe UI", 10), padx=10, pady=8)
        widget.pack(fill="x", pady=(6, 0))
        return widget

    def _file_row(self, parent: tk.Widget, row: int, label: str, variable: tk.StringVar, action: object) -> None:
        shell = tk.Frame(parent, bg=PANEL)
        shell.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        shell.grid_columnconfigure(0, weight=1)
        tk.Label(shell, text=label, bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 8)).grid(row=0, column=0, columnspan=2, sticky="w")
        tk.Entry(shell, textvariable=variable, state="readonly", readonlybackground="#0d0805", fg=PAPER, relief="flat", bd=0, font=("Segoe UI", 9)).grid(row=1, column=0, sticky="ew", pady=(6, 0), ipady=9)
        tk.Button(shell, text="CHOOSE IMAGE", command=action, bg="#3b2415", fg=CREAM, activebackground="#5a351e", activeforeground=PAPER, relief="flat", bd=0, cursor="hand2", font=("Segoe UI Semibold", 8), padx=14).grid(row=1, column=1, sticky="ns", pady=(6, 0), padx=(8, 0))

    def _button(self, parent: tk.Widget, text: str, command: object, secondary: bool = False) -> tk.Button:
        background = "#3b2415" if secondary else BURGUNDY
        active = "#5a351e" if secondary else BURGUNDY_LIGHT
        return tk.Button(parent, text=text, command=command, bg=background, fg=PAPER, activebackground=active, activeforeground=PAPER, disabledforeground="#786b58", relief="flat", bd=0, cursor="hand2", font=("Segoe UI Semibold", 9), pady=12)

    def _choose_reference(self) -> None:
        selected = self._choose_image("Choose the colour / tone reference image")
        if selected:
            self.reference_path.set(selected)

    def _choose_skin(self) -> None:
        selected = self._choose_image("Choose the final 747 × 1280 cabinet skin")
        if selected:
            self.skin_path.set(selected)

    def _choose_image(self, title: str) -> str:
        return filedialog.askopenfilename(title=title, filetypes=(("Image files", "*.jpg *.jpeg *.png *.webp"), ("All files", "*.*")))

    def _form_value(self) -> dict[str, object]:
        ticker = [line.strip() for line in self.ticker.get("1.0", "end").splitlines() if line.strip()]
        return {
            "schemaVersion": 1,
            "artist": {
                "name": self.artist.get().strip(),
                "bandcampUrl": self.bandcamp.get().strip(),
                "city": self.city.get().strip(),
            },
            "editorial": {
                "bio": self.bio.get("1.0", "end").strip(),
                "tickerCopy": ticker,
            },
            "artwork": {
                "referenceImage": self.reference_path.get().strip(),
                "cabinetSkin": self.skin_path.get().strip(),
                "notes": self.art_notes.get("1.0", "end").strip(),
            },
            "request": {
                "requestedBy": self.requested_by.get().strip(),
                "deliveryEmail": self.delivery_email.get().strip(),
                "notes": self.request_notes.get("1.0", "end").strip(),
            },
        }

    def _validate_form(self) -> tuple[dict[str, object], str]:
        value = self._form_value()
        artist = str(value["artist"]["name"])  # type: ignore[index]
        bandcamp = str(value["artist"]["bandcampUrl"])  # type: ignore[index]
        reference = Path(str(value["artwork"]["referenceImage"]))  # type: ignore[index]
        if not artist:
            raise factory.FactoryError("Enter the band or artist name")
        slug = factory.slugify(artist)
        factory.validate_bandcamp_url(bandcamp)
        if not reference.is_file():
            raise factory.FactoryError("Choose a reference image")
        return value, slug

    def _save_draft(self, announce: bool = True) -> Path | None:
        try:
            value, slug = self._validate_form()
            path = self.drafts / f"{slug}.json"
            factory.write_json_atomic(path, value)
            if announce:
                self._set_status("DRAFT SAVED ON THIS COMPUTER", SUCCESS)
            return path
        except (factory.FactoryError, ValueError) as error:
            if announce:
                messagebox.showerror("Details needed", str(error))
            return None

    def _start_prepare(self) -> None:
        if self.busy:
            return
        intake = self._save_draft(announce=False)
        if not intake:
            return
        slug = intake.stem
        existing = self.workspace / "automation" / "artist-machine-factory" / "candidates" / slug
        if existing.exists() and not messagebox.askyesno("Update this candidate?", "A private candidate already exists for this artist. Replace it with the details currently in the form?"):
            return
        self._run_async("READING THE COMPLETE BANDCAMP CATALOGUE…", lambda: self._prepare(intake), self._prepare_complete)

    def _prepare(self, intake: Path) -> dict[str, object]:
        self._ensure_workspace()
        report = factory.prepare(intake, replace=True)
        return report

    def _prepare_complete(self, report: dict[str, object]) -> None:
        self.current_slug = str(report["artistSlug"])
        self._refresh_candidates()
        self._select_slug(self.current_slug)
        count = int(report.get("catalogue", {}).get("playableSongCount", 0))  # type: ignore[union-attr]
        if report.get("status") == "awaiting_skin":
            self._set_status(f"{count} SONGS FOUND — FINAL SKIN NEEDED", SUCCESS)
        else:
            self._set_status(f"CANDIDATE READY — {count} PLAYABLE SONGS", SUCCESS)

    def _ensure_workspace(self) -> Path:
        gh = self._github_cli()
        git = self._git_cli()
        if not (self.workspace / ".git").is_dir():
            self.workspace.parent.mkdir(parents=True, exist_ok=True)
            run_process([gh, "repo", "clone", REPOSITORY, str(self.workspace), "--", "--depth=1"])
        else:
            run_process([git, "-C", str(self.workspace), "checkout", "main"])
            run_process([git, "-C", str(self.workspace), "pull", "--ff-only", "origin", "main"])
        factory.configure_workspace(self.workspace)
        return self.workspace

    def _github_cli(self) -> str:
        gh = shutil.which("gh")
        if not gh:
            raise RuntimeError("GitHub connection is not installed on this computer. Install GitHub CLI, then sign in once.")
        run_process([gh, "auth", "status"])
        return gh

    def _git_cli(self) -> str:
        git = shutil.which("git")
        if not git:
            raise RuntimeError("Git is not installed on this computer yet.")
        return git

    def _refresh_candidates_if_ready(self) -> None:
        if (self.workspace / ".git").is_dir():
            try:
                factory.configure_workspace(self.workspace)
                self.connection.configure(text="FACTORY WORKSPACE CONNECTED", fg=SUCCESS)
                self._refresh_candidates()
            except Exception:
                pass

    def _refresh_candidates(self) -> None:
        selected = self.current_slug
        self.candidates.delete(0, "end")
        self._candidate_slugs: list[str] = []
        root = self.workspace / "automation" / "artist-machine-factory" / "candidates"
        if not root.is_dir():
            return
        rows: list[tuple[str, str, str]] = []
        for path in root.iterdir():
            if not path.is_dir() or path.name.startswith("."):
                continue
            try:
                report = json.loads((path / "report.json").read_text(encoding="utf-8"))
                rows.append((str(report.get("artistName") or path.name), path.name, str(report.get("status") or "draft")))
            except (OSError, json.JSONDecodeError):
                continue
        for artist, slug, status in sorted(rows, key=lambda item: item[0].casefold()):
            self._candidate_slugs.append(slug)
            self.candidates.insert("end", f"  {artist}   ·   {status.replace('_', ' ').upper()}")
        if selected:
            self._select_slug(selected)

    def _select_slug(self, slug: str) -> None:
        if slug not in getattr(self, "_candidate_slugs", []):
            return
        index = self._candidate_slugs.index(slug)
        self.candidates.selection_clear(0, "end")
        self.candidates.selection_set(index)
        self.candidates.see(index)
        self.current_slug = slug
        self._show_candidate(slug)

    def _candidate_selected(self, _event: object = None) -> None:
        selection = self.candidates.curselection()
        if not selection:
            return
        self.current_slug = self._candidate_slugs[int(selection[0])]
        self._show_candidate(self.current_slug)

    def _show_candidate(self, slug: str) -> None:
        try:
            report = json.loads((self.workspace / "automation" / "artist-machine-factory" / "candidates" / slug / "report.json").read_text(encoding="utf-8"))
            status = str(report.get("status") or "draft")
            count = int(report.get("catalogue", {}).get("playableSongCount") or 0)
            self.report_artist.configure(text=str(report.get("artistName") or slug))
            descriptions = {
                "awaiting_skin": "Catalogue processed. Add the approved 747 × 1280 cabinet skin.",
                "ready_for_approval": "All automatic checks passed. Build the private preview before approval.",
                "blocked": "A safety check needs attention before this can be approved.",
                "approved": "Approved locally and ready/published through the secure release workflow.",
            }
            self.report_status.configure(text=descriptions.get(status, status.replace("_", " ").title()), fg=SUCCESS if status in {"ready_for_approval", "approved"} else MUTED)
            self.report_count.configure(text=f"{count} PLAYABLE SONG{'S' if count != 1 else ''}")
            has_skin = report.get("cabinetSkin") is not None
            self._set_candidate_controls(True, status == "ready_for_approval" and has_skin)
            self.latest_url = PUBLIC_BASE + slug if status == "approved" else ""
            self.open_live_button.configure(state="normal" if self.latest_url else "disabled")
        except (OSError, ValueError, json.JSONDecodeError):
            self._set_candidate_controls(False, False)

    def _set_candidate_controls(self, exists: bool, ready: bool) -> None:
        self.attach_button.configure(state="normal" if exists else "disabled")
        self.preview_button.configure(state="normal" if ready else "disabled")
        self.publish_button.configure(state="normal" if ready else "disabled")

    def _attach_skin(self) -> None:
        if self.busy or not self.current_slug:
            return
        selected = self._choose_image("Choose the approved 747 × 1280 cabinet skin")
        if not selected:
            return
        self.skin_path.set(selected)
        self._run_async("CHECKING THE CABINET SKIN…", lambda: self._attach_skin_worker(Path(selected)), self._skin_complete)

    def _attach_skin_worker(self, path: Path) -> dict[str, object]:
        self._ensure_workspace()
        return factory.attach_skin(self.current_slug, path)

    def _skin_complete(self, report: dict[str, object]) -> None:
        self._refresh_candidates()
        self._select_slug(str(report["artistSlug"]))
        self._set_status("SKIN PASSED — PRIVATE PREVIEW IS READY TO BUILD", SUCCESS)

    def _start_preview(self) -> None:
        if self.busy or not self.current_slug:
            return
        self._run_async("BUILDING THE PRIVATE PREVIEW…", self._preview_worker, self._preview_complete)

    def _preview_worker(self) -> dict[str, object]:
        self._ensure_workspace()
        return factory.build_preview(self.current_slug)

    def _preview_complete(self, result: dict[str, object]) -> None:
        preview_root = Path(str(result["previewRoot"]))
        self._stop_preview_server()
        handler = functools.partial(QuietRequestHandler, directory=str(preview_root))
        self.preview_server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.preview_thread = threading.Thread(target=self.preview_server.serve_forever, daemon=True)
        self.preview_thread.start()
        port = int(self.preview_server.server_address[1])
        self.preview_url = f"http://127.0.0.1:{port}{result['previewPath']}"
        webbrowser.open(self.preview_url)
        self._set_status("PRIVATE PREVIEW OPEN — CHECK EVERY DETAIL BEFORE APPROVAL", SUCCESS)

    def _stop_preview_server(self) -> None:
        if self.preview_server:
            self.preview_server.shutdown()
            self.preview_server.server_close()
        self.preview_server = None
        self.preview_thread = None

    def _confirm_publish(self) -> None:
        if self.busy or not self.current_slug:
            return
        approved_by = self.requested_by.get().strip()
        if not approved_by:
            messagebox.showerror("Approver needed", "Enter your name in PREPARED / APPROVED BY before publishing.")
            return
        if not messagebox.askyesno(
            "Approve and publish?",
            "This will submit the selected machine to the protected production checks. Only a passing machine can go live. Continue?",
        ):
            return
        self._run_async("RUNNING FINAL CHECKS + PUBLISHING…", lambda: self._publish_worker(approved_by), self._publish_complete)

    def _publish_worker(self, approved_by: str) -> dict[str, str]:
        workspace = self._ensure_workspace()
        gh = self._github_cli()
        git = self._git_cli()
        report = factory.approve(self.current_slug, approved_by, skip_quality_commands=True)
        slug = str(report["artistSlug"])
        try:
            config = workspace / "automation" / "artist-machines" / f"{slug}.json"
            skin_candidates = list((workspace / "public" / "music-machine").glob(f"{slug}-cabinet.*"))
            if len(skin_candidates) != 1:
                raise RuntimeError("The final cabinet skin could not be identified safely.")
            skin = skin_candidates[0]
            stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
            branch = f"codex/factory-{slug}-{stamp}"
            run_process([git, "-C", str(workspace), "checkout", "-b", branch])
            try:
                run_process([git, "-C", str(workspace), "config", "user.name", "AGGITS Artist Machine Factory"])
                run_process([git, "-C", str(workspace), "config", "user.email", "artist-machine-factory@users.noreply.github.com"])
                run_process([git, "-C", str(workspace), "add", str(config.relative_to(workspace)), str(skin.relative_to(workspace))])
                staged = subprocess.run([git, "-C", str(workspace), "diff", "--cached", "--quiet"], creationflags=creation_flags())
                if staged.returncode == 0:
                    return {"url": PUBLIC_BASE + slug, "status": "already_current"}
                run_process([git, "-C", str(workspace), "commit", "-m", f"Publish {report['artistName']} Artist Machine"])
                run_process([git, "-C", str(workspace), "push", "-u", "origin", branch])
            finally:
                run_process([git, "-C", str(workspace), "checkout", "main"])

            started = dt.datetime.now(dt.timezone.utc)
            run_process([
                gh,
                "workflow",
                "run",
                PUBLISH_WORKFLOW,
                "--repo",
                REPOSITORY,
                "--ref",
                "main",
                "-f",
                f"candidate_ref={branch}",
                "-f",
                f"artist_slug={slug}",
            ])
            run_id = self._find_run(gh, started)
            conclusion = self._watch_run(gh, run_id)
            if conclusion != "success":
                details = run_process([gh, "run", "view", str(run_id), "--repo", REPOSITORY, "--json", "url"])
                run_url = json.loads(details.stdout).get("url", "")
                raise RuntimeError("Production checks stopped the release safely." + (f"\n\nReview: {run_url}" if run_url else ""))
            return {"url": PUBLIC_BASE + slug, "status": "published"}
        except Exception:
            candidate = factory.candidate_paths(slug)
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            factory.write_json_atomic(candidate["status"], {"status": "ready_for_approval", "updatedAt": now, "approved": False})
            local_report = factory.load_json(candidate["report"])
            local_report.update({"status": "ready_for_approval", "updatedAt": now})
            local_report.pop("approvedAt", None)
            local_report.pop("approvedBy", None)
            local_report.pop("publicUrl", None)
            factory.write_json_atomic(candidate["report"], local_report)
            raise

    def _find_run(self, gh: str, started: dt.datetime) -> int:
        for _ in range(30):
            process = run_process([
                gh,
                "run",
                "list",
                "--repo",
                REPOSITORY,
                "--workflow",
                PUBLISH_WORKFLOW,
                "--event",
                "workflow_dispatch",
                "--limit",
                "10",
                "--json",
                "databaseId,createdAt",
            ])
            for item in json.loads(process.stdout):
                created = dt.datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00"))
                if created >= started - dt.timedelta(seconds=5):
                    return int(item["databaseId"])
            time.sleep(2)
        raise RuntimeError("GitHub accepted the machine but its production run could not be located.")

    def _watch_run(self, gh: str, run_id: int) -> str:
        for _ in range(240):
            process = run_process([gh, "run", "view", str(run_id), "--repo", REPOSITORY, "--json", "status,conclusion"])
            value = json.loads(process.stdout)
            if value.get("status") == "completed":
                return str(value.get("conclusion") or "unknown")
            time.sleep(5)
        raise RuntimeError("Publishing is still running. The draft is safe; check GitHub Actions for its final status.")

    def _publish_complete(self, result: dict[str, str]) -> None:
        self.latest_url = result["url"]
        self.open_live_button.configure(state="normal")
        self.clipboard_clear()
        self.clipboard_append(self.latest_url)
        self.update()
        if result["status"] == "already_current":
            self._set_status("ALREADY CURRENT — LIVE LINK COPIED", SUCCESS)
        else:
            self._set_status("PUBLISHED — LIVE LINK COPIED", SUCCESS)
        messagebox.showinfo("Artist Machine ready", "The machine passed production checks and its live link has been copied to the clipboard.")

    def _open_live(self) -> None:
        if self.latest_url:
            webbrowser.open(self.latest_url)

    def _run_async(self, working: str, operation: object, complete: object) -> None:
        if self.busy:
            return
        self.busy = True
        self._set_status(working, BRASS)
        self._set_form_enabled(False)

        def worker() -> None:
            try:
                result = operation()  # type: ignore[operator]
            except Exception as error:
                self.after(0, lambda: self._operation_failed(str(error)))
                return
            self.after(0, lambda: self._operation_complete(complete, result))

        threading.Thread(target=worker, daemon=True).start()

    def _operation_complete(self, complete: object, result: object) -> None:
        self.busy = False
        self._set_form_enabled(True)
        complete(result)  # type: ignore[operator]

    def _operation_failed(self, message: str) -> None:
        self.busy = False
        self._set_form_enabled(True)
        self._set_status("FACTORY PAUSED SAFELY", ERROR)
        messagebox.showerror("Artist Machine Factory", message)

    def _set_form_enabled(self, enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        self.save_button.configure(state=state)
        self.process_button.configure(state=state)
        if enabled and self.current_slug:
            self._show_candidate(self.current_slug)
        elif not enabled:
            self.attach_button.configure(state="disabled")
            self.preview_button.configure(state="disabled")
            self.publish_button.configure(state="disabled")

    def _set_status(self, text: str, colour: str) -> None:
        self.status.configure(text=text, fg=colour)

    def destroy(self) -> None:
        self._stop_preview_server()
        super().destroy()


def smoke_test() -> None:
    required = {
        "factory_version": factory.ENGINE_VERSION,
        "repository": REPOSITORY,
        "publish_workflow": PUBLISH_WORKFLOW,
        "data_root": str(application_data()),
    }
    if factory.ENGINE_VERSION != "artist-machine-v1":
        raise RuntimeError("Unexpected Artist Machine engine version")
    print(json.dumps(required, indent=2))


if __name__ == "__main__":
    if "--smoke-test" in sys.argv:
        smoke_test()
    else:
        ArtistMachineFactoryDashboard().mainloop()
