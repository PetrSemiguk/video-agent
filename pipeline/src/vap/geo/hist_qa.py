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
# --- episode china-europe-unity (step 5.3b), on the east-asia and europe-wide plates ---
EAST_ASIA = "east-asia"
EUROPE_WIDE = "europe-wide"
# The -221 frame is the map BEFORE the unification: Cliopatria still has Qi in Shandong, because
# a frame can lag its event (docs/historical-sources.md). The episode uses it that way, as the
# seven states still separate, and cn-0215-qin-empire as the empire that follows. See the errata.
FACTS_CN_221BC = [
    ("Xianyang/Xi'an", 108.94, 34.34, "Qin"),
    ("Linzi area / Shandong (Qi not yet taken)", 118.30, 36.80, "Qi"),
    ("Jiangling (Chu)", 112.19, 30.35, "Qin"),
    ("Beijing (Yan, taken 222 BC)", 116.40, 39.90, "Qin"),
]
# Lingnan came in 214 BC, after the unification, so Guangzhou is still outside the empire.
FACTS_CN_215BC = [
    ("Xianyang/Xi'an", 108.94, 34.34, "Qin"),
    ("Linzi area / Shandong (now Qin)", 118.30, 36.80, "Qin"),
    ("Beijing (Yan)", 116.40, 39.90, "Qin"),
    ("Jiangling (Chu)", 112.19, 30.35, "Qin"),
    ("Chengdu (Shu)", 104.07, 30.57, "Qin"),
    ("Guangzhou (Lingnan not yet)", 113.26, 23.13, "!Qin"),
]
FACTS_CN_100 = [
    ("Chang'an", 108.94, 34.34, "Han"),
    ("Guangzhou", 113.26, 23.13, "Han"),
    ("Dunhuang (Hexi corridor)", 94.66, 40.14, "Han"),
    ("Steppe north of the Gobi", 106.92, 47.92, "Xiongnu"),
    ("Seoul", 126.98, 37.57, "Mahan"),
]
FACTS_CN_280 = [
    ("Luoyang", 112.45, 34.62, "Jin"),
    ("Chang'an", 108.94, 34.34, "Jin"),
    ("Nanjing (Wu)", 118.78, 32.06, "Wu"),
    ("Guangzhou (Wu)", 113.26, 23.13, "Wu"),
    ("Hangzhou (Wu)", 120.16, 30.29, "Wu"),
]
FACTS_CN_592 = [
    ("Chang'an", 108.94, 34.34, "Sui"),
    ("Nanjing (Chen fell 589)", 118.78, 32.06, "Sui"),
    ("Guangzhou", 113.26, 23.13, "Sui"),
    ("Chengdu", 104.07, 30.57, "Sui"),
]
FACTS_CN_745 = [
    ("Chang'an", 108.94, 34.34, "Tang"),
    ("Guangzhou", 113.26, 23.13, "Tang"),
    ("Kashgar (Western Regions)", 75.99, 39.47, "Tang"),
    ("Lhasa", 91.11, 29.65, "Tibet"),
    ("Mukden (Balhae)", 123.43, 41.80, "Balhae"),
]
# The Sixteen Prefectures, Beijing among them, were Liao's: the Song never held the north.
FACTS_CN_980 = [
    ("Kaifeng (Song capital)", 114.31, 34.80, "Song"),
    ("Guangzhou", 113.26, 23.13, "Song"),
    ("Beijing (Sixteen Prefectures)", 116.40, 39.90, "Liao"),
    ("Mukden", 123.43, 41.80, "Liao"),
]
FACTS_CN_1140 = [
    ("Kaifeng (lost 1127)", 114.31, 34.80, "Jin"),
    ("Luoyang", 112.45, 34.62, "Jin"),
    ("Hangzhou (Southern Song)", 120.16, 30.29, "Song"),
    ("Guangzhou", 113.26, 23.13, "Song"),
]
FACTS_CN_1310 = [
    ("Beijing (Dadu)", 116.40, 39.90, "Yuan"),
    ("Hangzhou", 120.16, 30.29, "Yuan"),
    ("Guangzhou", 113.26, 23.13, "Yuan"),
    ("Lhasa", 91.11, 29.65, "Yuan"),
    ("Steppe north of the Gobi", 106.92, 47.92, "Yuan"),
]
FACTS_CN_1400 = [
    ("Nanjing (early Ming capital)", 118.78, 32.06, "Ming"),
    ("Beijing", 116.40, 39.90, "Ming"),
    ("Guangzhou", 113.26, 23.13, "Ming"),
    ("Steppe (Northern Yuan)", 106.92, 47.92, "Northern Yuan"),
    ("Seoul", 126.98, 37.57, "Joseon"),
]
# 1645: Beijing has fallen, the south has not. The Southern Ming is the point of this frame.
FACTS_CN_1645 = [
    ("Beijing", 116.40, 39.90, "Qing"),
    ("Mukden", 123.43, 41.80, "Qing"),
    ("Nanjing (Southern Ming)", 118.78, 32.06, "Ming"),
    ("Guangzhou (Southern Ming)", 113.26, 23.13, "Ming"),
    ("Hangzhou (Southern Ming)", 120.16, 30.29, "Ming"),
]
FACTS_CN_1800 = [
    ("Beijing", 116.40, 39.90, "Qing"),
    ("Guangzhou", 113.26, 23.13, "Qing"),
    ("Kashgar (Xinjiang)", 75.99, 39.47, "Qing"),
    ("Lhasa (Tibet)", 91.11, 29.65, "Qing"),
    ("Steppe (Outer Mongolia)", 106.92, 47.92, "Qing"),
    ("Seoul (tributary, not ruled)", 126.98, 37.57, "!Qing"),
]
FACTS_EU_395 = [
    ("Rome", 12.50, 41.90, "Western Roman"),
    ("London", -0.13, 51.51, "Western Roman"),
    ("Paris", 2.35, 48.86, "Western Roman"),
    ("Cordoba", -4.78, 37.89, "Western Roman"),
    ("Kyiv (outside the empire)", 30.52, 50.45, "!Roman"),
]
# Justinian's reconquest: Italy is back, Gaul and Spain are not. A ribbon, not a block.
FACTS_EU_555 = [
    ("Rome", 12.50, 41.90, "Eastern Roman"),
    ("Milan", 9.19, 45.46, "Eastern Roman"),
    ("Paris (Franks)", 2.35, 48.86, "Frank"),
    ("Cordoba (Visigoths)", -4.78, 37.89, "Visigoth"),
    ("London (not Roman)", -0.13, 51.51, "!Roman"),
]
FACTS_EU_800 = [
    ("Aachen", 6.08, 50.78, "Frank|Carolingian"),
    ("Paris", 2.35, 48.86, "Frank|Carolingian"),
    ("Milan", 9.19, 45.46, "Frank|Carolingian"),
    ("Rome (Papal States)", 12.50, 41.90, "Papal"),
    ("Cordoba", -4.78, 37.89, "C.rdoba"),
]
FACTS_EU_1800S = [
    ("Berlin", 13.40, 52.52, "Prussia"),
    ("Munich", 11.58, 48.14, "Bavaria"),
    ("Vienna", 16.37, 48.21, "Austria"),
    ("Paris", 2.35, 48.86, "France"),
]
FACTS_EU_1914W = [
    ("Paris", 2.35, 48.86, "France|French"),
    ("Berlin", 13.40, 52.52, "German"),
    ("Vienna", 16.37, 48.21, "Austria"),
    ("Warsaw (Congress Poland)", 21.01, 52.23, "Russia"),
    ("London", -0.13, 51.51, "United Kingdom|Brit"),
]
LAYERS = {
    "cn-0221-qin": (EAST_ASIA, FACTS_CN_221BC),
    "cn-0215-qin-empire": (EAST_ASIA, FACTS_CN_215BC),
    "cn-0100-han": (EAST_ASIA, FACTS_CN_100),
    "cn-0280-division": (EAST_ASIA, FACTS_CN_280),
    "cn-0592-sui": (EAST_ASIA, FACTS_CN_592),
    "cn-0745-tang": (EAST_ASIA, FACTS_CN_745),
    "cn-0980-song-liao": (EAST_ASIA, FACTS_CN_980),
    "cn-1140-jin-southern-song": (EAST_ASIA, FACTS_CN_1140),
    "cn-1310-yuan": (EAST_ASIA, FACTS_CN_1310),
    "cn-1400-ming": (EAST_ASIA, FACTS_CN_1400),
    "cn-1645-qing": (EAST_ASIA, FACTS_CN_1645),
    "cn-1800-qing-peak": (EAST_ASIA, FACTS_CN_1800),
    "eu-0395-rome": (EUROPE_WIDE, FACTS_EU_395),
    "eu-0555-justinian": (EUROPE_WIDE, FACTS_EU_555),
    "eu-0800-carolingian": (EUROPE_WIDE, FACTS_EU_800),
    "eu-0850-verdun": (EUROPE_WIDE, FACTS_EU_800),
    "eu-1815-confederation": (EUROPE_WIDE, FACTS_EU_1800S),
    "eu-1914-ohm": (EUROPE_WIDE, FACTS_EU_1914W),
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
