from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

TOURISM_CATEGORIES = ("SEE", "DO", "EAT", "DRINK", "SHOP", "NATURE", "HISTORY", "WEIRD", "DAY_TRIP")
SCHEMA_VERSION = 1


def app_data_dir() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "AGGITS Things To Do Machine"


def slugify(value: str) -> str:
    import unicodedata

    normal = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normal.casefold()).strip("-")[:72]


def default_config(root: Path) -> dict[str, Any]:
    source = root / "data" / "tourism" / "bendigo.json"
    return json.loads(source.read_text(encoding="utf-8"))


def validate_config(value: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(value)
    destination = payload.get("destination") or {}
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("Unsupported tourism configuration version.")
    for field in ("name", "region", "state", "country", "machineTitle", "tagline"):
        if not str(destination.get(field) or "").strip():
            raise ValueError(f"Destination field '{field}' is required.")
    try:
        destination["radiusKm"] = max(1, float(destination.get("radiusKm") or 1))
    except (TypeError, ValueError) as error:
        raise ValueError("Radius must be a number greater than zero.") from error
    discoveries = payload.get("discoveries")
    if not isinstance(discoveries, list):
        raise ValueError("Discoveries must be a list.")
    seen: set[str] = set()
    for item in discoveries:
        if not isinstance(item, dict) or not str(item.get("id") or "").strip() or not str(item.get("name") or "").strip():
            raise ValueError("Every discovery needs an id and name.")
        if item["id"] in seen:
            raise ValueError(f"Duplicate discovery id: {item['id']}")
        if item.get("category") not in TOURISM_CATEGORIES:
            raise ValueError(f"Unsupported discovery category: {item.get('category')}")
        seen.add(item["id"])
    payload["destination"] = destination
    payload["tickerFacts"] = [str(item).strip() for item in payload.get("tickerFacts", []) if str(item).strip()]
    return payload


def load_draft(root: Path, path: Path | None = None) -> dict[str, Any]:
    target = path or app_data_dir() / "tourism-draft.json"
    if not target.exists():
        return default_config(root)
    try:
        return validate_config(json.loads(target.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return default_config(root)


def save_draft(value: dict[str, Any], path: Path | None = None) -> Path:
    payload = validate_config(value)
    target = path or app_data_dir() / "tourism-draft.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(target)
    return target
