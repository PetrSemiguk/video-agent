"""License-filtered historical state borders from OpenHistoricalMap.

uv run python -m vap.geo.hist probe --plate europe --date 1914-07-01 [--search "Bavaria"]
uv run python -m vap.geo.hist extract --plate europe --date 1914-07-01 --slug europe-1914

Dates use an inclusive start and an exclusive end. A state is a relation tagged
admin_level=2, boundary=administrative, type=boundary (see `state_exclusion`). Licenses are
checked on the relation and on every way of its geometry.
"""

from __future__ import annotations

import argparse
import calendar
import json
import math
import re
import sys
from collections import Counter

import httpx
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.strtree import STRtree

from .extract import (
    MIN_AREA_PX2,
    PROCESSED_DIR,
    TOLERANCE_PX,
    _clean_polygonal,
    _to_lonlat,
    _to_merc,
    mirror_to_public,
)
from .paths import PLATES_DIR, REPO_ROOT
from .vectors import features

CC0 = {
    "",
    "CC0",
    "CC0-1.0",
    "CC0 / public domain",
    "https://creativecommons.org/publicdomain/zero/1.0/",
}
REQUIRED = {
    "id",
    "name_en",
    "valid_from",
    "valid_to",
    "source",
    "source_ref",
    "license",
    "confidence",
    "approximate",
    "notes",
}
NESTED_SHARE = 0.9  # most of the smaller polity lies inside the larger one
SLIVER_SHARE = 0.02  # at most this share of the smaller polity: digitising differences
MIN_OVERLAP_KM2 = 1.0
PALETTE_SIZE = 8
COORDINATE_GRID = 1e-4  # ~11 m, the precision of the other committed layers
KM_PER_DEGREE = 111.0  # order of magnitude only, for describing a gap in a ring
EVIDENCE = REPO_ROOT / "docs" / "reports" / "1.6"


def date_key(value: str) -> tuple[int, int, int]:
    """Strict signed ISO date; year/month precision expands to the first day."""
    m = re.fullmatch(r"(-?\d+)(?:-(\d{2})(?:-(\d{2}))?)?", value)
    if not m:
        raise ValueError(f"ambiguous date: {value!r}")
    year, month, day = int(m[1]), int(m[2] or 1), int(m[3] or 1)
    if year == 0 or not 1 <= month <= 12:
        raise ValueError(f"invalid date: {value!r}")
    if not 1 <= day <= calendar.monthrange(year, month)[1]:
        raise ValueError(f"invalid date: {value!r}")
    return year, month, day


def iso(value: str) -> str:
    y, m, d = date_key(value)
    return f"{'-' if y < 0 else ''}{abs(y):04d}-{m:02d}-{d:02d}"


def license_ok(tags: dict) -> bool:
    return tags.get("license", "").strip() in CC0


def active(tags: dict, date: str) -> bool:
    start = date_key(tags["start_date"])
    end = date_key(tags["end_date"]) if tags.get("end_date") else None
    return start <= date_key(date) and (end is None or date_key(date) < end)


def state_exclusion(tags: dict) -> str | None:
    """Why a relation is not a state; parliamentary districts, zones and the like."""
    if tags.get("admin_level") != "2":
        return f"not a state: admin_level={tags.get('admin_level')}"
    if tags.get("boundary", "administrative") != "administrative":
        return f"not a state: boundary={tags['boundary']}"
    if tags.get("type", "boundary") != "boundary":
        return f"not a state: type={tags['type']}"
    return None


def validate(collection: dict) -> None:
    if collection.get("type") != "FeatureCollection":
        raise ValueError("expected FeatureCollection")
    ids = set()
    for f in collection["features"]:
        p = f["properties"]
        if REQUIRED - p.keys():
            raise ValueError(f"missing fields: {sorted(REQUIRED - p.keys())}")
        if p["id"] in ids or not p["id"] or not p["name_en"]:
            raise ValueError("empty or duplicate identity")
        ids.add(p["id"])
        if p["source"] not in {"ohm", "custom"}:
            raise ValueError("FORBIDDEN or unknown source (CShapes is NC)")
        if p["license"] not in {"CC0-1.0", "CC-BY-4.0"}:
            raise ValueError("unapproved license")
        if p["source"] == "ohm" and (
            p["license"] != "CC0-1.0"
            or not p["source_ref"].startswith("https://www.openhistoricalmap.org/relation/")
        ):
            raise ValueError("OHM provenance/license mismatch")
        if any(x in p["source_ref"].lower() for x in ("cshapes", "historical-basemaps")):
            raise ValueError("FORBIDDEN / REFERENCE ONLY provenance")
        if not isinstance(p["source_ref"], str) or not p["source_ref"].strip():
            raise ValueError("missing source reference")
        start = date_key(p["valid_from"])
        if p["valid_to"] is not None and date_key(p["valid_to"]) <= start:
            raise ValueError("invalid validity interval")
        if p["confidence"] not in {"high", "medium", "low"}:
            raise ValueError("invalid confidence")
        if type(p["approximate"]) is not bool or not isinstance(p["notes"], str):
            raise ValueError("invalid approximation/notes")
        g = shape(f["geometry"])
        if g.geom_type not in {"Polygon", "MultiPolygon"} or not g.is_valid or g.is_empty:
            raise ValueError("invalid historical polygon")


def _geometry_members(rel: dict):
    for member in rel.get("members", []):
        role = member.get("role") or "outer"
        if role in {"outer", "inner"}:
            yield member, role


def way_license_exceptions(rel: dict, index: dict) -> list[dict]:
    """Every way the geometry uses must be CC0 too: a CC0 relation does not clear its parts."""
    exceptions = []
    for member, _ in _geometry_members(rel):
        if member["type"] != "way":
            continue
        way = index.get(("way", member["ref"]))
        if way is None:
            exceptions.append(
                {"id": f"way/{member['ref']}", "license": None, "reason": "missing way"}
            )
        elif not license_ok(way.get("tags", {})):
            exceptions.append(
                {
                    "id": f"way/{member['ref']}",
                    "license": way["tags"]["license"],
                    "reason": "explicit non-CC0 license",
                    "source": way["tags"].get("source:name")
                    or way["tags"].get("attribution")
                    or way["tags"].get("source:geometry")
                    or way["tags"].get("source"),
                }
            )
    return exceptions


def open_ends(lines: list) -> str:
    """Describe a broken ring: how many line ends meet nothing, and how far apart they are."""
    merged = shapely.line_merge(shapely.union_all(lines))
    chains = list(shapely.get_parts(merged))
    ends = Counter(point for chain in chains for point in (chain.coords[0], chain.coords[-1]))
    loose = [Point(point) for point, count in ends.items() if count == 1]
    if len(loose) < 2:
        return f"{len(loose)} open ends"
    closest = min(a.distance(b) for i, a in enumerate(loose) for b in loose[i + 1 :])
    km = closest * KM_PER_DEGREE
    return f"{len(loose)} open ends, nearest pair {km:.1f} km apart"


def relation_geometry(rel: dict, index: dict):
    """Assemble rings without closing broken chains; open ends are an error, not a guess."""
    lines = {"outer": [], "inner": []}
    for member, role in _geometry_members(rel):
        if member["type"] != "way":
            raise ValueError("nested relation or non-way boundary")
        way = index.get(("way", member["ref"]))
        if way is None:
            raise ValueError("missing way")
        coords = way.get("geometry", member.get("geometry", []))
        if len(coords) < 2 or any(p is None for p in coords):
            raise ValueError("incomplete coordinates")
        lines[role].append(LineString([(p["lon"], p["lat"]) for p in coords]))
    if not lines["outer"]:
        raise ValueError("no outer boundary")
    faces = {}
    for role, parts in lines.items():
        faces[role] = []
        if not parts:
            continue
        # Node the lines first: rings of one state may touch or share stretches.
        polygons, _cuts, dangles, invalid = shapely.polygonize_full([shapely.union_all(parts)])
        if len(dangles.geoms) or len(invalid.geoms):
            raise ValueError(f"unclosed or intersecting boundary: {open_ends(parts)}")
        faces[role] = list(polygons.geoms)
    outer = shapely.union_all(faces["outer"]) if faces["outer"] else Polygon()
    inner = shapely.union_all(faces["inner"]) if faces["inner"] else Polygon()
    geom = outer.difference(inner)
    # An island standing inside a hole is an outer ring that the difference removed.
    islands = [face for face in faces["outer"] if inner.contains(face)]
    geom = _clean_polygonal(shapely.union_all([geom, *islands]))
    if geom.is_empty or not geom.is_valid:
        raise ValueError("invalid assembled polygon")
    return geom


def dated_states(candidates, date: str, names=None):
    """Split the plate's relations for one date: states, non-states and unreadable dates."""
    states, not_states, bad_dates = [], [], []
    wanted = {n.casefold() for n in names} if names else None
    for c in candidates:
        tags = c.tags
        name = tags.get("name:en") or tags.get("name") or str(c.element_id)
        if wanted and name.casefold() not in wanted:
            continue
        try:
            if not active(tags, date):
                continue
        except (ValueError, KeyError) as exc:
            bad_dates.append({"ohm_id": c.element_id, "name": name, "reason": str(exc)})
            continue
        reason = state_exclusion(tags)
        if reason:
            not_states.append({"ohm_id": c.element_id, "name": name, "reason": reason})
        else:
            states.append(c)
    return states, not_states, bad_dates


def normalized_selection(candidates, date: str, names=None):
    """Keep a polygon only if the relation and all its ways pass; report everything else."""
    records, objects = [], []
    for c in candidates:
        tags = c.tags
        name = tags.get("name:en") or tags.get("name") or str(c.element_id)
        if names and name.casefold() not in {n.casefold() for n in names}:
            continue
        reason = None
        try:
            if not active(tags, date):
                continue
        except (ValueError, KeyError) as exc:
            reason = f"unknown validity: {exc}"
        reason = reason or state_exclusion(tags)
        geom = shape(c.geometry) if c.geometry else None
        polygon = geom is not None and geom.geom_type in {"Polygon", "MultiPolygon"}
        if not reason and not license_ok(tags):
            reason = f"non-CC0 relation: {tags['license']}"
        if not reason and c.license_exceptions:
            reason = f"non-CC0 or missing ways: {len(c.license_exceptions)}"
        if not reason and (not polygon or geom.is_empty or not geom.is_valid):
            reason = c.geometry_error or "no valid polygon geometry"
        objects.append(
            {
                "ohm_id": c.element_id,
                "name": name,
                "valid_from": tags.get("start_date"),
                "valid_to": tags.get("end_date"),
                "license": tags.get("license"),
                "effective_license": "CC0-1.0" if license_ok(tags) else tags.get("license"),
                "license_basis": "OHM default" if not tags.get("license") else "explicit tag",
                "polygon_geometry": bool(polygon),
                "geometry_error": c.geometry_error,
                "license_exceptions": c.license_exceptions,
                "eligible": reason is None,
                "exclusion": reason,
            }
        )
        if reason:
            continue
        props = {
            "id": f"ohm-relation-{c.element_id}",
            "name_en": name,
            "valid_from": iso(tags["start_date"]),
            "valid_to": iso(tags["end_date"]) if tags.get("end_date") else None,
            "source": "ohm",
            "source_ref": f"https://www.openhistoricalmap.org/relation/{c.element_id}",
            "license": "CC0-1.0",
            "license_raw": tags.get("license"),
            "confidence": "low",
            "approximate": True,
            "notes": "OHM; accuracy unreviewed; partial dates expanded to first day; "
            "exclusive end.",
        }
        records.append((props, geom))
    return records, objects


def area_km2(geom) -> float:
    """Mercator area corrected by the local scale, part by part."""
    total = 0.0
    for part in shapely.get_parts(geom):
        lat = shapely.transform(part.centroid, _to_lonlat).y
        total += part.area * math.cos(math.radians(lat)) ** 2
    return total / 1e6


def classify_overlap(share: float) -> str:
    if share >= NESTED_SHARE:
        return "nesting"
    return "sliver" if share <= SLIVER_SHARE else "conflict"


def find_overlaps(props: list, geoms: list) -> list[dict]:
    """Every pair of polities sharing land, largest first."""
    out = []
    tree = STRtree(geoms)
    for i, j in zip(*tree.query(geoms, predicate="intersects"), strict=True):
        if i >= j:
            continue
        common = _clean_polygonal(geoms[i].intersection(geoms[j]))
        if common.is_empty:
            continue
        area = area_km2(common)
        if area < MIN_OVERLAP_KM2:
            continue
        share = area / min(area_km2(geoms[i]), area_km2(geoms[j]))
        out.append(
            {
                "a": props[i]["name_en"],
                "b": props[j]["name_en"],
                "area_km2": round(area, 1),
                "share_of_smaller": round(share, 4),
                "kind": classify_overlap(share),
            }
        )
    return sorted(out, key=lambda row: -row["area_km2"])


def palette_indices(geoms: list) -> tuple[list[int], int]:
    """Neighbours get different colors where possible; returns conflicts left over."""
    tree = STRtree(geoms)
    neighbours = {i: set() for i in range(len(geoms))}
    for i, j in zip(*tree.query(geoms, predicate="intersects"), strict=True):
        if i != j:
            neighbours[int(i)].add(int(j))
    colors: dict[int, int] = {}
    conflicts = 0
    for i in sorted(neighbours, key=lambda k: -len(neighbours[k])):
        used = {colors[j] for j in neighbours[i] if j in colors}
        free = [c for c in range(PALETTE_SIZE) if c not in used]
        conflicts += not free
        colors[i] = free[0] if free else i % PALETTE_SIZE
    return [colors[i] for i in range(len(geoms))], conflicts


def _load_land(meta: dict):
    clip = box(*meta["bbox_3857"])
    return _clean_polygonal(
        shapely.union_all(
            [
                shapely.transform(shape(f.geometry), _to_merc).intersection(clip)
                for f in features("land", "10m")
                if shape(f.geometry).intersects(box(*meta["bbox_lonlat"]))
            ]
        )
    )


def _drop_specks(geom, min_area: float):
    """Remove islets under a plate pixel or two, but never the whole of a microstate."""
    parts = list(shapely.get_parts(geom))
    kept = [p for p in parts if p.area >= min_area]
    return shapely.union_all(kept) if kept else max(parts, key=lambda p: p.area)


def align(records: list, meta: dict) -> tuple[dict, dict]:
    """Clip to Natural Earth land. Coasts stay on NE; only inland borders come from OHM."""
    tolerance = meta["pixel_size_m"] * TOLERANCE_PX
    min_area = MIN_AREA_PX2 * meta["pixel_size_m"] ** 2
    land = _load_land(meta)
    simple_land = _clean_polygonal(shapely.simplify(land, tolerance))
    props, geoms = [], []
    for p, g in records:
        merc = shapely.transform(g, _to_merc)
        clipped = _clean_polygonal(merc.intersection(land))
        if not clipped.is_empty:
            props.append(p)
            geoms.append(clipped)
    coverage_valid = bool(geoms) and bool(shapely.coverage_is_valid(np.array(geoms, dtype=object)))
    overlaps = find_overlaps(props, geoms) if geoms else []
    if coverage_valid:
        # Neighbours keep one shared border; the outside coast must stay on NE land.
        arr = np.array(geoms, dtype=object)
        geoms = list(shapely.coverage_simplify(arr, tolerance, simplify_boundary=False))
    else:
        # OHM polities are not a topological coverage: simplify inland borders one by one,
        # then cut with the simplified land so that every polity shares the same coast.
        geoms = [
            _clean_polygonal(shapely.simplify(g, tolerance).intersection(simple_land))
            for g in geoms
        ]
    kept = [(p, g) for p, g in zip(props, geoms, strict=True) if not g.is_empty]
    props, geoms = [p for p, _ in kept], [_drop_specks(g, min_area) for _, g in kept]
    colors, conflicts = palette_indices(geoms) if geoms else ([], 0)
    out = []
    for p, g, color in zip(props, geoms, colors, strict=True):
        largest = max(shapely.get_parts(g), key=lambda part: part.area)
        anchor = shapely.maximum_inscribed_circle(largest, meta["pixel_size_m"] * 4)
        label = shapely.transform(shapely.get_point(anchor, 0), _to_lonlat)
        lonlat = shapely.set_precision(shapely.transform(g, _to_lonlat), COORDINATE_GRID)
        out.append(
            {
                "type": "Feature",
                "properties": {
                    **p,
                    "label": [round(label.x, 4), round(label.y, 4)],
                    "area_km2": round(area_km2(g)),
                    "palette_index": color,
                },
                "geometry": mapping(lonlat),
            }
        )
    collection = {"type": "FeatureCollection", "features": out}
    validate(collection)
    return collection, coast_report(geoms, land, meta) | {
        "land_clip": "Natural Earth 10m",
        "features": len(out),
        "coverage_valid": coverage_valid,
        "simplify": "coverage_simplify" if coverage_valid else "per polygon",
        "overlaps": overlaps,
        "overlap_kinds": dict(Counter(row["kind"] for row in overlaps)),
        "palette_conflicts": conflicts,
    }


def coast_report(geoms: list, land, meta: dict) -> dict:
    """How well the polities sit on the unsimplified NE land the plate's sea mask comes from."""
    if not geoms:
        return {"coast_outside_land_km2": 0.0, "coast_max_error_px": 0.0, "land_covered": 0.0}
    union = _clean_polygonal(shapely.union_all(geoms))
    outside = union.difference(land)
    worst = 0.0
    if not outside.is_empty:
        points = shapely.points(shapely.get_coordinates(outside))
        worst = float(shapely.distance(points, land).max()) / meta["pixel_size_m"]
    uncovered = [p for p in shapely.get_parts(land.difference(union)) if not p.is_empty]
    largest = sorted(uncovered, key=lambda part: -part.area)[:15]
    return {
        "coast_outside_land_km2": round(area_km2(outside), 1) if not outside.is_empty else 0.0,
        "coast_max_error_px": round(worst, 2),
        "land_covered": round(float(union.intersection(land).area / land.area), 4),
        "largest_uncovered_land": [
            {
                "area_km2": round(area_km2(part)),
                "at": [
                    round(v, 2)
                    for v in shapely.get_coordinates(
                        shapely.transform(part.representative_point(), _to_lonlat)
                    )[0]
                ],
            }
            for part in largest
        ],
    }


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["probe", "extract", "validate"])
    ap.add_argument("--plate")
    ap.add_argument("--date")
    ap.add_argument("--slug", help="extract: data/processed/<plate>/historical/<slug>.geojson")
    ap.add_argument("--source", choices=["cshapes", "ohm"], default="ohm")
    ap.add_argument("--names", nargs="+")
    ap.add_argument("--search", help="probe: also search OHM worldwide for this name pattern")
    ap.add_argument("--file", type=str)
    args = ap.parse_args(argv)
    try:
        if args.command == "validate":
            if not args.file:
                ap.error("validate requires --file")
            path = PROCESSED_DIR / args.file
            data = json.loads(path.read_text(encoding="utf-8"))
            validate(data)
            for f in data["features"]:
                if (
                    f["properties"]["source"] == "custom"
                    and not path.with_suffix(".sources.md").is_file()
                ):
                    raise ValueError("custom contour requires adjacent .sources.md")
            print("Historical GeoJSON OK")
            return 0
        if not args.plate or not args.date:
            ap.error("probe/extract require --plate and --date")
        if args.command == "extract" and not args.slug:
            ap.error("extract requires --slug")
        date = iso(args.date)
        if args.source == "cshapes":
            raise ValueError("CShapes data is CC BY-NC-SA 4.0: FORBIDDEN; no download")
        from .hist_backends import relations_in_plate, relations_named, with_geometry

        # china-east is the roadmap name; the existing default hillshade plate is hs05.
        plate = "china-east-hs05" if args.plate == "china-east" else args.plate
        meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
        candidates = relations_in_plate(meta)
        states, not_states, bad_dates = dated_states(candidates, date, args.names)
        report = {
            "plate": args.plate,
            "resolved_plate": plate,
            "date": date,
            "source": "ohm",
            "relations_in_plate": len(candidates),
            "states": [
                {
                    "ohm_id": c.element_id,
                    "name": c.tags.get("name:en") or c.tags.get("name"),
                    "valid_from": c.tags.get("start_date"),
                    "valid_to": c.tags.get("end_date"),
                    "license": c.tags.get("license"),
                }
                for c in sorted(states, key=lambda c: c.tags.get("name:en") or c.tags.get("name"))
            ],
            "explicit_non_cc0": [c.element_id for c in states if not license_ok(c.tags)],
            "not_states": not_states,
            "unreadable_dates": bad_dates,
            "coverage": "partial: absence here is not proof of historical nonexistence",
        }
        if args.search:
            report["search"] = {"pattern": args.search, "matches": relations_named(args.search)}
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        if args.command == "probe":
            target = EVIDENCE / f"probe-{args.plate}-{date}.json"
            target.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
            print(json.dumps(report, indent=2, ensure_ascii=False))
            return 0
        records, objects = normalized_selection(
            [with_geometry(c) for c in states], date, args.names
        )
        if not records:
            raise ValueError("no eligible real polygons; refusing empty extraction")
        skipped = [o for o in objects if not o["eligible"]]
        collection, qa = align(records, meta)
        drawn = {f["properties"]["name_en"] for f in collection["features"]}
        report |= {
            "slug": args.slug,
            "skipped": skipped,
            "exclusions": dict(Counter(row["exclusion"] for row in skipped)),
            "outside_plate": sorted({p["name_en"] for p, _ in records} - drawn),
            "qa": qa,
        }
        target = PROCESSED_DIR / plate / "historical" / f"{args.slug}.geojson"
        target.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
        target.write_text(text, encoding="utf-8")
        target.with_suffix(".report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        mirror_to_public(plate)
        summary = {k: v for k, v in report.items() if k not in {"states", "not_states"}}
        print(json.dumps(summary | {"bytes": len(text.encode("utf-8"))}, indent=2))
        return 0
    except (ValueError, httpx.HTTPError) as exc:
        print(f"Historical data ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
