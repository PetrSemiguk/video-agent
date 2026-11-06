"""Generate a map plate: Blue Marble NG + terrain hillshade, graded, in Web Mercator.

uv run python -m vap.geo.plate --name europe --bbox -11,35,32,60 [--width 3840 --height 2160]
    [--hillshade 0..1] [--exaggeration 3] [--grade dark|neutral]

Writes studio/public/plates/<name>.png (git-ignored) and <name>.json (committed).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time

import numpy as np
from PIL import Image

from . import bluemarble, terrain
from .look import apply_grade, apply_hillshade, hillshade, load_grades, load_plate_look
from .mercator import Extent, R, fit_extent, y_to_lat
from .paths import PLATES_DIR
from .sources import attribution


def parse_bbox(text: str) -> tuple[float, float, float, float]:
    parts = [float(p) for p in text.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be minLon,minLat,maxLon,maxLat")
    return parts[0], parts[1], parts[2], parts[3]


OVERSAMPLING_LIMIT = 1.25


def oversampling(ext: Extent) -> dict:
    """How much one Blue Marble pixel is stretched on the plate (plate px per source px).

    > 1 means the plate is upscaled from the source (soft). Mercator stretches latitude by
    1/cos(lat), so the value is reported at the plate centre and at its edge (the latitude
    farthest from the equator), where it is largest.
    """
    deg_per_plate_px = math.degrees(ext.pixel_size / R)  # longitude, same everywhere
    src_deg = 1 / bluemarble.PX_PER_DEG
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    centre_lat = y_to_lat((ext.min_y + ext.max_y) / 2)
    edge_lat = max(abs(min_lat), abs(max_lat))

    def at(lat: float) -> float:
        x = src_deg / deg_per_plate_px
        y = src_deg / (deg_per_plate_px * math.cos(math.radians(lat)))
        return max(x, y)

    edge = at(edge_lat)
    # Narrowest plate width (degrees of longitude) that keeps the edge within the limit.
    min_width = ext.width * src_deg / (OVERSAMPLING_LIMIT * math.cos(math.radians(edge_lat)))
    return {
        "definition": "plate px per Blue Marble px (max of x/y); > 1 = upscaled",
        "center": round(at(centre_lat), 3),
        "edge": round(edge, 3),
        "limit": OVERSAMPLING_LIMIT,
        "min_width_deg_at_limit": round(min_width, 2),
    }


def metadata(
    name: str, ext: Extent, requested: tuple, params: dict, terrain_zoom: int | None
) -> dict:
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    return {
        "name": name,
        "image": f"plates/{name}.png",
        "width": ext.width,
        "height": ext.height,
        "crs": "EPSG:3857",
        "requested_bbox_lonlat": list(requested),
        "bbox_lonlat": [round(v, 8) for v in (min_lon, min_lat, max_lon, max_lat)],
        "bbox_3857": [round(v, 3) for v in (ext.min_x, ext.min_y, ext.max_x, ext.max_y)],
        "pixel_size_m": round(ext.pixel_size, 6),
        "zoom": {"tile512": round(ext.zoom(512), 4), "tile256": round(ext.zoom(256), 4)},
        "projection": {
            "radius_m": R,
            "lonlat_to_px": (
                "x_m = R * radians(lon); y_m = R * ln(tan(pi/4 + radians(lat)/2)); "
                "px = (x_m - bbox_3857[0]) / (bbox_3857[2] - bbox_3857[0]) * width; "
                "py = (bbox_3857[3] - y_m) / (bbox_3857[3] - bbox_3857[1]) * height; "
                "(0,0) = top-left corner of the image, pixel centres at +0.5"
            ),
        },
        "params": {**params, "terrain_zoom": terrain_zoom},
        "resolution": {"source": "NASA Blue Marble NG, 15 arc-seconds", **oversampling(ext)},
        "attribution": attribution(use_terrain=terrain_zoom is not None),
        "generator": "vap.geo.plate",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.geo.plate", description=__doc__)
    ap.add_argument("--name", required=True)
    ap.add_argument("--bbox", required=True, type=parse_bbox, help="minLon,minLat,maxLon,maxLat")
    ap.add_argument("--width", type=int, default=3840)
    ap.add_argument("--height", type=int, default=2160)
    ap.add_argument(
        "--hillshade",
        type=float,
        default=load_plate_look()["hillshade"],
        help="blend strength 0..1",
    )
    ap.add_argument("--exaggeration", type=float, default=3.0, help="vertical exaggeration")
    ap.add_argument("--grade", default="dark", choices=sorted(load_grades()))
    ap.add_argument("--strict", action="store_true", help="fail if oversampling > limit")
    args = ap.parse_args(argv)
    if not 0.0 <= args.hillshade <= 1.0:
        ap.error("--hillshade must be within 0..1")

    t0 = time.perf_counter()
    ext = fit_extent(args.bbox, args.width, args.height)
    print(f"extent lon/lat: {[round(v, 4) for v in ext.bbox_lonlat]}  zoom512={ext.zoom():.2f}")
    ov = oversampling(ext)
    print(f"oversampling  : centre {ov['center']}, edge {ov['edge']} (limit {OVERSAMPLING_LIMIT})")
    if ov["edge"] > OVERSAMPLING_LIMIT:
        width = ext.bbox_lonlat[2] - ext.bbox_lonlat[0]
        msg = (
            f"plate would be upscaled {ov['edge']}x from Blue Marble (soft). Widen the bbox to "
            f">= {ov['min_width_deg_at_limit']} deg longitude (now {width:.2f}) or lower --width."
        )
        if args.strict:
            print(f"ERROR: {msg}", file=sys.stderr)
            return 2
        print(f"WARNING: {msg}", file=sys.stderr)

    rgb = bluemarble.render(ext)
    t1 = time.perf_counter()
    print(f"blue marble   : {t1 - t0:.1f} s")

    elev, tz = terrain.render(ext)
    t2 = time.perf_counter()
    print(f"terrain z{tz}   : {t2 - t1:.1f} s")

    if args.hillshade > 0:
        shade = hillshade(elev, ext, exaggeration=args.exaggeration)
        rgb = apply_hillshade(rgb, shade, args.hillshade)
    rgb = apply_grade(rgb, load_grades()[args.grade], elev)

    PLATES_DIR.mkdir(parents=True, exist_ok=True)
    png = PLATES_DIR / f"{args.name}.png"
    Image.fromarray((rgb * 255.0 + 0.5).astype(np.uint8), "RGB").save(png, compress_level=6)
    params = {
        "hillshade": args.hillshade,
        "exaggeration": args.exaggeration,
        "azimuth": 315.0,
        "altitude": 45.0,
        "grade": args.grade,
        "grade_version": {"dark": 3, "dark_v2": 2, "dark_v1": 1}.get(args.grade, 0),
        "bluemarble_month": f"2004-{bluemarble.MONTH:02d}",
    }
    meta = metadata(args.name, ext, args.bbox, params, tz)
    meta_path = PLATES_DIR / f"{args.name}.json"
    text = json.dumps(meta, indent=2, ensure_ascii=False) + "\n"
    meta_path.write_text(text, encoding="utf-8", newline="\n")  # LF on Windows too
    t3 = time.perf_counter()
    print(f"shade+grade+io: {t3 - t2:.1f} s")
    print(f"total         : {t3 - t0:.1f} s -> {png} ({png.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
