"""Union of countries and/or admin1 units into one custom region for a plate.

uv run python -m vap.geo.compose --plate china-east-hs05 --name heartland
    [--countries CHN,MNG] [--admin1 "Henan,Shandong,Hebei"] [--admin1-country CHN]
    [--fill-holes]

Output: data/processed/<plate>/custom/<name>.geojson (one feature, no internal borders),
simplified like vap.geo.extract (0.75 plate px in EPSG:3857), plus a `label` point.
Admin1 names match name_en or the local name, case-insensitively; use --admin1-country to
disambiguate names that exist in several countries.
"""

from __future__ import annotations

import argparse
import json
import sys

import shapely
from shapely.geometry import Polygon, box, shape

from .extract import (
    DECIMALS,
    MARGIN,
    MIN_AREA_PX2,
    PROCESSED_DIR,
    TOLERANCE_PX,
    _clean_polygonal,
    _to_lonlat,
    _to_merc,
    mirror_to_public,
    to_geojson,
)
from .mercator import Extent
from .paths import PLATES_DIR
from .vectors import features


def _drop_small(geom, min_area: float, fill_holes: bool):
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    kept = []
    for p in polys:
        if p.area < min_area:
            continue
        holes = [] if fill_holes else [r for r in p.interiors if Polygon(r).area >= min_area]
        kept.append(Polygon(p.exterior, holes))
    return shapely.union_all(kept) if kept else shapely.Polygon()


def compose(
    plate: str,
    countries: list[str],
    admin1: list[str],
    admin1_country: str | None,
    fill_holes: bool,
):
    meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    dx = (ext.max_x - ext.min_x) * MARGIN
    dy = (ext.max_y - ext.min_y) * MARGIN
    clip = box(ext.min_x - dx, ext.min_y - dy, ext.max_x + dx, ext.max_y + dy)

    parts, found = [], []
    wanted_c = {c.upper() for c in countries}
    for src in features("countries", "10m") if wanted_c else []:
        if src.props["id"] in wanted_c:
            parts.append(shape(src.geometry))
            found.append(src.props["id"])
    wanted_a = {a.casefold(): a for a in admin1}
    for src in features("admin1", "10m") if wanted_a else []:
        if admin1_country and src.raw.get("adm0_a3") != admin1_country.upper():
            continue
        names = {str(src.raw.get(k) or "").casefold() for k in ("name_en", "name")}
        hit = names & set(wanted_a)
        if hit:
            parts.append(shape(src.geometry))
            found.append(src.props["name_en"])
    missing = (wanted_c - set(found)) | {
        v for k, v in wanted_a.items() if k not in {str(f).casefold() for f in found}
    }
    if missing:
        raise SystemExit(f"not found in Natural Earth 10m: {sorted(missing)}")

    merc = [shapely.transform(shapely.make_valid(p), _to_merc) for p in parts]
    # Snap tiny slivers between neighbours before the union (admin1 is not a perfect coverage).
    tol = TOLERANCE_PX * ext.pixel_size
    union = shapely.union_all([g.buffer(tol * 0.5) for g in merc]).buffer(-tol * 0.5)
    union = _clean_polygonal(shapely.clip_by_rect(union, *clip.bounds))
    union = shapely.simplify(union, tol, preserve_topology=True)
    union = _drop_small(union, MIN_AREA_PX2 * ext.pixel_size**2, fill_holes)
    label = shapely.transform(union.point_on_surface(), _to_lonlat)
    return union, found, [round(label.x, DECIMALS), round(label.y, DECIMALS)]


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.compose",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--plate", required=True)
    ap.add_argument("--name", required=True, help="output file name (slug)")
    ap.add_argument("--countries", default="", help="ISO_A3 codes, comma-separated")
    ap.add_argument("--admin1", default="", help="admin1 names, comma-separated")
    ap.add_argument("--admin1-country", default=None, help="restrict admin1 matches, e.g. CHN")
    ap.add_argument("--fill-holes", action="store_true", help="remove interior holes")
    args = ap.parse_args(argv)
    countries = [c.strip() for c in args.countries.split(",") if c.strip()]
    admin1 = [a.strip() for a in args.admin1.split(",") if a.strip()]
    if not countries and not admin1:
        ap.error("give --countries and/or --admin1")

    geom, found, label = compose(
        args.plate, countries, admin1, args.admin1_country, args.fill_holes
    )
    props = {"id": args.name, "name_en": args.name, "type": "custom", "scalerank": None,
             "label": label, "parts": found}  # fmt: skip
    out = PROCESSED_DIR / args.plate / "custom" / f"{args.name}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(to_geojson([(props, geom)]), encoding="utf-8")
    n = len(geom.geoms) if geom.geom_type == "MultiPolygon" else 1
    holes = sum(len(p.interiors) for p in (geom.geoms if n > 1 else [geom]))
    print(f"{args.name}: {len(found)} units -> {geom.geom_type} ({n} part(s), {holes} hole(s)), "
          f"{out.stat().st_size / 1e3:.1f} kB -> {out}")  # fmt: skip
    mirror_to_public(args.plate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
