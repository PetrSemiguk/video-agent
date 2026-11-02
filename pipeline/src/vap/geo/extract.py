"""Extract compact Natural Earth GeoJSON layers for a map plate.

uv run python -m vap.geo.extract --plate china-east-hs05
    [--layers countries,admin1,rivers,lakes,regions,places,coastline] [--min-rank N]

- bbox from studio/public/plates/<plate>.json, plus a 10 % margin on every side;
- 10m or 50m Natural Earth chosen by the plate's zoom;
- geometry simplified in EPSG:3857 with a tolerance of 0.75 plate pixels; countries and
  admin1 are simplified as a polygon *coverage* (shapely.coverage_simplify), so neighbours
  keep identical shared borders;
- rivers/lakes/regions/places filtered by scalerank (threshold from zoom, or --min-rank);
- output data/processed/<plate>/<layer>.geojson (committed), mirrored to
  studio/public/geo/<plate>/ (git-ignored) for Remotion.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from collections import defaultdict

import numpy as np
import shapely
from shapely.geometry import box, mapping, shape

from .mercator import MAX_LAT, Extent, R
from .paths import PLATES_DIR, REPO_ROOT
from .vectors import COVERAGE_LAYERS, DEFAULT_LAYERS, LAYERS, POLYGON_LAYERS, RANKED_LAYERS
from .vectors import features as source_features

PROCESSED_DIR = REPO_ROOT / "data" / "processed"
PUBLIC_GEO_DIR = REPO_ROOT / "studio" / "public" / "geo"
MARGIN = 0.10
TOLERANCE_PX = 0.75
MAX_FILE_BYTES = 1_500_000
MAX_TOTAL_BYTES = 5_000_000
DECIMALS = 4  # ~11 m, far below one plate pixel (1.2-1.5 km)
MIN_AREA_PX2 = 4.0  # drop polygons smaller than ~2x2 plate px (not for coverages)


# --- projection helpers (vectorised; same formulas as mercator.py) -----------------------
def _to_merc(coords: np.ndarray) -> np.ndarray:
    lon = coords[:, 0]
    lat = np.clip(coords[:, 1], -MAX_LAT, MAX_LAT)
    return np.column_stack(
        [R * np.radians(lon), R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))]
    )


def _to_lonlat(coords: np.ndarray) -> np.ndarray:
    return np.column_stack(
        [
            np.degrees(coords[:, 0] / R),
            np.degrees(2 * np.arctan(np.exp(coords[:, 1] / R)) - np.pi / 2),
        ]
    )


def default_max_rank(layer: str, zoom256: float) -> int:
    """Largest scalerank kept at a plate zoom (Natural Earth: 0 = most important)."""
    z = math.floor(zoom256)
    return {"rivers": z + 1, "lakes": z + 1, "regions": z + 1, "places": z - 1}[layer]


def pick_scale(zoom512: float) -> str:
    """10m (1:10M) data for regional plates, 50m (1:50M) for continental/world views."""
    return "10m" if zoom512 >= 3.0 else "50m"


def _clean_polygonal(geom):
    geom = shapely.make_valid(geom)
    if geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        geom = shapely.union_all(polys) if polys else shapely.Polygon()
    return geom


def build_layer(layer: str, scale: str, clip_box, tol: float, max_rank: int | None) -> list:
    """Return [(props, geometry in EPSG:3857)] for one output layer."""
    records = []
    for props, geom_json in source_features(layer, scale):
        if layer in RANKED_LAYERS and max_rank is not None:
            rank = props["scalerank"]
            if rank is not None and rank > max_rank:
                continue
        geom = shapely.transform(shape(geom_json), _to_merc)
        if not geom.intersects(clip_box):
            continue
        geom = shapely.clip_by_rect(geom, *clip_box.bounds)
        if layer in POLYGON_LAYERS or geom.geom_type in ("Polygon", "MultiPolygon"):
            geom = _clean_polygonal(geom)
        if geom.is_empty:
            continue
        records.append((props, geom))

    if layer == "rivers":  # one feature per river: merge the pieces that share an id
        merged: dict[str, list] = defaultdict(list)
        first: dict[str, dict] = {}
        for props, geom in records:
            merged[props["id"]].append(geom)
            first.setdefault(props["id"], props)
        records = [(first[k], shapely.line_merge(shapely.union_all(v))) for k, v in merged.items()]

    if not records:
        return []
    geoms = np.array([g for _, g in records], dtype=object)
    if layer in COVERAGE_LAYERS:
        # Coverage simplification: every shared edge is simplified once, so both
        # neighbours keep exactly the same border vertices.
        simplified = shapely.coverage_simplify(geoms, tol, simplify_boundary=True)
    else:
        simplified = shapely.simplify(geoms, tol, preserve_topology=True)

    out = []
    min_area = MIN_AREA_PX2 * (tol / TOLERANCE_PX) ** 2
    for (props, original), geom in zip(records, simplified, strict=True):
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type in ("Polygon", "MultiPolygon") and layer not in COVERAGE_LAYERS:
            if geom.area < min_area:
                continue
        props = dict(props)
        if layer == "regions" and original.geom_type in ("Polygon", "MultiPolygon"):
            label = shapely.transform(original.point_on_surface(), _to_lonlat)
            props["label"] = [round(label.x, DECIMALS), round(label.y, DECIMALS)]
        out.append((props, geom))
    return out


def _round_coords(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(v), DECIMALS) for v in obj]
        return [_round_coords(v) for v in obj]
    return obj


def to_geojson(records: list) -> str:
    feats = []
    for props, geom in records:
        g = mapping(shapely.transform(geom, _to_lonlat))
        g = {"type": g["type"], "coordinates": _round_coords(g["coordinates"])}
        feats.append({"type": "Feature", "properties": props, "geometry": g})
    return json.dumps(
        {"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")
    )


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.extract",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--plate", required=True)
    ap.add_argument(
        "--layers",
        default=",".join(DEFAULT_LAYERS),
        help=f"comma-separated subset of {','.join(LAYERS)}",
    )
    ap.add_argument(
        "--min-rank",
        type=int,
        default=None,
        help="keep ranked features with scalerank <= N (overrides zoom default)",
    )
    args = ap.parse_args(argv)
    layers = [x.strip() for x in args.layers.split(",") if x.strip()]
    unknown = set(layers) - set(LAYERS)
    if unknown:
        ap.error(f"unknown layers: {sorted(unknown)}")

    meta = json.loads((PLATES_DIR / f"{args.plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    dx = (ext.max_x - ext.min_x) * MARGIN
    dy = (ext.max_y - ext.min_y) * MARGIN
    clip_box = box(ext.min_x - dx, ext.min_y - dy, ext.max_x + dx, ext.max_y + dy)
    scale = pick_scale(meta["zoom"]["tile512"])
    print(
        f"plate {args.plate}: zoom512 {meta['zoom']['tile512']:.2f}, Natural Earth {scale}, "
        f"tolerance {TOLERANCE_PX} px = {TOLERANCE_PX * ext.pixel_size:.0f} m"
    )

    out_dir = PROCESSED_DIR / args.plate
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for layer in layers:
        max_rank = args.min_rank
        if max_rank is None and layer in RANKED_LAYERS:
            max_rank = default_max_rank(layer, meta["zoom"]["tile256"])
        tol_px = TOLERANCE_PX
        while True:
            records = build_layer(layer, scale, clip_box, tol_px * ext.pixel_size, max_rank)
            text = to_geojson(records)
            size = len(text.encode("utf-8"))
            if size <= MAX_FILE_BYTES or tol_px > 8:
                break
            tol_px *= 1.5
            print(
                f"  {layer}: {size / 1e6:.2f} MB > limit, tightening tolerance to {tol_px:.2f} px"
            )
        (out_dir / f"{layer}.geojson").write_text(text, encoding="utf-8")
        total += size
        rank_note = f", scalerank <= {max_rank}" if layer in RANKED_LAYERS else ""
        print(
            f"  {layer:<10} {len(records):>5} features  {size / 1e3:>7.1f} kB"
            f"  (tol {tol_px:.2f} px{rank_note})"
        )
    print(f"total {total / 1e6:.2f} MB -> {out_dir}")
    if total > MAX_TOTAL_BYTES:
        print(f"WARNING: total exceeds {MAX_TOTAL_BYTES / 1e6:.0f} MB; raise TOLERANCE_PX")
        return 1

    public = PUBLIC_GEO_DIR / args.plate
    public.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("*.geojson"):
        shutil.copyfile(f, public / f.name)
    print(f"mirrored to {public}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
