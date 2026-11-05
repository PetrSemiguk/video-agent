"""Check extracted historical layers against well-known facts and river borders.

uv run python -m vap.geo.hist_qa  ->  docs/reports/1.6/accuracy.json, rivers.json

Places answer "who holds this city", rivers answer "does this border follow the channel".
These are spot checks of OHM against common knowledge, not an accuracy certificate.
"""

from __future__ import annotations

import json
import statistics
import sys

import numpy as np
import shapely
from shapely.geometry import Point, shape

from .extract import PROCESSED_DIR, _clean_polygonal, _to_lonlat, _to_merc
from .hist import EVIDENCE, _load_land, dated_states
from .hist_backends import relations_in_plate, with_geometry
from .paths import PLATES_DIR

EUROPE = "europe"
CHINA = "china-east-hs05"
DATES = {"europe-1914": "1914-07-01", "europe-1815": "1815-07-01", "china-1644": "1644-07-01"}
# slug: (plate, [(place, lon, lat, expected polity substring or None for a known gap)])
PLACES = {
    "europe-1914": (
        EUROPE,
        [
            ("Strasbourg (Alsace)", 7.75, 48.58, "German"),
            ("Metz (Lorraine)", 6.18, 49.12, "German"),
            ("Warsaw (Congress Poland)", 21.01, 52.23, "Russian"),
            ("Lodz (Congress Poland)", 19.46, 51.76, "Russian"),
            ("Sarajevo (Bosnia)", 18.41, 43.86, "Austria"),
            ("Mostar (Herzegovina)", 17.81, 43.34, "Austria"),
            ("Krakow (Galicia)", 19.94, 50.06, "Austria"),
            ("Trieste", 13.77, 45.65, "Austria"),
            ("Belgrade", 20.46, 44.82, "Serbia"),
            ("Bucharest", 26.10, 44.43, "Romania"),
            ("Sofia", 23.32, 42.70, "Bulgaria"),
            ("Constantinople", 28.98, 41.01, "Ottoman"),
            ("Tirana", 19.82, 41.33, "Albania"),
            ("Dublin", -6.26, 53.35, "United Kingdom"),
            ("Oslo", 10.75, 59.91, "Norway"),
        ],
    ),
    "europe-1815": (
        EUROPE,
        [
            ("Warsaw", 21.01, 52.23, "Poland"),
            ("Krakow", 19.94, 50.06, "Cracow"),
            ("Oslo (union with Sweden)", 10.75, 59.91, "Sweden"),
            ("Stockholm", 18.07, 59.33, "Sweden"),
            ("Munich", 11.58, 48.14, "Bavaria"),
            ("Stuttgart", 9.18, 48.78, "Württemberg"),
            ("Dresden", 13.74, 51.05, "Saxony"),
            ("Hanover", 9.73, 52.37, "Hanover"),
            ("Berlin", 13.40, 52.52, "Prussia"),
            ("Frankfurt", 8.68, 50.11, "Frankfurt"),
            ("Weimar", 11.33, 50.98, "Weimar"),
            ("Gotha", 10.71, 50.95, "Gotha"),
            ("Kassel", 9.48, 51.32, "Hesse"),
            ("Vienna", 16.37, 48.21, "Austria"),
            ("Milan", 9.19, 45.46, "Austria"),
            ("Venice", 12.33, 45.44, "Austria"),
            ("Paris", 2.35, 48.86, "France"),
            ("Brussels", 4.35, 50.85, "Netherlands"),
            ("Naples", 14.25, 40.85, "Naples"),
            ("Rome", 12.48, 41.89, "Papal"),
            ("Kiel (Holstein)", 10.13, 54.32, "Denmark"),
            ("Copenhagen", 12.57, 55.68, "Denmark"),
        ],
    ),
    "china-1644": (
        CHINA,
        [
            ("Beijing", 116.40, 39.90, "Qing"),
            ("Mukden", 123.43, 41.80, "Qing"),
            ("Nanjing (Southern Ming)", 118.78, 32.06, "Ming"),
            ("Xi'an (Shun)", 108.94, 34.34, "Shun"),
            ("Seoul", 126.98, 37.57, "Joseon"),
            ("Kyoto", 135.77, 35.01, "Tokugawa"),
            ("Lhasa", 91.11, 29.65, "Khoshut"),
        ],
    ),
}
# (slug, polity a, polity b, Natural Earth river)
RIVER_BORDERS = [
    ("europe-1914", "Kingdom of Romania", "Tsardom of Bulgaria", "Danube"),
    ("europe-1914", "Kingdom of Serbia", "Austria-Hungary", "Danube"),
    ("europe-1914", "Kingdom of Romania", "Russian Empire", "Danube"),
    ("europe-1914", "Kingdom of Romania", "Russian Empire", "Prut"),
    ("europe-1914", "Austria-Hungary", "Russian Empire", "Dniester"),
    ("europe-1914", "Kingdom of Romania", "Russian Empire", "Dniester"),
]
NEAR_RIVER_KM = 15.0
CHANNEL_KM = 5.0
SAMPLE_M = 2000.0
BORDER_WIDTH_PX = 3.0


def layer_names(plate: str, slug: str) -> set[str]:
    path = PROCESSED_DIR / plate / "historical" / f"{slug}.geojson"
    collection = json.loads(path.read_text(encoding="utf-8"))
    return {f["properties"]["name_en"] for f in collection["features"]}


def all_states(slug: str) -> dict:
    """Every state on the date with its geometry from the Overpass cache, in or out of the
    layer. Excluded polygons are only read here: never written, committed or rendered."""
    meta = json.loads((PLATES_DIR / f"{PLACES[slug][0]}.json").read_text(encoding="utf-8"))
    states, _, _ = dated_states(relations_in_plate(meta), DATES[slug])
    out = {}
    for candidate in states:
        filled = with_geometry(candidate)
        if filled.geometry:
            name = filled.tags.get("name:en") or filled.tags.get("name")
            out[name] = shape(filled.geometry)
    return out


def check_places(slug: str) -> list[dict]:
    plate, places = PLACES[slug]
    polities = all_states(slug)
    in_layer = layer_names(plate, slug)
    rows = []
    for place, lon, lat, expected in places:
        point = Point(lon, lat)
        holders = [name for name, geom in polities.items() if geom.covers(point)]
        match = [name for name in holders if expected in name]
        if not holders:
            status = "no assembled polygon in OHM"
        elif not match:
            status = "differs from common knowledge"
        elif any(name in in_layer for name in match):
            status = "ok, in layer"
        else:
            status = "ok in OHM, excluded from layer"
        rows.append(
            {"slug": slug, "place": place, "expected": expected, "ohm": holders, "status": status}
        )
    return rows


def land_coverage(slug: str) -> dict:
    """Share of the plate's land a layer covers now, and with every assembled polygon."""
    plate = PLACES[slug][0]
    meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
    land = _load_land(meta)
    every = shapely.transform(
        _clean_polygonal(shapely.union_all(list(all_states(slug).values()))), _to_merc
    )
    report = json.loads(
        (PROCESSED_DIR / plate / "historical" / f"{slug}.report.json").read_text(encoding="utf-8")
    )
    return {
        "slug": slug,
        "layer_land_covered": report["qa"]["land_covered"],
        "all_assembled_land_covered": round(float(every.intersection(land).area / land.area), 4),
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
    close = float(np.mean(distances <= CHANNEL_KM * 1000))
    return {
        "border_along_river_km": round(near.length * scale / 1000),
        "median_km": round(statistics.median(distances.tolist()) / 1000, 2),
        "p95_km": round(float(np.percentile(distances, 95)) / 1000, 2),
        "median_plate_px": round(statistics.median(distances.tolist()) / scale / pixel, 2),
        "p95_plate_px": round(float(np.percentile(distances, 95)) / scale / pixel, 2),
        f"share_within_{CHANNEL_KM:.0f}km": round(close, 3),
    }


def check_rivers() -> list[dict]:
    rows = []
    for slug, name_a, name_b, river_name in RIVER_BORDERS:
        plate = PLACES[slug][0]
        meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
        pixel = meta["pixel_size_m"]
        polities = {
            name: shapely.transform(geom, _to_merc) for name, geom in all_states(slug).items()
        }
        in_layer = layer_names(plate, slug)
        rivers = json.loads((PROCESSED_DIR / plate / "rivers.geojson").read_text(encoding="utf-8"))
        parts = [
            shapely.transform(shape(f["geometry"]), _to_merc)
            for f in rivers["features"]
            if river_name in (f["properties"].get("name_en") or "")
        ]
        row = {
            "slug": slug,
            "a": name_a,
            "b": name_b,
            "river": river_name,
            "both_in_layer": name_a in in_layer and name_b in in_layer,
        }
        if not parts:
            rows.append(row | {"note": "river not in the plate's Natural Earth layer"})
            continue
        river = shapely.union_all(parts)
        rows.append(row | river_distance(polities[name_a], polities[name_b], river, pixel))
    return rows


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    places = [row for slug in PLACES for row in check_places(slug)]
    rivers = check_rivers()
    coverage = [land_coverage(slug) for slug in PLACES]
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for name, rows in (("accuracy", places), ("rivers", rivers), ("land-coverage", coverage)):
        (EVIDENCE / f"{name}.json").write_text(
            json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    for row in places:
        print(f"{row['slug']:12} {row['status']:24} {row['place']:28} {row['ohm']}")
    for row in [*rivers, *coverage]:
        print(row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
