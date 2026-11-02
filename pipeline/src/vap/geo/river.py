"""One ordered main-stem line for a Natural Earth river, oriented source -> mouth.

uv run python -m vap.geo.river --plate china-east-hs05 --name "Yellow"

1. Collects every 10m river segment whose name_en/name equals --name (all rivernums).
2. line_merge; if pieces remain, builds a graph of the pieces (endpoints snapped within
   SNAP_PX plate pixels) and keeps the longest simple path (the main stem; branches and
   distributaries are dropped). Prints diagnostics if the pieces do not connect.
3. Orients it source -> mouth with terrarium elevations (the source end must be higher).
4. Simplifies like vap.geo.extract and stores the cumulative length fraction of every
   vertex (`cumfrac`) for uniform drawing, plus length and end elevations.

Output: data/processed/<plate>/rivers/<slug>.geojson
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict

import numpy as np
import shapely
from PIL import Image
from shapely.geometry import LineString, shape

from .download import download_many
from .extract import DECIMALS, PROCESSED_DIR, TOLERANCE_PX, _to_lonlat, _to_merc, mirror_to_public
from .mercator import WORLD_M, Extent, lat_to_y, lon_to_x
from .paths import PLATES_DIR
from .terrain import TILE, URL, decode_terrarium, tile_path
from .vectors import features

SNAP_PX = 3.0
# Natural Earth splits some rivers into reaches with different names. These are added
# automatically; use --also for others (find candidates with vap.geo.find).
ALIASES = {
    "yellow": ["Huang"],  # upper/middle Huang He (Lanzhou, Ordos loop)
    "yangtze": ["Tongtian"],  # headwaters above Yushu
}
ELEV_ZOOM = 9
EARTH_R_KM = 6371.0088


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-")


def elevation(lon: float, lat: float, z: int = ELEV_ZOOM) -> float:
    """Terrarium elevation (m) at a point, from the cached tile at zoom z."""
    n = 2**z
    fx = (lon_to_x(lon) + WORLD_M / 2) / WORLD_M * n
    fy = (WORLD_M / 2 - lat_to_y(lat)) / WORLD_M * n
    x, y = int(fx), int(fy)
    path = tile_path(z, x, y)
    download_many([(URL.format(z=z, x=x, y=y), path)], 1)
    if path.stat().st_size == 0:
        return 0.0
    with Image.open(path) as im:
        elev = decode_terrarium(np.asarray(im.convert("RGB")))
    px = min(TILE - 1, int((fx - x) * TILE))
    py = min(TILE - 1, int((fy - y) * TILE))
    return float(elev[py, px])


def end_elevation(coords: np.ndarray) -> float:
    """Median elevation of the first few vertices (robust against one bad sample)."""
    return float(np.median([elevation(lon, lat) for lon, lat in coords[:5]]))


def geodesic_km(coords: np.ndarray) -> np.ndarray:
    """Haversine length of every segment of a lon/lat polyline, in km."""
    lon, lat = np.radians(coords[:, 0]), np.radians(coords[:, 1])
    dlon, dlat = np.diff(lon), np.diff(lat)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(a))


def longest_path(lines: list[LineString], snap: float) -> tuple[LineString, dict]:
    """Longest simple path through a graph whose edges are the given lines."""
    nodes: list[tuple[float, float]] = []

    def node_id(pt) -> int:
        for i, q in enumerate(nodes):
            if math.dist(pt, q) <= snap:
                return i
        nodes.append(pt)
        return len(nodes) - 1

    adj: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for e, line in enumerate(lines):
        a, b = node_id(line.coords[0]), node_id(line.coords[-1])
        adj[a].append((b, e))
        adj[b].append((a, e))

    # Exhaustive DFS from every leaf is fine: river graphs here have a handful of edges.
    best: tuple[float, list[tuple[int, int, int]]] = (0.0, [])

    def dfs(n: int, used: set[int], path: list, length: float):
        nonlocal best
        if length > best[0]:
            best = (length, list(path))
        for m, e in adj[n]:
            if e not in used:
                used.add(e)
                path.append((n, m, e))
                dfs(m, used, path, length + lines[e].length)
                path.pop()
                used.discard(e)

    for n in adj:
        dfs(n, set(), [], 0.0)
    coords: list = []
    for a, _b, e in best[1]:
        seg = list(lines[e].coords)
        if node_id(seg[0]) != a:
            seg.reverse()
        coords.extend(seg if not coords else seg[1:])
    components = _components(adj)
    diag = {"pieces": len(lines), "graph_nodes": len(nodes), "components": components,
            "edges_used": len(best[1])}  # fmt: skip
    return LineString(coords), diag


def _components(adj) -> int:
    seen, count = set(), 0
    for start in adj:
        if start in seen:
            continue
        count += 1
        stack = [start]
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            stack.extend(m for m, _ in adj[n])
    return count


def build(plate: str, name: str, also: list[str] | None = None) -> tuple[dict, dict]:
    meta = json.loads((PLATES_DIR / f"{plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    wanted = {name.casefold()} | {a.casefold() for a in ALIASES.get(name.casefold(), [])}
    wanted |= {a.casefold() for a in also or []}
    segs, rivernums = [], set()
    for src in features("rivers", "10m"):
        names = {str(src.raw.get(k) or "").casefold() for k in ("name_en", "name")}
        if names & wanted:
            g = shapely.transform(shape(src.geometry), _to_merc)
            segs.extend(g.geoms if g.geom_type == "MultiLineString" else [g])
            rivernums.add(src.props["id"])
    if not segs:
        raise SystemExit(f'no Natural Earth river named "{name}"')

    merged = shapely.line_merge(shapely.union_all(segs))
    lines = list(merged.geoms) if merged.geom_type == "MultiLineString" else [merged]
    main_line, diag = longest_path(lines, SNAP_PX * ext.pixel_size)
    diag.update({"source_segments": len(segs), "ids": sorted(rivernums)})
    if diag["components"] > 1:
        print(f"  note: {diag['components']} disconnected pieces; kept the longest path",
              file=sys.stderr)  # fmt: skip

    line = shapely.simplify(main_line, TOLERANCE_PX * ext.pixel_size, preserve_topology=True)
    coords = np.asarray(shapely.transform(line, _to_lonlat).coords)
    e_first, e_last = end_elevation(coords), end_elevation(coords[::-1])
    if e_first < e_last:
        coords, e_first, e_last = coords[::-1], e_last, e_first
    seg_km = geodesic_km(coords)
    cum = np.concatenate([[0.0], np.cumsum(seg_km)])
    props = {
        "id": f"river-{slugify(name)}",
        "name_en": name,
        "type": "River main stem",
        "scalerank": None,
        "source_ids": sorted(rivernums),
        "length_km": round(float(cum[-1]), 1),
        "source_elev_m": round(e_first),
        "mouth_elev_m": round(e_last),
        "cumfrac": [round(float(v), 5) for v in cum / cum[-1]],
    }
    feature = {
        "type": "Feature",
        "properties": props,
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [round(float(x), DECIMALS), round(float(y), DECIMALS)] for x, y in coords
            ],  # fmt: skip
        },
    }
    return feature, diag


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(
        prog="python -m vap.geo.river",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--plate", required=True)
    ap.add_argument("--name", required=True, help='Natural Earth name, e.g. "Yellow"')
    ap.add_argument("--also", default="", help="extra NE reach names, comma-separated")
    args = ap.parse_args(argv)
    also = [a.strip() for a in args.also.split(",") if a.strip()]

    feature, diag = build(args.plate, args.name, also)
    p = feature["properties"]
    out = PROCESSED_DIR / args.plate / "rivers" / f"{slugify(args.name)}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        {"type": "FeatureCollection", "features": [feature]},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    out.write_text(text, encoding="utf-8")
    start, end = feature["geometry"]["coordinates"][0], feature["geometry"]["coordinates"][-1]
    print(f"{args.name}: {diag['source_segments']} NE segments ({', '.join(diag['ids'])}) -> "
          f"{diag['pieces']} merged piece(s), {diag['components']} component(s) -> 1 LineString "
          f"of {len(p['cumfrac'])} vertices, {p['length_km']:.0f} km")  # fmt: skip
    print(f"  source {start} at {p['source_elev_m']} m -> mouth {end} at {p['mouth_elev_m']} m")
    print(f"  -> {out} ({out.stat().st_size / 1e3:.1f} kB)")
    mirror_to_public(args.plate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
