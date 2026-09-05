"""Research Bandcamp metadata once and store concise ticker fields locally."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from create_artist import concise_bio, fetch_page, location_from_json_ld


ROOT = Path(__file__).resolve().parents[1]
MANIFESTS = ROOT / "github-pages" / "artists"


def enrich(limit: int = 0, delay: float = 0.35) -> dict[str, int]:
    counts = {"examined": 0, "updated": 0, "biosAdded": 0, "locationsAdded": 0, "failed": 0}
    files = sorted(MANIFESTS.glob("*.json"))
    if limit > 0:
        files = files[:limit]
    for manifest_path in files:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("bioShort") and manifest.get("primaryLocation"):
            continue
        counts["examined"] += 1
        try:
            parser, _ = fetch_page(str(manifest.get("bandcampUrl") or ""))
            bio = next((concise_bio((payload.get("current") or {}).get("about"), str(manifest.get("artist") or "")) for payload in parser.tralbum if concise_bio((payload.get("current") or {}).get("about"), str(manifest.get("artist") or ""))), "") or concise_bio(parser.og.get("og:description"), str(manifest.get("artist") or ""))
            location = location_from_json_ld(parser)
            changed = False
            if bio and not manifest.get("bioShort"):
                manifest["bioShort"] = bio
                counts["biosAdded"] += 1
                changed = True
            if location and not manifest.get("primaryLocation"):
                manifest["primaryLocation"] = location
                counts["locationsAdded"] += 1
                changed = True
            if changed:
                manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                counts["updated"] += 1
        except Exception:
            counts["failed"] += 1
        time.sleep(delay)
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay", type=float, default=0.35)
    options = parser.parse_args()
    print(json.dumps(enrich(options.limit, options.delay), indent=2))
