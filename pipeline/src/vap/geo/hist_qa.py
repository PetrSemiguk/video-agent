"""Check historical layers against well-known facts, river borders and land coverage.

uv run python -m vap.geo.hist_qa  ->  docs/reports/1.7/accuracy.json, rivers.json, coverage.json

Places answer "who holds this city"; rivers answer "does this border follow the channel".
These are spot checks against common knowledge, not an accuracy certificate.
"""

from __future__ import annotations

import json
import re
import statistics
import sys

import numpy as np
import shapely
from shapely.geometry import Point, shape

from .extract import PROCESSED_DIR, _to_lonlat, _to_merc
from .hist import EVIDENCE
from .paths import PLATES_DIR

EUROPE = "europe"
CHINA = "china-east-hs05"
# (place, lon, lat, regex the holder's name must match; "!" means it must not match)
FACTS_1914 = [
    ("Strasbourg (Alsace)", 7.75, 48.58, "German"),
    ("Metz (Lorraine)", 6.18, 49.12, "German"),
    ("Warsaw (Congress Poland)", 21.01, 52.23, "Russia"),
    ("Sarajevo (Bosnia)", 18.41, 43.86, "Austria"),
    ("Krakow (Galicia)", 19.94, 50.06, "Austria"),
    ("Belgrade", 20.46, 44.82, "Serbia"),
    ("Bucharest", 26.10, 44.43, "Romania"),
    ("Sofia", 23.32, 42.70, "Bulgaria"),
    ("Constantinople", 28.98, 41.01, "Ottoman"),
    ("Paris", 2.35, 48.86, "France|French"),
    ("Dublin", -6.26, 53.35, "United Kingdom|Brit"),
]
FACTS_1815 = [
    ("Warsaw", 21.01, 52.23, "Poland|Russia"),
    ("Oslo (union with Sweden)", 10.75, 59.91, "Sweden|Norway"),
    ("Munich", 11.58, 48.14, "Bavaria"),
    ("Stuttgart", 9.18, 48.78, "Württemberg|Wurttemberg"),
    ("Dresden", 13.74, 51.05, "Saxony"),
    ("Berlin", 13.40, 52.52, "Prussia"),
    ("Frankfurt", 8.68, 50.11, "Frankfurt|Frankfur"),
    ("Weimar", 11.33, 50.98, "Weimar"),
    ("Vienna", 16.37, 48.21, "Austria"),
    ("Milan", 9.19, 45.46, "Austria"),
    ("Paris", 2.35, 48.86, "France"),
]
FACTS_1644 = [
    ("Beijing", 116.40, 39.90, "Qing"),
    ("Mukden", 123.43, 41.80, "Qing"),
    ("Nanjing (south not yet Qing)", 118.78, 32.06, "!Qing"),
    ("Guangzhou (south not yet Qing)", 113.26, 23.13, "!Qing"),
    ("Xi'an (Shun, not Qing)", 108.94, 34.34, "!Qing"),
    ("Seoul", 126.98, 37.57, "Joseon"),
]
FACTS_560 = [
    ("Chang'an", 108.94, 34.34, "Northern Zhou"),
    ("Chengdu (Sichuan)", 104.07, 30.57, "Northern Zhou"),
    ("Ye (northeast)", 114.35, 36.30, "Northern Qi"),
    ("Jinyang", 112.55, 37.87, "Northern Qi"),
    ("Jiankang (south of the Yangtze)", 118.78, 32.06, "Chen"),
    ("Jiangling (Western Liang)", 112.19, 30.35, "Western Liang"),
]
FACTS_590 = [
    ("Chang'an", 108.94, 34.34, "Sui"),
    ("Jiankang (Chen fell in 589)", 118.78, 32.06, "Sui"),
    ("Guangzhou", 113.26, 23.13, "Sui"),
    ("Chengdu", 104.07, 30.57, "Sui"),
]
LAYERS = {
    "europe-1914": (EUROPE, FACTS_1914),
    "europe-1914-cliopatria": (EUROPE, FACTS_1914),
    "europe-1815": (EUROPE, FACTS_1815),
    "europe-1815-cliopatria": (EUROPE, FACTS_1815),
    "china-1644": (CHINA, FACTS_1644),
    "china-1644-cliopatria": (CHINA, FACTS_1644),
    "china-1645-cliopatria": (CHINA, FACTS_1644),
    "china-560-cliopatria": (CHINA, FACTS_560),
    "china-561-cliopatria": (CHINA, FACTS_560),
    "china-560": (CHINA, FACTS_560),
    "china-590-cliopatria": (CHINA, FACTS_590),
    "china-592-cliopatria": (CHINA, FACTS_590),
}
# Land covered before CC BY ways were allowed: docs/reports/1.6.md.
COVERED_BEFORE = {"europe-1914": 0.3073, "europe-1815": 0.3513, "china-1644": 0.8708}
# (layer, polity a, polity b, Natural Earth river)
RIVER_BORDERS = [
    ("europe-1914", "Kingdom of Romania", "Tsardom of Bulgaria", "Danube"),
    ("europe-1914", "Kingdom of Serbia", "Austria-Hungary", "Danube"),
    ("europe-1914", "Kingdom of Romania", "Russian Empire", "Prut"),
    ("europe-1914", "Austria-Hungary", "Russian Empire", "Dniester"),
]
NEAR_RIVER_KM = 15.0
CHANNEL_KM = 5.0
SAMPLE_M = 2000.0
BORDER_WIDTH_PX = 3.0


def load(plate: str, slug: str) -> dict:
    return json.loads(
        (PROCESSED_DIR / plate / "historical" / f"{slug}.geojson").read_text(encoding="utf-8")
    )


def verdict(expected: str, holders: list[str]) -> str:
    if not holders:
        return "no polity"
    if expected.startswith("!"):
        wrong = any(re.search(expected[1:], name) for name in holders)
        return "differs" if wrong else "ok"
    return "ok" if any(re.search(expected, name) for name in holders) else "differs"


def check_places(slug: str) -> list[dict]:
    plate, facts = LAYERS[slug]
    polities = [
        (f["properties"]["name_en"], shape(f["geometry"])) for f in load(plate, slug)["features"]
    ]
    rows = []
    for place, lon, lat, expected in facts:
        point = Point(lon, lat)
        holders = [name for name, geom in polities if geom.covers(point)]
        rows.append(
            {
                "layer": slug,
                "place": place,
                "expected": expected,
                "found": holders,
                "status": verdict(expected, holders),
            }
        )
    return rows


def coverage(slug: str, places: list[dict]) -> dict:
    plate = LAYERS[slug][0]
    report = json.loads(
        (PROCESSED_DIR / plate / "historical" / f"{slug}.report.json").read_text(encoding="utf-8")
    )
    mine = [row for row in places if row["layer"] == slug]
    return {
        "layer": slug,
        "features": report["qa"]["features"],
        "land_covered": report["qa"]["land_covered"],
        "land_covered_before_cc_by": COVERED_BEFORE.get(slug),
        "overlap_kinds": report["qa"]["overlap_kinds"],
        "facts_ok": sum(row["status"] == "ok" for row in mine),
        "facts_checked": len(mine),
    }


def river_distance(a, b, river, pixel: float) -> dict:
    """Distances from the stretch of the a|b border that runs along the river, to the river.

    Mercator metres are scaled by the latitude of the river, so kilometres are real ones.
    """
    lat = shapely.transform(river.centroid, _to_lonlat).y
    scale = float(np.cos(np.radians(lat)))
    meeting = a.boundary.intersection(b.buffer(pixel * BORDER_WIDTH_PX))
    near = meeting.intersection(river.buffer(NEAR_RIVER_KM * 1000 / scale))
    if near.is_empty or not near.length:
        return {"border_along_river_km": 0.0, "note": "the polities do not meet along this river"}
    samples = np.concatenate(
        [
            shapely.get_coordinates(
                shapely.line_interpolate_point(part, np.arange(0, part.length, SAMPLE_M))
            )
            for part in shapely.get_parts(near)
            if part.length
        ]
    )
    distances = shapely.distance(shapely.points(samples), river) * scale
    return {
        "border_along_river_km": round(near.length * scale / 1000),
        "median_km": round(statistics.median(distances.tolist()) / 1000, 2),
        "p95_km": round(float(np.percentile(distances, 95)) / 1000, 2),
        "median_plate_px": round(statistics.median(distances.tolist()) / scale / pixel, 2),
        f"share_within_{CHANNEL_KM:.0f}km": round(
            float(np.mean(distances <= CHANNEL_KM * 1000)), 3
        ),
    }


def check_rivers() -> list[dict]:
    rows = []
    for slug, name_a, name_b, river_name in RIVER_BORDERS:
        plate = LAYERS[slug][0]
        meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
        polities = {
            f["properties"]["name_en"]: shapely.transform(shape(f["geometry"]), _to_merc)
            for f in load(plate, slug)["features"]
        }
        rivers = json.loads((PROCESSED_DIR / plate / "rivers.geojson").read_text(encoding="utf-8"))
        river = shapely.union_all(
            [
                shapely.transform(shape(f["geometry"]), _to_merc)
                for f in rivers["features"]
                if river_name in (f["properties"].get("name_en") or "")
            ]
        )
        row = {"layer": slug, "a": name_a, "b": name_b, "river": river_name}
        rows.append(
            row | river_distance(polities[name_a], polities[name_b], river, meta["pixel_size_m"])
        )
    return rows


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    places = [row for slug in LAYERS for row in check_places(slug)]
    rivers = check_rivers()
    table = [coverage(slug, places) for slug in LAYERS]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for name, rows in (("accuracy", places), ("rivers", rivers), ("coverage", table)):
        (EVIDENCE / f"{name}.json").write_text(
            json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    for row in places:
        print(f"{row['layer']:24} {row['status']:9} {row['place']:34} {row['found']}")
    for row in [*table, *rivers]:
        print(row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
