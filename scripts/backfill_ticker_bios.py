"""Backfill factual ticker biographies without overwriting curated metadata."""

from __future__ import annotations

import json
from pathlib import Path

from create_artist import metadata_bio


ROOT = Path(__file__).resolve().parents[1]
ARTISTS = ROOT / "github-pages" / "artists"


def backfill(artists_dir: Path = ARTISTS) -> dict[str, int]:
    counts = {"examined": 0, "updated": 0, "alreadyPresent": 0, "failed": 0}
    for path in sorted(artists_dir.glob("*.json")):
        counts["examined"] += 1
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
            if str(manifest.get("bioShort") or "").strip():
                counts["alreadyPresent"] += 1
                continue
            bio = metadata_bio(
                str(manifest.get("artist") or path.stem),
                list(manifest.get("metadataTags") or []),
                list(manifest.get("waters") or []),
                str(manifest.get("primaryLocation") or ""),
            )
            if not bio:
                raise ValueError("metadata fallback did not produce a biography")
            manifest["bioShort"] = bio
            manifest["bioSource"] = "metadata-derived"
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            temporary.replace(path)
            counts["updated"] += 1
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            counts["failed"] += 1
    return counts


if __name__ == "__main__":
    print(json.dumps(backfill(), indent=2))
