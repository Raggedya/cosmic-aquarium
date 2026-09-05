"""Validate one completed bulk batch and sample live Bandcamp playability."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from bulk_library_status import bandcamp_host, normalized_name
from create_artist import fetch_page
from daily_discovery import canonical_bandcamp_url
from water_classifier import WATERS


ROOT = Path(__file__).resolve().parents[1]


def load_state(batch_id: str) -> dict:
    folder = "dry-runs" if batch_id.endswith("-dry-run") else "batches"
    path = ROOT / "automation" / "bulk" / folder / f"{batch_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def audit_state(state: dict, network_sample: int = 25) -> dict:
    accepted = list(state.get("accepted") or [])
    target = int(state.get("targetAccepted") or 0)
    errors: list[str] = []
    if state.get("status") != "complete" or len(accepted) != target:
        errors.append(f"batch is not complete: {len(accepted)} / {target}")
    fields = {
        "hosts": [bandcamp_host(item.get("bandcampUrl")) for item in accepted],
        "bandIds": [str(item.get("identityBandId") or "") for item in accepted],
        "names": [normalized_name(item.get("artist")) for item in accepted],
        "releases": [canonical_bandcamp_url(str(item.get("bandcampUrl") or "")) for item in accepted],
    }
    for label, values in fields.items():
        usable = [value for value in values if value]
        if len(usable) != len(accepted):
            errors.append(f"{label} contains missing values")
        if len(set(usable)) != len(usable):
            errors.append(f"{label} contains duplicates")
    for item in accepted:
        artist = str(item.get("artist") or item.get("candidateId") or "unknown")
        if item.get("identityVerified") is not True or item.get("identityIsLabel") is not False:
            errors.append(f"{artist}: canonical artist identity is not verified")
        if int(item.get("trackCount") or 0) < 1:
            errors.append(f"{artist}: no playable track")
        if not str(item.get("bioShort") or "").strip() or item.get("bioSource") not in {"bandcamp-description", "metadata-derived"}:
            errors.append(f"{artist}: missing ticker biography")
        waters = set(item.get("waters") or [])
        if not waters or not waters.issubset(set(WATERS)):
            errors.append(f"{artist}: invalid water classification")
    rng = random.Random(str(state.get("id") or "bulk"))
    sample = rng.sample(accepted, min(max(0, network_sample), len(accepted)))
    live_results = []
    for item in sample:
        url = str(item.get("bandcampUrl") or "")
        try:
            parser, final_url = fetch_page(url)
            playable = any(
                str(track.get("track_id") or "").isdigit()
                for payload in parser.tralbum
                for track in (payload.get("trackinfo") or [])
                if isinstance(track, dict)
            )
            live_results.append({"artist": item.get("artist"), "url": final_url, "playable": playable})
            if not playable:
                errors.append(f"{item.get('artist')}: live sample has no playable track")
        except Exception as error:
            live_results.append({"artist": item.get("artist"), "url": url, "playable": False, "error": str(error)[:240]})
            errors.append(f"{item.get('artist')}: live sample failed")
    return {
        "batchId": state.get("id"), "accepted": len(accepted), "target": target,
        "structuralChecks": "PASS" if not errors else "FAIL", "networkSampleSize": len(sample),
        "liveResults": live_results, "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--network-sample", type=int, default=25)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit_state(load_state(args.batch_id), max(0, min(50, args.network_sample)))
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if report["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
