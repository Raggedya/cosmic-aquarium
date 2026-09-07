from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
import tkinter as tk
from tkinter import messagebox


INK = "#100906"
PANEL = "#25130d"
PAPER = "#fff3d3"
MUTED = "#bda885"
BRASS = "#b98439"
BURGUNDY = "#6f1423"


def resource_path(relative: str) -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / relative


def installation_directory() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    return base / "Programs" / "AGGITS Artist Machine Factory"


def create_shortcuts(executable: Path) -> None:
    escaped_target = str(executable).replace("'", "''")
    escaped_directory = str(executable.parent).replace("'", "''")
    script = (
        "$shell=New-Object -ComObject WScript.Shell;"
        "$start=$shell.CreateShortcut($env:APPDATA+'\\Microsoft\\Windows\\Start Menu\\Programs\\AGGITS Artist Machine Factory.lnk');"
        f"$start.TargetPath='{escaped_target}';"
        f"$start.WorkingDirectory='{escaped_directory}';"
        "$start.Save();"
        "$desktop=$shell.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\AGGITS Artist Machine Factory.lnk');"
        "$desktop.TargetPath=$start.TargetPath;$desktop.WorkingDirectory=$start.WorkingDirectory;$desktop.Save()"
    )
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


class FactoryInstaller(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Install AGGITS Artist Machine Factory")
        self.geometry("600x410")
        self.resizable(False, False)
        self.configure(bg=INK)

        frame = tk.Frame(self, bg=PANEL, highlightbackground="#5c341d", highlightthickness=1)
        frame.pack(fill="both", expand=True, padx=24, pady=24)
        tk.Label(frame, text="AGGITS", bg=PANEL, fg=BRASS, font=("Georgia", 30, "bold")).pack(pady=(42, 4))
        tk.Label(frame, text="ARTIST MACHINE FACTORY", bg=PANEL, fg=PAPER, font=("Segoe UI Semibold", 17)).pack()
        tk.Label(
            frame,
            text="Install the private Factory dashboard on this Windows desktop.\nA desktop shortcut and Start Menu entry will be created.",
            bg=PANEL,
            fg=MUTED,
            font=("Segoe UI", 10),
            justify="center",
        ).pack(pady=(18, 28))
        self.status = tk.Label(frame, text="READY TO INSTALL", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 9))
        self.status.pack(pady=(0, 11))
        self.button = tk.Button(
            frame,
            text="INSTALL FACTORY DASHBOARD",
            command=self.install,
            bg=BURGUNDY,
            fg=PAPER,
            activebackground="#a73648",
            activeforeground=PAPER,
            relief="flat",
            bd=0,
            cursor="hand2",
            font=("Segoe UI Semibold", 10),
            padx=28,
            pady=14,
        )
        self.button.pack()

    def install(self) -> None:
        self.button.configure(state="disabled")
        self.status.configure(text="INSTALLING…", fg=BRASS)
        self.update_idletasks()
        try:
            source = resource_path("payload/AGGITS Artist Machine Factory.exe")
            if not source.is_file():
                raise RuntimeError("The dashboard payload is missing from this installer.")
            destination_dir = installation_directory()
            destination_dir.mkdir(parents=True, exist_ok=True)
            destination = destination_dir / "AGGITS Artist Machine Factory.exe"
            temporary = destination_dir / ".AGGITS Artist Machine Factory.installing.exe"
            shutil.copy2(source, temporary)
            temporary.replace(destination)
            create_shortcuts(destination)
            self.status.configure(text="INSTALLED", fg="#b7d79a")
            self.update_idletasks()
            subprocess.Popen([str(destination)], cwd=destination_dir)
            messagebox.showinfo("Installation complete", "AGGITS Artist Machine Factory is installed and ready.")
            self.destroy()
        except Exception as error:
            self.button.configure(state="normal")
            self.status.configure(text="INSTALLATION PAUSED", fg="#e89a9f")
            messagebox.showerror("Installation paused", str(error))


if __name__ == "__main__":
    if "--smoke-test" in sys.argv:
        payload = resource_path("payload/AGGITS Artist Machine Factory.exe")
        if not payload.is_file() or payload.stat().st_size < 1_000_000:
            raise RuntimeError("Packaged Factory dashboard payload is missing")
        print(payload)
    else:
        FactoryInstaller().mainloop()
