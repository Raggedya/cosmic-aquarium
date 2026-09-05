"""Build short, iOS-safe impact samples from the project's CC0 glass recordings.

These are pre-rendered fallbacks for browsers that cannot reliably start a newly
decoded Web Audio graph during the first touch. The layered Web Audio version
remains the primary path elsewhere.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "audio" / "glass" / "source"
DESTINATION = ROOT / "public" / "audio" / "glass"


def ffmpeg_binary() -> str:
    configured = os.environ.get("COSMIC_FFMPEG")
    if configured:
        return configured
    discovered = shutil.which("ffmpeg")
    if discovered:
        return discovered
    bundled = Path("C:/Program Files/Jukebox Studio/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe")
    if bundled.exists():
        return str(bundled)
    raise RuntimeError("ffmpeg is required to rebuild the glass impact fallbacks")


def render(output: str, *, go: bool) -> None:
    duration = "1.18" if go else "0.88"
    plate_end = "5.75" if go else "5.52"
    filter_graph = (
        f"[0:a]atrim=start=5.00:end={plate_end},asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=6800,volume={'0.92' if go else '0.72'}[plate];"
        f"[1:a]atrim=start=0.10:end={'1.02' if go else '0.80'},asetpts=PTS-STARTPTS,highpass=f=520,volume={'1.12' if go else '1.0'}[shards];"
        f"[2:a]atrim=start=0.34:end={'1.36' if go else '1.02'},asetpts=PTS-STARTPTS,highpass=f=420,volume={'0.94' if go else '0.76'},adelay={'72' if go else '58'}|{'72' if go else '58'}[debris];"
        f"[3:a]atrim=start=0.26:end={'1.42' if go else '1.04'},asetpts=PTS-STARTPTS,highpass=f=950,volume={'0.92' if go else '0.78'},adelay={'258' if go else '205'}|{'258' if go else '205'}[settle];"
        f"[plate][shards][debris][settle]amix=inputs=4:duration=longest:normalize=0,acompressor=threshold=0.22:ratio=2.2:attack=2:release=85,volume=1.4,alimiter=limit=0.96,atrim=duration={duration},afade=t=out:st={'1.03' if go else '0.73'}:d=0.15[out]"
    )
    command = [
        ffmpeg_binary(), "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(SOURCE / "glass-plate-crunching.mp3"),
        "-i", str(SOURCE / "glass-shards-moved-07.mp3"),
        "-i", str(SOURCE / "glass-debris-014.mp3"),
        "-i", str(SOURCE / "picture-frame-shards.mp3"),
        "-filter_complex", filter_graph,
        "-map", "[out]", "-ac", "1", "-ar", "44100", "-b:a", "128k",
        str(DESTINATION / output),
    ]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    DESTINATION.mkdir(parents=True, exist_ok=True)
    render("glass-impact-mobile.mp3", go=False)
    render("glass-impact-go-mobile.mp3", go=True)
