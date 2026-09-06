"""Build the Greater Melbourne locality model from authoritative Victorian data.

The 31 metropolitan LGAs follow the Victorian Government's Metropolitan
Melbourne definition. Locality names and polygon centroids come from Vicmap
Admin. This script is intentionally separate from the web build: refreshing
geography is an explicit, reviewable data operation, not a network dependency
during deployment.
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "automation" / "melbourne" / "greater-melbourne-geography.json"
SERVICE = "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Admin/FeatureServer"
USER_AGENT = "CosmicAquariaMelbourneGeography/1.0 (+https://github.com/Raggedya/cosmic-aquarium)"

# Victorian Government Metropolitan Melbourne: 31 LGAs.
METROPOLITAN_LGAS = (
    "BANYULE", "BAYSIDE", "BOROONDARA", "BRIMBANK", "CARDINIA", "CASEY",
    "DAREBIN", "FRANKSTON", "GLEN EIRA", "GREATER DANDENONG", "HOBSONS BAY",
    "HUME", "KINGSTON", "KNOX", "MANNINGHAM", "MARIBYRNONG", "MAROONDAH",
    "MELBOURNE", "MELTON", "MONASH", "MOONEE VALLEY", "MERRI-BEK",
    "MORNINGTON PENINSULA", "NILLUMBIK", "PORT PHILLIP", "STONNINGTON",
    "WHITEHORSE", "WHITTLESEA", "WYNDHAM", "YARRA", "YARRA RANGES",
)


def post_json(url: str, values: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(values).encode("utf-8"),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def inside_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1
            if x < crossing:
                inside = not inside
        previous = current
    return inside


def inside_polygon(x: float, y: float, rings: list[list[list[float]]]) -> bool:
    # ArcGIS polygon rings use the even/odd rule, including holes and islands.
    result = False
    for ring in rings:
        if inside_ring(x, y, ring):
            result = not result
    return result


def load_lgas() -> list[dict[str, Any]]:
    quoted = ",".join(f"'{name.replace(chr(39), chr(39) * 2)}'" for name in METROPOLITAN_LGAS)
    body = post_json(f"{SERVICE}/9/query", {
        "where": f"lga_name IN ({quoted})",
        "outFields": "lga_name,lga_official_name,abs_lga_code",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    })
    if body.get("error"):
        raise RuntimeError(body["error"])
    features = body.get("features", [])
    found = {feature.get("attributes", {}).get("lga_name") for feature in features}
    missing = set(METROPOLITAN_LGAS) - found
    if missing:
        raise RuntimeError(f"Vicmap response omitted metropolitan LGA(s): {sorted(missing)}")
    return features


def load_locality_centroids() -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    offset = 0
    while True:
        body = post_json(f"{SERVICE}/11/query", {
            "where": "1=1",
            "outFields": "locality_name,gazetted_locality_name",
            "returnGeometry": "false",
            "returnCentroid": "true",
            "outSR": "4326",
            "resultOffset": str(offset),
            "resultRecordCount": "2000",
            "orderByFields": "OBJECTID",
            "f": "json",
        })
        if body.get("error"):
            raise RuntimeError(body["error"])
        page = body.get("features", [])
        features.extend(page)
        if len(page) < 2000:
            return features
        offset += len(page)


def build() -> dict[str, Any]:
    lgas = load_lgas()
    localities: dict[str, dict[str, str]] = {}
    for feature in load_locality_centroids():
        centroid = feature.get("centroid") or {}
        if not isinstance(centroid.get("x"), (int, float)) or not isinstance(centroid.get("y"), (int, float)):
            continue
        matches = []
        for lga in lgas:
            if inside_polygon(float(centroid["x"]), float(centroid["y"]), lga.get("geometry", {}).get("rings", [])):
                matches.append(lga)
        if len(matches) != 1:
            continue
        attributes = feature.get("attributes", {})
        name = str(attributes.get("gazetted_locality_name") or attributes.get("locality_name") or "").strip()
        if not name:
            continue
        lga_attributes = matches[0].get("attributes", {})
        localities[name.casefold()] = {
            "name": name.title(),
            "lga": str(lga_attributes.get("lga_name") or "").title(),
            "absLgaCode": str(lga_attributes.get("abs_lga_code") or ""),
        }
    return {
        "schemaVersion": 1,
        "universe": "melbourne",
        "definition": "The 31 Local Government Areas identified by the Victorian Government as Metropolitan Melbourne.",
        "metropolitanLgas": [name.title() for name in METROPOLITAN_LGAS],
        "localityCount": len(localities),
        "localities": dict(sorted(localities.items())),
        "sources": [
            {
                "name": "Victorian Government — Metropolitan Melbourne",
                "url": "https://liveinmelbourne.vic.gov.au/discover/melbourne/metropolitan-melbourne",
            },
            {
                "name": "Vicmap Admin REST API — authoritative locality and LGA boundaries",
                "url": f"{SERVICE}",
            },
        ],
        "method": "Vicmap locality polygon centroid spatially joined to the 31 Metropolitan Melbourne LGA polygons.",
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def main() -> None:
    result = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "lgas": len(result["metropolitanLgas"]), "localities": result["localityCount"]}))


if __name__ == "__main__":
    main()
