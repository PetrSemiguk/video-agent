"""License-filtered historical boundaries. Dates use inclusive start, exclusive end."""

from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
from collections import Counter

import httpx
import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box, mapping, shape

from .extract import PROCESSED_DIR, _clean_polygonal, _to_lonlat, _to_merc, mirror_to_public
from .paths import PLATES_DIR, REPO_ROOT
from .vectors import features

CC0 = {"", "CC0", "CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/"}
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


def date_key(value: str) -> tuple[int, int, int]:
    """Strict signed ISO date; year/month precision expands to the first day."""
    m = re.fullmatch(r"(-?\d{4,})(?:-(\d{2})(?:-(\d{2}))?)?", value)
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


def relation_geometry(rel: dict, index: dict):
    """Never close broken chains implicitly or discard nested boundary relations."""
    lines = {"outer": [], "inner": []}
    for member in rel.get("members", []):
        role = member.get("role", "") or "outer"
        if role not in lines:
            continue  # label/admin_centre nodes are not boundary geometry
        if member["type"] != "way":
            raise ValueError("nested relation or non-way boundary")
        way = index.get(("way", member["ref"]))
        if way is None or not license_ok(way.get("tags", {})):
            raise ValueError("missing or non-CC0 way")
        for node in way.get("nodes", []):
            item = index.get(("node", node))
            if item is None or not license_ok(item.get("tags", {})):
                raise ValueError("missing or non-CC0 node")
        coords = way.get("geometry", member.get("geometry", []))
        if len(coords) < 2 or any(p is None for p in coords):
            raise ValueError("incomplete coordinates")
        lines[role].append(LineString([(p["lon"], p["lat"]) for p in coords]))
    polygons = {}
    for role, parts in lines.items():
        if not parts:
            polygons[role] = Polygon()
            continue
        merged = shapely.line_merge(shapely.MultiLineString(parts))
        rings = list(merged.geoms) if merged.geom_type == "MultiLineString" else [merged]
        if any(not r.is_ring for r in rings):
            raise ValueError("unclosed or intersecting boundary")
        polygons[role] = shapely.union_all([Polygon(r) for r in rings])
    geom = polygons["outer"].difference(polygons["inner"])
    if geom.is_empty or not geom.is_valid:
        raise ValueError("invalid assembled polygon")
    return geom


def select(data: dict, date: str, names: list[str] | None = None) -> tuple[list, list]:
    index = {(e["type"], e["id"]): e for e in data["elements"]}
    records, skipped = [], []
    for rel in data["elements"]:
        tags = rel.get("tags", {})
        if rel["type"] != "relation" or tags.get("admin_level") != "2":
            continue
        name = tags.get("name:en") or tags.get("name") or str(rel["id"])
        if names and name.casefold() not in {n.casefold() for n in names}:
            continue
        try:
            if not active(tags, date):
                continue
            if not license_ok(tags):
                raise ValueError("non-CC0 relation")
            geom = relation_geometry(rel, index)
            props = {
                "id": f"ohm-relation-{rel['id']}",
                "name_en": name,
                "valid_from": iso(tags["start_date"]),
                "valid_to": iso(tags["end_date"]) if tags.get("end_date") else None,
                "source": "ohm",
                "source_ref": f"https://www.openhistoricalmap.org/relation/{rel['id']}",
                "license": "CC0-1.0",
                "confidence": "low",
                "approximate": True,
                "notes": "OHM geometry; historical accuracy not independently verified. "
                "Dates expanded to first day when month/day absent; end exclusive.",
            }
            records.append((props, geom))
        except (ValueError, KeyError) as exc:
            skipped.append({"id": rel["id"], "name": name, "reason": str(exc)})
    return records, skipped


def align(records: list, meta: dict) -> tuple[dict, dict]:
    clip = box(*meta["bbox_3857"])
    land = shapely.union_all(
        [
            shapely.transform(shape(f.geometry), _to_merc).intersection(clip)
            for f in features("land", "10m")
            if shape(f.geometry).intersects(box(*meta["bbox_lonlat"]))
        ]
    )
    props, geoms = [], []
    for p, g in records:
        g = _clean_polygonal(shapely.transform(g, _to_merc).intersection(land))
        if not g.is_empty:
            props.append(p)
            geoms.append(g)
    if len(geoms):
        arr = np.array(geoms, dtype=object)
        if not shapely.coverage_is_valid(arr):
            raise ValueError("overlapping/non-matching historical coverage; review source")
        # Do not simplify the outside coast: it must remain on the NE land boundary.
        geoms = shapely.coverage_simplify(arr, meta["pixel_size_m"] * 0.75, simplify_boundary=False)
    out = []
    for p, g in zip(props, geoms, strict=True):
        label = shapely.transform(g.point_on_surface(), _to_lonlat)
        g = shapely.transform(g, _to_lonlat)
        out.append(
            {
                "type": "Feature",
                "properties": {**p, "label": [label.x, label.y]},
                "geometry": mapping(g),
            }
        )
    collection = {"type": "FeatureCollection", "features": out}
    validate(collection)
    return collection, {
        "land_clip": "Natural Earth 10m",
        "features": len(out),
        "coast_outside_land_m2": 0
        if not len(geoms)
        else float(sum(g.difference(land).area for g in geoms)),
    }


def normalized_selection(candidates, date: str, names=None):
    """One policy for both backends; retain rejected candidates in probe details."""
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
        geom = shape(c.geometry) if c.geometry else None
        polygon = geom is not None and geom.geom_type in {"Polygon", "MultiPolygon"}
        if not license_ok(tags) or c.license_exceptions:
            reason = "explicit non-CC0 license or incomplete member audit"
        if not reason and (not polygon or geom.is_empty or not geom.is_valid):
            reason = c.geometry_error or "no valid polygon geometry"
        item = {
            "ohm_id": c.element_id,
            "name": name,
            "backend": c.backend,
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
            "production": "unreviewed partial data; not production approved",
        }
        objects.append(item)
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
            "backend": c.backend,
            "confidence": "low",
            "approximate": True,
            "notes": "OHM; accuracy unreviewed; partial dates expanded to first day; "
            "exclusive end. No river-border alignment certification.",
        }
        records.append((props, geom))
    return records, objects


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["probe", "extract", "validate"])
    ap.add_argument("--plate")
    ap.add_argument("--date")
    ap.add_argument("--source", choices=["cshapes", "ohm"], default="ohm")
    ap.add_argument("--names", nargs="+")
    ap.add_argument("--file", type=str)
    ap.add_argument("--backend", choices=["auto", "overpass", "qlever"], default="auto")
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
        date = iso(args.date)
        if args.source == "cshapes":
            raise ValueError("CShapes data is CC BY-NC-SA 4.0: FORBIDDEN; no download")
        from .hist_backends import fetch

        # china-east is the roadmap name; the existing default hillshade plate is hs05.
        plate = "china-east-hs05" if args.plate == "china-east" else args.plate
        meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
        candidates, attempts = fetch(meta, args.backend)
        records, objects = normalized_selection(candidates or [], date, args.names)
        skipped = [o for o in objects if not o["eligible"]]
        report = {
            "plate": args.plate,
            "resolved_plate": plate,
            "date": date,
            "source": "ohm",
            "status": "ok" if candidates is not None else "access_failed",
            "backends": attempts,
            "objects": objects if candidates is not None else None,
            "cshapes": "FORBIDDEN: CC BY-NC-SA 4.0",
            "candidates": len(records) if candidates is not None else None,
            "names": [p["name_en"] for p, _ in records] if candidates is not None else None,
            "skipped": skipped,
            "exclusions": dict(Counter(x["exclusion"] for x in skipped)),
            "coverage": "unknown: access failed"
            if candidates is None
            else "partial/unreviewed; absence is not proof of historical nonexistence",
        }
        evidence = REPO_ROOT / "docs" / "reports" / "1.6"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / f"probe-{args.plate}-{date}.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        if candidates is None:
            print(json.dumps(report, indent=2, ensure_ascii=True))
            return 1
        if args.command == "extract":
            if not records:
                raise ValueError("no eligible real polygons; refusing empty extraction")
            collection, qa = align(records, meta)
            report["qa"] = qa
            target = PROCESSED_DIR / plate / "historical" / f"{date}.geojson"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
            target.with_suffix(".report.json").write_text(
                json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            mirror_to_public(plate)
        print(json.dumps(report, indent=2, ensure_ascii=True))
        return 0
    except (ValueError, httpx.HTTPError) as exc:
        print(f"Historical data ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
