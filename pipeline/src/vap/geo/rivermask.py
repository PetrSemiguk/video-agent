"""A schematic band of settled ground along a river: the valley and its delta.

uv run python -m vap.geo.rivermask --plate egypt --name valley-delta \
    --rivers rivers/nile-aswan-sea,rivers/damietta --km 14 [--fan-lat 30.2 --fan-km 55]

1. Load each river (vap.geo.river output) from data/processed/<plate>/.
2. Buffer it by --km of ground distance, taken at the river's mean latitude, so the band is a
   true width rather than a Mercator one.
3. --fan-lat with --fan-km buffers the part north of that latitude more widely, for a delta that
   spreads where the valley does not.
4. Union, clip to Natural Earth 10m land so it never runs into the sea, simplify like extract.

Output: data/processed/<plate>/terrain/<name>.geojson with `method: river-buffer`, the widths
used, `area_km2`, `label` and `approximate: true`, plus `<name>.sources.md` recording what the
band is and what it is not. **This is not a survey of cultivated or irrigated land.** It is a
drawn band around a sourced river course, and every episode that shows it must say so on screen.
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import shapely
from shapely.geometry import box, shape

from .extract import (
    DECIMALS,
    PROCESSED_DIR,
    TOLERANCE_PX,
    _clean_polygonal,
    _to_lonlat,
    _to_merc,
    mirror_to_public,
    to_geojson,
)
from .mercator import Extent
from .plate import parse_bbox  # noqa: F401  (keeps the CLI vocabulary in one place)
from .terrainregion import area_km2, load_land

SOURCES = """# {name}

A band drawn around a river course, not a survey of cultivated or irrigated land.

- **Method:** `vap.geo.rivermask`, a buffer of {km} km of ground distance around {rivers}{fan}.
- **Rivers:** Natural Earth v5.1.2 main stems, as extracted by `vap.geo.river`.
- **Clipped to:** Natural Earth 10m land, so the band stops at the coast.
- **Area:** {area:,} km2.
- **Why this width:** {why}

`approximate: true`. On screen it must be labelled as approximate, and no claim may describe it
as measured. For the area or the population a band like this seems to hold, cite the episode's
own sourced figures, never the band.
"""


def load_river(plate: str, slug: str):
    path = PROCESSED_DIR / plate / f"{slug}.geojson"
    if not path.is_file():
        raise SystemExit(f"No river {slug} on plate {plate}: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return [shape(feature["geometry"]) for feature in data["features"]]


def banded(lines: list, km: float, fan_lat: float | None, fan_km: float) -> list:
    """Buffer each line by a true ground width, widening north of fan_lat when asked."""
    out = []
    for line in lines:
        mean_lat = line.centroid.y
        scale = math.cos(math.radians(mean_lat))
        merc = shapely.transform(line, _to_merc)
        out.append(merc.buffer(km * 1000 / scale, quad_segs=8))
        if fan_lat is not None:
            north = line.intersection(box(-180, fan_lat, 180, 85))
            if not north.is_empty:
                wide = shapely.transform(north, _to_merc)
                out.append(wide.buffer(fan_km * 1000 / scale, quad_segs=8))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.geo.rivermask", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)  # fmt: skip
    ap.add_argument("--plate", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--rivers", required=True, help="comma-separated slugs under the plate")
    ap.add_argument("--km", type=float, required=True, help="band half-width, ground km")
    ap.add_argument("--fan-lat", type=float, default=None)
    ap.add_argument("--fan-km", type=float, default=0.0)
    ap.add_argument("--why", default="chosen by the episode's own sourced figures")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    if args.fan_lat is not None and args.fan_km <= args.km:
        ap.error("--fan-km must be wider than --km")

    slugs = [s.strip() for s in args.rivers.split(",") if s.strip()]
    lines = [line for slug in slugs for line in load_river(args.plate, slug)]
    merged = shapely.union_all(banded(lines, args.km, args.fan_lat, args.fan_km))

    meta = json.loads(
        (
            PROCESSED_DIR.parent.parent / "studio" / "public" / "plates" / f"{args.plate}.json"
        ).read_text(encoding="utf-8")
    )
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    band = _clean_polygonal(merged.intersection(load_land(ext)))
    band = _clean_polygonal(
        shapely.simplify(band, TOLERANCE_PX * ext.pixel_size, preserve_topology=True)
    )
    lonlat = shapely.transform(band, _to_lonlat)
    label = lonlat.point_on_surface()
    area = area_km2(band)
    props = {
        "id": args.name,
        "name_en": args.name,
        "type": "terrain",
        "method": "river-buffer",
        "buffer_km": args.km,
        "fan_lat": args.fan_lat,
        "fan_km": args.fan_km if args.fan_lat is not None else None,
        "rivers": slugs,
        "area_km2": area,
        "label": [round(label.x, DECIMALS), round(label.y, DECIMALS)],
        "approximate": True,
    }
    out = PROCESSED_DIR / args.plate / "terrain" / f"{args.name}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(to_geojson([(props, band)]), encoding="utf-8")
    fan = (
        f", widened to {args.fan_km} km north of {args.fan_lat} deg N for the delta"
        if args.fan_lat is not None
        else ""
    )
    out.with_suffix("").with_suffix(".sources.md").write_text(
        SOURCES.format(
            name=args.name,
            km=args.km,
            rivers=", ".join(slugs),
            fan=fan,
            area=area,
            why=args.why,
        ),
        encoding="utf-8",
    )
    print(f"{args.name}: {band.geom_type}, {area:,} km2 -> {out}")
    mirror_to_public(args.plate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
