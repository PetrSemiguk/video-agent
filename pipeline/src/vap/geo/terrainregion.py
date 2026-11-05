"""A connected region from elevation: plateau above a height, lowlands below one.

uv run python -m vap.geo.terrainregion --plate china-east-hs05 --name tibetan-plateau \
    --min-elev 4000 --seed 90,32 --smooth 40 [--bbox w,s,e,n]

1. Elevation on the plate grid from the terrarium tiles the plate itself uses.
2. Threshold, limited to Natural Earth 10m land, so coasts match the plate. --bbox limits it
   further, for one part of a larger region. That edge is an editorial cut, not a terrain feature.
3. Smooth: Gaussian blur of the mask by --smooth km, cut at 0.5. Removes specks and thin links.
4. Keep the connected part holding --seed, or the largest part without a seed.
5. Vectorise, simplify like vap.geo.extract, clip to land again.

Output: data/processed/<plate>/terrain/<name>.geojson, one feature with `method`, `threshold_m`,
`smooth_km`, `seed`, `area_km2`, `label` and `approximate: true`. A contour of the terrain model,
not a surveyed boundary of a named landform.
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np
import shapely
from PIL import Image, ImageFilter
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from shapely.geometry import Point, box, shape

from .compose import _drop_small
from .extract import (
    DECIMALS,
    MIN_AREA_PX2,
    PROCESSED_DIR,
    TOLERANCE_PX,
    _clean_polygonal,
    _to_lonlat,
    _to_merc,
    mirror_to_public,
    to_geojson,
)
from .mercator import Extent, lat_to_y, lon_to_x, y_to_lat
from .paths import PLATES_DIR
from .terrain import render
from .vectors import features

SIMPLIFY_PX = 2.0  # masks are inlined in storyboards; a contour needs no more detail


def threshold_mask(elev: np.ndarray, min_elev: float | None, max_elev: float | None) -> np.ndarray:
    if (min_elev is None) == (max_elev is None):
        raise ValueError("give exactly one of min_elev and max_elev")
    return elev >= min_elev if min_elev is not None else elev <= max_elev


def smooth_mask(mask: np.ndarray, radius_px: float) -> np.ndarray:
    if radius_px <= 0:
        return mask
    image = Image.fromarray(mask.astype(np.uint8) * 255)
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius_px))) >= 128


def pick_component(parts: list, seed: Point | None):
    """The part holding the seed, or the largest. Parts are in the seed's coordinates."""
    if not parts:
        raise ValueError("threshold selects no terrain on this plate")
    if seed is None:
        return max(parts, key=lambda p: p.area)
    for part in parts:
        if part.contains(seed):
            return part
    raise ValueError("seed is not inside the selected terrain; move it or change the threshold")


def build(
    ext: Extent,
    elev: np.ndarray,
    land,
    *,
    min_elev: float | None = None,
    max_elev: float | None = None,
    seed: tuple[float, float] | None = None,
    smooth_km: float = 0.0,
    limit: tuple[float, float, float, float] | None = None,
):
    """Region polygon in EPSG:3857. `land` is polygonal, in EPSG:3857."""
    transform = from_origin(ext.min_x, ext.max_y, ext.pixel_size, ext.pixel_size)
    on_land = rasterize([land], out_shape=elev.shape, transform=transform, dtype=np.uint8) > 0
    mask = threshold_mask(elev, min_elev, max_elev) & on_land
    if limit:
        w, s, e, n = limit
        area = box(lon_to_x(w), lat_to_y(s), lon_to_x(e), lat_to_y(n))
        mask &= rasterize([area], out_shape=elev.shape, transform=transform, dtype=np.uint8) > 0
    mid_lat = y_to_lat((ext.min_y + ext.max_y) / 2)
    ground_km_per_px = ext.pixel_size / 1000 * math.cos(math.radians(mid_lat))
    mask = smooth_mask(mask, smooth_km / ground_km_per_px)
    parts = [
        shape(geom)
        for geom, value in shapes(mask.astype(np.uint8), transform=transform, connectivity=4)
        if value == 1
    ]
    point = Point(lon_to_x(seed[0]), lat_to_y(seed[1])) if seed else None
    region = pick_component(parts, point)
    tolerance = max(SIMPLIFY_PX, TOLERANCE_PX) * ext.pixel_size
    region = _clean_polygonal(shapely.simplify(region, tolerance, preserve_topology=True))
    region = _clean_polygonal(region.intersection(land))
    return _drop_small(region, MIN_AREA_PX2 * 16 * ext.pixel_size**2, False)


def load_land(ext: Extent):
    clip = box(ext.min_x, ext.min_y, ext.max_x, ext.max_y)
    return _clean_polygonal(
        shapely.union_all(
            [
                shapely.transform(shape(f.geometry), _to_merc).intersection(clip)
                for f in features("land", "10m")
            ]
        )
    )


def area_km2(region) -> float:
    lonlat = shapely.transform(region, _to_lonlat)
    polygons = list(lonlat.geoms) if lonlat.geom_type == "MultiPolygon" else [lonlat]
    total = 0.0
    for polygon in polygons:
        lat = polygon.centroid.y
        total += polygon.area * 111.32**2 * math.cos(math.radians(lat))
    return round(total)


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.terrainregion",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--plate", required=True)
    ap.add_argument("--name", required=True)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--min-elev", type=float, help="keep terrain at or above this height, m")
    group.add_argument("--max-elev", type=float, help="keep terrain at or below this height, m")
    ap.add_argument("--seed", default=None, help="lon,lat inside the wanted part")
    ap.add_argument("--smooth", type=float, default=0.0, help="blur radius of the mask, km")
    ap.add_argument("--bbox", default=None, help="w,s,e,n: keep terrain only inside this box")
    args = ap.parse_args(argv)

    meta = json.loads((PLATES_DIR / f"{args.plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    seed = tuple(float(v) for v in args.seed.split(",")) if args.seed else None
    limit = tuple(float(v) for v in args.bbox.split(",")) if args.bbox else None
    elev, zoom = render(ext)
    region = build(
        ext,
        elev,
        load_land(ext),
        min_elev=args.min_elev,
        max_elev=args.max_elev,
        seed=seed,
        smooth_km=args.smooth,
        limit=limit,
    )
    label = shapely.transform(region.point_on_surface(), _to_lonlat)
    threshold = args.min_elev if args.min_elev is not None else args.max_elev
    props = {
        "id": args.name,
        "name_en": args.name,
        "type": "terrain",
        "method": "min-elev" if args.min_elev is not None else "max-elev",
        "threshold_m": threshold,
        "smooth_km": args.smooth,
        "seed": list(seed) if seed else None,
        "bbox": list(limit) if limit else None,
        "terrain_zoom": zoom,
        "area_km2": area_km2(region),
        "label": [round(label.x, DECIMALS), round(label.y, DECIMALS)],
        "approximate": True,
    }
    out = PROCESSED_DIR / args.plate / "terrain" / f"{args.name}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(to_geojson([(props, region)]), encoding="utf-8")
    print(
        f"{args.name}: {region.geom_type}, {props['area_km2']:,} km2, "
        f"{out.stat().st_size / 1e3:.1f} kB -> {out}"
    )
    mirror_to_public(args.plate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
