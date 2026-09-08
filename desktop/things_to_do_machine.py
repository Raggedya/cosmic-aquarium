from __future__ import annotations

import ctypes
import json
import os
import subprocess
import shutil
import sys
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"
if str(DESKTOP) not in sys.path:
    sys.path.insert(0, str(DESKTOP))

from tourism_config import TOURISM_CATEGORIES, load_draft, save_draft, slugify, validate_config  # noqa: E402
from tourism_preview_server import start_preview_server  # noqa: E402

APP_ID = "com.aggits.things-to-do-machine"
PAGES_PREVIEW = "https://raggedya.github.io/cosmic-aquarium/tourism/"
INK, PANEL, PANEL_ALT = "#120a06", "#21130c", "#302017"
BRASS, BRASS_LIGHT, CREAM = "#a96e2d", "#e4b86a", "#f3dcad"
MUTED, GOOD, WARN = "#a99982", "#a9c887", "#e8b76b"


def set_windows_identity() -> None:
    if os.name == "nt":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
        except (AttributeError, OSError):
            pass


class ThingsToDoMachineApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Things To Do Machine")
        self.geometry("1180x850")
        self.minsize(980, 700)
        self.configure(bg=INK)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.config_data = load_draft(ROOT)
        self.preview_server = None
        self.destination_vars: dict[str, tk.StringVar] = {}
        self.visual_vars: dict[str, tk.StringVar] = {}
        self._build_styles()
        self._build_interface()
        self._load_values()

    def _build_styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Tourism.TNotebook", background=INK, borderwidth=0)
        style.configure("Tourism.TNotebook.Tab", background=PANEL, foreground=MUTED, padding=(15, 10), font=("Segoe UI", 9, "bold"))
        style.map("Tourism.TNotebook.Tab", background=[("selected", BRASS)], foreground=[("selected", "#140b06")])

    def _build_interface(self) -> None:
        header = tk.Frame(self, bg=INK, padx=28, pady=20)
        header.pack(fill="x")
        tk.Label(header, text="THINGS TO DO MACHINE", bg=INK, fg=CREAM, font=("Georgia", 24, "bold")).pack(anchor="w")
        tk.Label(header, text="TOURISM CONFIGURATION · MILESTONE 1", bg=INK, fg=BRASS_LIGHT, font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(4, 0))
        self.notebook = ttk.Notebook(self, style="Tourism.TNotebook")
        self.notebook.pack(fill="both", expand=True, padx=24, pady=(0, 18))
        self.pages: dict[str, tk.Frame] = {}
        for name in ("DESTINATION", "DISCOVERIES", "TICKER CONTENT", "VISUALS", "PREVIEW", "PUBLISH", "SETTINGS"):
            page = tk.Frame(self.notebook, bg=PANEL, padx=28, pady=24)
            self.pages[name] = page
            self.notebook.add(page, text=name)
        self._build_destination()
        self._build_discoveries()
        self._build_ticker()
        self._build_visuals()
        self._build_preview()
        self._build_publish()
        self._build_settings()
        footer = tk.Frame(self, bg=INK, padx=24, pady=12)
        footer.pack(fill="x")
        self.status = tk.Label(footer, text="TOURISM DRAFT READY", bg=INK, fg=MUTED, font=("Segoe UI", 9, "bold"))
        self.status.pack(side="left")
        self._button(footer, "SAVE TOURISM DRAFT", self._save).pack(side="right")

    def _field(self, parent: tk.Widget, label: str, key: str, row: int, column: int = 0, width: int = 1) -> tk.StringVar:
        tk.Label(parent, text=label, bg=PANEL, fg=BRASS_LIGHT, font=("Segoe UI", 9, "bold")).grid(row=row * 2, column=column, columnspan=width, sticky="w", padx=(0, 14), pady=(6, 3))
        value = tk.StringVar()
        entry = tk.Entry(parent, textvariable=value, bg=PANEL_ALT, fg=CREAM, insertbackground=CREAM, relief="flat", font=("Segoe UI", 11))
        entry.grid(row=row * 2 + 1, column=column, columnspan=width, sticky="ew", padx=(0, 14), ipady=9)
        entry.bind("<KeyRelease>", lambda _event: self._mark_dirty())
        return value

    def _button(self, parent: tk.Widget, text: str, command, accent: bool = False) -> tk.Button:
        return tk.Button(parent, text=text, command=command, bg=BRASS if accent else PANEL_ALT, fg="#160d08" if accent else CREAM, activebackground=BRASS_LIGHT, activeforeground="#160d08", relief="flat", bd=0, padx=18, pady=10, font=("Segoe UI", 9, "bold"), cursor="hand2")

    def _build_destination(self) -> None:
        page = self.pages["DESTINATION"]
        page.columnconfigure((0, 1), weight=1)
        fields = (("DESTINATION NAME", "name"), ("REGION", "region"), ("STATE", "state"), ("COUNTRY", "country"), ("RADIUS (KM)", "radiusKm"), ("MACHINE TITLE", "machineTitle"), ("TAGLINE", "tagline"), ("DESTINATION SLOGAN", "slogan"))
        for index, (label, key) in enumerate(fields):
            self.destination_vars[key] = self._field(page, label, key, index // 2, index % 2)

    def _build_discoveries(self) -> None:
        page = self.pages["DISCOVERIES"]
        tk.Label(page, text="DEMONSTRATION DISCOVERIES", bg=PANEL, fg=CREAM, font=("Georgia", 16, "bold")).pack(anchor="w")
        tk.Label(page, text="A small editable set for structural review. Production discovery is a later milestone.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w", pady=(5, 14))
        self.discovery_list = tk.Listbox(page, bg=PANEL_ALT, fg=CREAM, selectbackground=BRASS, selectforeground="#130b07", relief="flat", activestyle="none", font=("Segoe UI", 11), height=20)
        self.discovery_list.pack(fill="both", expand=True)
        controls = tk.Frame(page, bg=PANEL)
        controls.pack(fill="x", pady=(14, 0))
        self._button(controls, "ADD", self._add_discovery).pack(side="left")
        self._button(controls, "EDIT", self._edit_discovery).pack(side="left", padx=8)
        self._button(controls, "REMOVE", self._remove_discovery).pack(side="left")

    def _build_ticker(self) -> None:
        page = self.pages["TICKER CONTENT"]
        tk.Label(page, text="REGIONAL FACTS / MESSAGES", bg=PANEL, fg=CREAM, font=("Georgia", 16, "bold")).pack(anchor="w")
        tk.Label(page, text="One message per line. READY and RESULT messages are controlled by machine state.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w", pady=(5, 14))
        self.ticker_text = tk.Text(page, bg=PANEL_ALT, fg=CREAM, insertbackground=CREAM, relief="flat", wrap="word", font=("Segoe UI", 11), padx=14, pady=14)
        self.ticker_text.pack(fill="both", expand=True)
        self.ticker_text.bind("<KeyRelease>", lambda _event: self._mark_dirty())

    def _build_visuals(self) -> None:
        page = self.pages["VISUALS"]
        page.columnconfigure(0, weight=1)
        for row, (label, key) in enumerate((("DESTINATION HEADER IMAGE", "headerImage"), ("CABINET / THEME ASSET", "cabinetAsset"), ("ICON PLACEHOLDER", "iconAsset"))):
            self.visual_vars[key] = self._field(page, label, key, row)
            self._button(page, "BROWSE", lambda target=key: self._browse_visual(target)).grid(row=row * 2 + 1, column=1, sticky="ew", pady=0)
        tk.Label(page, text="The approved Bendigo cabinet is the current default. Asset replacement does not change machine geometry.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9), wraplength=760, justify="left").grid(row=7, column=0, columnspan=2, sticky="w", pady=24)

    def _build_preview(self) -> None:
        page = self.pages["PREVIEW"]
        tk.Label(page, text="TOURISM MACHINE PREVIEW", bg=PANEL, fg=CREAM, font=("Georgia", 18, "bold")).pack(anchor="w")
        tk.Label(page, text="Save the draft, rebuild the static site, then open the isolated /tourism/ route.", bg=PANEL, fg=MUTED, font=("Segoe UI", 10), wraplength=760, justify="left").pack(anchor="w", pady=(8, 24))
        self._button(page, "BUILD + OPEN LOCAL PREVIEW", self._preview, accent=True).pack(anchor="w")
        self._button(page, "OPEN PUBLISHED TOURISM ROUTE", lambda: webbrowser.open(PAGES_PREVIEW)).pack(anchor="w", pady=(12, 0))

    def _build_publish(self) -> None:
        page = self.pages["PUBLISH"]
        tk.Label(page, text="PUBLISH", bg=PANEL, fg=CREAM, font=("Georgia", 18, "bold")).pack(anchor="w")
        tk.Label(page, text="Publishing is structurally reserved for a tourism-specific workflow. Milestone 1 does not send demonstration data to production.", bg=PANEL, fg=MUTED, font=("Segoe UI", 10), wraplength=760, justify="left").pack(anchor="w", pady=(8, 24))
        button = self._button(page, "PUBLISH WORKFLOW — LATER MILESTONE", lambda: None)
        button.configure(state="disabled")
        button.pack(anchor="w")

    def _build_settings(self) -> None:
        page = self.pages["SETTINGS"]
        tk.Label(page, text="PRODUCT IDENTITY", bg=PANEL, fg=CREAM, font=("Georgia", 18, "bold")).pack(anchor="w")
        for value in (f"Application: Things To Do Machine", f"Application ID: {APP_ID}", "Storage: AGGITS Things To Do Machine", "Executable: ThingsToDoMachine.exe"):
            tk.Label(page, text=value, bg=PANEL, fg=MUTED, font=("Consolas", 10)).pack(anchor="w", pady=5)

    def _load_values(self) -> None:
        for key, variable in self.destination_vars.items():
            variable.set(str(self.config_data["destination"].get(key, "")))
        self.ticker_text.delete("1.0", "end")
        self.ticker_text.insert("1.0", "\n".join(self.config_data.get("tickerFacts", [])))
        defaults = {"headerImage": "", "cabinetAsset": "public/tourism-machine/bendigo-tourism-cabinet-reference.jpg", "iconAsset": "desktop/things-to-do-machine.ico"}
        visuals = self.config_data.setdefault("visuals", defaults)
        for key, variable in self.visual_vars.items():
            variable.set(str(visuals.get(key, defaults[key])))
        self._refresh_discoveries()

    def _collect(self) -> dict:
        destination = self.config_data["destination"]
        for key, variable in self.destination_vars.items():
            destination[key] = variable.get().strip()
        self.config_data["tickerFacts"] = [line.strip() for line in self.ticker_text.get("1.0", "end").splitlines() if line.strip()]
        self.config_data["visuals"] = {key: variable.get().strip() for key, variable in self.visual_vars.items()}
        return validate_config(self.config_data)

    def _mark_dirty(self) -> None:
        self.status.configure(text="UNSAVED TOURISM CHANGES", fg=WARN)

    def _save(self) -> None:
        try:
            target = save_draft(self._collect())
        except ValueError as error:
            messagebox.showerror("Things To Do Machine", str(error))
            return
        self.status.configure(text=f"SAVED · {target}", fg=GOOD)

    def _refresh_discoveries(self) -> None:
        self.discovery_list.delete(0, "end")
        for item in self.config_data.get("discoveries", []):
            self.discovery_list.insert("end", f"{item['category']:<9}  {item['name']}")

    def _discovery_dialog(self, item: dict | None = None) -> dict | None:
        dialog = tk.Toplevel(self)
        dialog.title("Tourism Discovery")
        dialog.configure(bg=PANEL)
        dialog.geometry("560x420")
        dialog.transient(self)
        dialog.grab_set()
        values = item.copy() if item else {"category": "SEE"}
        entries: dict[str, tk.StringVar] = {}
        for row, (label, key) in enumerate((("NAME", "name"), ("CATEGORY", "category"), ("SHORT DESCRIPTION", "shortDescription"), ("WEBSITE URL", "websiteUrl"), ("MAP URL", "mapUrl"))):
            tk.Label(dialog, text=label, bg=PANEL, fg=BRASS_LIGHT, font=("Segoe UI", 8, "bold")).grid(row=row * 2, column=0, sticky="w", padx=24, pady=(12, 2))
            variable = tk.StringVar(value=str(values.get(key, "")))
            entries[key] = variable
            if key == "category":
                control = ttk.Combobox(dialog, textvariable=variable, values=TOURISM_CATEGORIES, state="readonly")
            else:
                control = tk.Entry(dialog, textvariable=variable, bg=PANEL_ALT, fg=CREAM, insertbackground=CREAM, relief="flat")
            control.grid(row=row * 2 + 1, column=0, sticky="ew", padx=24, ipady=7)
        dialog.columnconfigure(0, weight=1)
        result: list[dict] = []
        def accept() -> None:
            name = entries["name"].get().strip()
            if not name:
                return
            updated = values.copy()
            updated.update({key: variable.get().strip() for key, variable in entries.items()})
            updated["id"] = updated.get("id") or slugify(name)
            updated.setdefault("longDescription", "Tourism discovery draft.")
            updated.setdefault("image", "../assets/tourism-machine/bendigo-tourism-cabinet-reference.jpg")
            updated.setdefault("address", "")
            updated.setdefault("locality", self.destination_vars["name"].get().strip())
            updated.setdefault("region", self.destination_vars["region"].get().strip())
            updated.setdefault("latitude", 0)
            updated.setdefault("longitude", 0)
            updated.setdefault("distanceKm", 0)
            updated.setdefault("hours", "Check current details")
            updated.setdefault("tags", [])
            updated.setdefault("source", "Desktop draft")
            updated.setdefault("lastVerified", None)
            result.append(updated)
            dialog.destroy()
        self._button(dialog, "SAVE DISCOVERY", accept, accent=True).grid(row=11, column=0, sticky="e", padx=24, pady=20)
        self.wait_window(dialog)
        return result[0] if result else None

    def _add_discovery(self) -> None:
        item = self._discovery_dialog()
        if item:
            self.config_data["discoveries"].append(item)
            self._refresh_discoveries(); self._mark_dirty()

    def _edit_discovery(self) -> None:
        selection = self.discovery_list.curselection()
        if not selection:
            return
        index = selection[0]
        item = self._discovery_dialog(self.config_data["discoveries"][index])
        if item:
            self.config_data["discoveries"][index] = item
            self._refresh_discoveries(); self._mark_dirty()

    def _remove_discovery(self) -> None:
        selection = self.discovery_list.curselection()
        if not selection:
            return
        index = selection[0]
        if messagebox.askyesno("Remove discovery", f"Remove {self.config_data['discoveries'][index]['name']} from this tourism draft?"):
            self.config_data["discoveries"].pop(index)
            self._refresh_discoveries(); self._mark_dirty()

    def _browse_visual(self, key: str) -> None:
        value = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.webp"), ("All files", "*.*")])
        if value:
            self.visual_vars[key].set(value); self._mark_dirty()

    def _preview(self) -> None:
        self._save()
        if getattr(sys, "frozen", False):
            webbrowser.open(PAGES_PREVIEW)
            self.status.configure(text="OPENED PUBLISHED TOURISM ROUTE", fg=GOOD)
            return
        node = shutil.which("node")
        if not node:
            messagebox.showerror("Tourism preview", "Node.js is required to rebuild the local tourism preview.")
            return
        process = subprocess.run([node, "--experimental-strip-types", "scripts/build-github-pages.mjs"], cwd=ROOT, capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if process.returncode:
            messagebox.showerror("Tourism preview", process.stderr or process.stdout)
            return
        if self.preview_server is None:
            try:
                self.preview_server, preview_url = start_preview_server(ROOT / "github-pages")
            except OSError:
                preview_url = "http://127.0.0.1:4173/cosmic-aquarium/tourism/"
        else:
            preview_url = "http://127.0.0.1:4173/cosmic-aquarium/tourism/"
        webbrowser.open(preview_url)
        self.status.configure(text="TOURISM PREVIEW BUILT", fg=GOOD)

    def _close(self) -> None:
        try:
            save_draft(self._collect())
        except ValueError:
            pass
        if self.preview_server is not None:
            self.preview_server.shutdown()
        self.destroy()


def main() -> None:
    set_windows_identity()
    ThingsToDoMachineApp().mainloop()


if __name__ == "__main__":
    main()
