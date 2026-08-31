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
from tkinter import messagebox, ttk

from PIL import Image, ImageDraw, ImageFilter, ImageTk


REPOSITORY = "Raggedya/cosmic-aquarium"
WORKFLOW = "create-artist.yml"
PAGES_BASE = "https://raggedya.github.io/cosmic-aquarium"
INK = "#07071d"
PAPER = "#f5f3fb"
MUTED = "#9993ad"
LAVENDER = "#c7b8f4"
LINE = "#302d4b"


def resource_path(relative: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / relative


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
        self.title("Cosmic Aquarium Studio")
        self.geometry("1160x760")
        self.minsize(980, 660)
        self.configure(bg=INK)
        self.protocol("WM_DELETE_WINDOW", self.destroy)
        self._images: list[ImageTk.PhotoImage] = []
        self._latest_url = ""
        self._busy = False
        self._build_interface()

    def _build_interface(self) -> None:
        self.canvas = tk.Canvas(self, bg=INK, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", self._draw_background)

        shell = tk.Frame(self.canvas, bg=INK)
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
        tk.Label(brand, text="COSMIC AQUARIUM", bg=INK, fg=PAPER, font=("Segoe UI", 11), padx=15).pack(side="left")
        tk.Label(brand, text="CREATOR", bg=INK, fg=MUTED, font=("Segoe UI", 8)).pack(side="left")

        content = tk.Frame(shell, bg=INK)
        content.grid(row=1, column=0, sticky="nsew", padx=(104, 38), pady=(70, 40))
        content.grid_columnconfigure(0, weight=1)

        tk.Label(content, text="MAKE AN AQUARIUM", bg=INK, fg=LAVENDER, font=("Segoe UI Semibold", 9)).grid(row=0, column=0, sticky="w")
        tk.Label(content, text="A band. A link.\nA living world.", justify="left", bg=INK, fg=PAPER, font=("Georgia", 36), pady=15).grid(row=1, column=0, sticky="w")
        tk.Label(
            content,
            text="Every flower becomes a discovery.\nThe finished link and scan-tested QR arrive by email.",
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

        visual = tk.Canvas(shell, width=440, bg=INK, highlightthickness=0)
        visual.grid(row=1, column=1, rowspan=2, sticky="nsew", padx=(0, 44), pady=(22, 28))
        visual.bind("<Configure>", lambda _event: self._draw_flower_composition(visual))
        self.visual = visual

        footer = tk.Frame(shell, bg=INK)
        footer.grid(row=2, column=0, columnspan=2, sticky="ew", padx=58, pady=(0, 28))
        tk.Label(footer, text="© CLEARLIGHT CREATIVE 2026", bg=INK, fg="#5d5871", font=("Segoe UI", 7)).pack(side="left")
        tk.Label(footer, text="GITHUB PAGES  ·  BANDCAMP  ·  SCAN VERIFIED", bg=INK, fg="#5d5871", font=("Segoe UI", 7)).pack(side="right")

        self.artist.focus_set()

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

    def _draw_flower_composition(self, canvas: tk.Canvas) -> None:
        canvas.delete("all")
        width, height = canvas.winfo_width(), canvas.winfo_height()
        if width < 50 or height < 50:
            return
        canvas.create_oval(84, 76, width - 36, height - 64, outline="#1e2140", width=1)
        canvas.create_oval(128, 120, width - 80, height - 108, outline="#161832", width=1)
        placements = [
            ("anemone.png", width * .5, height * .43, 225, -4),
            ("poppy.png", width * .82, height * .18, 142, 12),
            ("cosmos.png", width * .18, height * .78, 154, -13),
            ("poppy.png", width * .82, height * .78, 105, 8),
        ]
        self._images.clear()
        for name, x, y, size, rotation in placements:
            source = resource_path("assets/flowers/" + name)
            if not source.exists():
                source = resource_path("public/flowers/" + name)
            image = Image.open(source).convert("RGBA")
            scale = size / image.width
            image = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
            image = image.rotate(rotation, expand=True, resample=Image.Resampling.BICUBIC)
            photo = ImageTk.PhotoImage(image)
            self._images.append(photo)
            canvas.create_image(x, y, image=photo)
        canvas.create_text(width / 2, height * .56, text="✦", fill=LAVENDER, font=("Segoe UI", 18))
        canvas.create_text(width / 2, height * .62, text="TOUCH SOMETHING.", fill="#8d87a7", font=("Segoe UI Semibold", 8))

    def _start_create(self) -> None:
        if self._busy:
            return
        title = self.artist.get().strip()
        bandcamp_url = self.bandcamp.get().strip()
        recipient = self.recipient.get().strip()
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
        threading.Thread(target=self._run_create, args=(title, bandcamp_url, recipient, started), daemon=True).start()

    def _run_create(self, title: str, bandcamp_url: str, recipient: str, started: dt.datetime) -> None:
        try:
            gh = shutil.which("gh")
            if not gh:
                raise RuntimeError("GitHub CLI is not installed. Install it once, then sign in with gh auth login.")
            subprocess.run([gh, "auth", "status"], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            subprocess.run([
                gh, "workflow", "run", WORKFLOW, "--repo", REPOSITORY,
                "-f", f"artist_title={title}", "-f", f"bandcamp_url={bandcamp_url}", "-f", f"recipient_email={recipient}",
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            self.after(0, lambda: self.status.configure(text="GROWING FLOWERS  ·  BUILDING QR", fg=LAVENDER))
            run_id = self._find_run(gh, started)
            conclusion = self._watch_run(gh, run_id)
            if conclusion != "success":
                raise RuntimeError("The GitHub creation workflow finished with: " + conclusion)
            url = PAGES_BASE.rstrip("/") + "/" + slugify(title) + "/"
            self.after(0, lambda: self._finish_success(url))
        except Exception as error:
            self.after(0, lambda: self._finish_error(str(error)))

    def _find_run(self, gh: str, started: dt.datetime) -> int:
        for _ in range(24):
            data = self._runs(gh)
            for item in data:
                created = dt.datetime.fromisoformat(item["createdAt"].replace("Z", "+00:00"))
                if created >= started - dt.timedelta(seconds=5):
                    return int(item["databaseId"])
            time.sleep(2.5)
        raise RuntimeError("GitHub accepted the request but the workflow run could not be located.")

    def _watch_run(self, gh: str, run_id: int) -> str:
        for _ in range(240):
            process = subprocess.run([
                gh, "run", "view", str(run_id), "--repo", REPOSITORY, "--json", "status,conclusion"
            ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
            data = json.loads(process.stdout)
            if data.get("status") == "completed":
                return str(data.get("conclusion") or "unknown")
            time.sleep(5)
        raise RuntimeError("The creation is still running. Open GitHub Actions to continue watching it.")

    def _runs(self, gh: str) -> list[dict]:
        process = subprocess.run([
            gh, "run", "list", "--repo", REPOSITORY, "--workflow", WORKFLOW,
            "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,createdAt,status,conclusion"
        ], check=True, capture_output=True, text=True, creationflags=self._creation_flags())
        return json.loads(process.stdout)

    @staticmethod
    def _creation_flags() -> int:
        return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    def _finish_success(self, url: str) -> None:
        self._busy = False
        self._latest_url = url
        self.create_button.configure(state="normal", text="CREATE ANOTHER  ✦")
        self.status.configure(text="CREATED  ·  LINK + QR EMAILED", fg="#cbdba5")
        self.result_row.grid()

    def _finish_error(self, message: str) -> None:
        self._busy = False
        self.create_button.configure(state="normal", text="TRY AGAIN  ✦")
        self.status.configure(text="CREATION PAUSED", fg="#e995a5")
        messagebox.showerror("Cosmic Aquarium", message)

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
        if application.artist.winfo_exists() != 1 or application.create_button.cget("text") != "CREATE  ✦":
            raise RuntimeError("Desktop interface did not initialise correctly")
        application.destroy()
        print("Cosmic Aquarium Studio smoke test passed.")
    else:
        application.mainloop()
