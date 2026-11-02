"""Make a river line reach the water it flows into.

Natural Earth ends some rivers where a wide estuary begins: the estuary is part of the ocean
polygon (e.g. the Yangtze stops at Zhenjiang, ~250 km from the sea). Three methods, in order:

1. manual: data/processed/<plate>/rivers/<slug>.extend.json = {"points": [[lon, lat], ...]}
   is appended to the mouth (Catmull-Rom smoothed). Always wins when present.
2. estuary (automatic): if the mouth touches the ocean polygon, the ocean around it is
   rasterised (~0.5 km cells); distance to shore comes from repeated erosion of the water mask;
   Dijkstra with a step cost that grows near the shore finds the centre line to open water
   (>= OPEN_WATER_KM from shore). The path is cut at its last point within MOUTH_KM of the
   coastline (the estuary exit), smoothed (Chaikin) and appended.
3. nearest water: if the mouth is farther than MOUTH_KM from coastline and lakes, a straight
   segment to the nearest coastline/lake point (<= MAX_GAP_KM) is appended.
"""

from __future__ import annotations

import heapq
import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point, box, shape
from shapely.ops import nearest_points

from . import naturalearth as ne

MOUTH_KM = 5.0
OPEN_WATER_KM = 15.0
MAX_GAP_KM = 60.0
WINDOW_KM = 400.0
CELL_KM = 0.5
SHORE_PENALTY = 6.0
KM_PER_DEG = 111.32


def _local_km(lon0: float, lat0: float):
    """Equirectangular km projection around (lon0, lat0) and its inverse (vectorised)."""
    kx = KM_PER_DEG * math.cos(math.radians(lat0))

    def fwd(c: np.ndarray) -> np.ndarray:
        return np.column_stack([(c[:, 0] - lon0) * kx, (c[:, 1] - lat0) * KM_PER_DEG])

    def inv(c: np.ndarray) -> np.ndarray:
        return np.column_stack([c[:, 0] / kx + lon0, c[:, 1] / KM_PER_DEG + lat0])

    return fwd, inv


def _layer_near(stem: str, win) -> list:
    out = []
    for f in ne.load("10m", stem)["features"]:
        g = shape(f["geometry"])
        if g.intersects(win):
            out.append(g.intersection(win))
    return out


def water_distance_km(lon: float, lat: float) -> float:
    """km from a point to the nearest coastline or lake shore (10m data)."""
    d = 3.0
    win = box(lon - d, lat - d, lon + d, lat + d)
    fwd, _ = _local_km(lon, lat)
    geoms = _layer_near("coastline", win) + [g.boundary for g in _layer_near("lakes", win)]
    if not geoms:
        return math.inf
    target = shapely.transform(shapely.union_all(geoms), fwd)
    return float(shapely.distance(Point(0, 0), target))


def chaikin(pts: np.ndarray, rounds: int = 3) -> np.ndarray:
    for _ in range(rounds):
        q = 0.75 * pts[:-1] + 0.25 * pts[1:]
        r = 0.25 * pts[:-1] + 0.75 * pts[1:]
        mid = np.empty((len(q) * 2, 2))
        mid[0::2], mid[1::2] = q, r
        pts = np.vstack([pts[:1], mid, pts[-1:]])
    return pts


def _estuary_path(lon: float, lat: float) -> np.ndarray | None:
    deg = WINDOW_KM / KM_PER_DEG
    win = box(lon - deg / math.cos(math.radians(lat)), lat - deg,
              lon + deg / math.cos(math.radians(lat)), lat + deg)  # fmt: skip
    oceans = _layer_near("ocean", win)
    if not oceans:
        return None
    fwd, inv = _local_km(lon, lat)
    ocean = shapely.transform(shapely.union_all(oceans), fwd)
    if shapely.distance(Point(0, 0), ocean) > 1.0:
        return None  # the mouth is not on the sea

    n = int(2 * WINDOW_KM / CELL_KM)
    axis = (np.arange(n) + 0.5) * CELL_KM - WINDOW_KM
    gx, gy = np.meshgrid(axis, axis)
    water = shapely.contains_xy(ocean, gx, gy)
    # Distance to shore in cells: count how many 8-neighbour erosions each cell survives.
    dist = np.zeros(water.shape, dtype=np.int32)
    cur = water.copy()
    cap = int(OPEN_WATER_KM / CELL_KM) + 2
    for _ in range(cap):
        dist += cur
        p = np.pad(cur, 1, constant_values=False)
        nxt = cur.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nxt &= p[1 + dy : 1 + dy + n, 1 + dx : 1 + dx + n]
        cur = nxt
    # Start: water cell nearest the river mouth (the grid centre).
    ys, xs = np.nonzero(water)
    k = np.argmin((xs - n / 2) ** 2 + (ys - n / 2) ** 2)
    start = (int(ys[k]), int(xs[k]))
    open_cells = dist * CELL_KM >= OPEN_WATER_KM

    best = {start: 0.0}
    prev: dict[tuple[int, int], tuple[int, int]] = {}
    heap = [(0.0, start)]
    goal = None
    steps = [(dy, dx, math.hypot(dy, dx)) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    while heap:
        c, (y, x) = heapq.heappop(heap)
        if c > best[(y, x)]:
            continue
        if open_cells[y, x]:
            goal = (y, x)
            break
        for dy, dx, step in steps:
            yy, xx = y + dy, x + dx
            if 0 <= yy < n and 0 <= xx < n and water[yy, xx]:
                nc = c + step * (1 + SHORE_PENALTY / max(dist[yy, xx], 1))
                if nc < best.get((yy, xx), math.inf):
                    best[(yy, xx)] = nc
                    prev[(yy, xx)] = (y, x)
                    heapq.heappush(heap, (nc, (yy, xx)))
    if goal is None:
        return None
    cells = [goal]
    while cells[-1] != start:
        cells.append(prev[cells[-1]])
    cells.reverse()
    km = np.array([[axis[x], axis[y]] for y, x in cells])
    coast = shapely.transform(shapely.union_all(_layer_near("coastline", win)), fwd)
    d_coast = shapely.distance(shapely.points(km), coast)
    within = np.nonzero(d_coast <= MOUTH_KM)[0]
    if len(within) == 0:
        return None
    km = km[: within[-1] + 1]
    if len(km) < 3:
        return None
    km = chaikin(shapely.get_coordinates(shapely.simplify(shapely.LineString(km), CELL_KM)))
    return inv(km)


def _catmull(points: np.ndarray, per_seg: int = 8) -> np.ndarray:
    p = np.vstack([points[:1], points, points[-1:]])
    out = [points[0]]
    for i in range(1, len(p) - 2):
        for t in np.linspace(0, 1, per_seg + 1)[1:]:
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p[i]) + (-p[i - 1] + p[i + 1]) * t
                              + (2 * p[i - 1] - 5 * p[i] + 4 * p[i + 1] - p[i + 2]) * t2
                              + (-p[i - 1] + 3 * p[i] - 3 * p[i + 1] + p[i + 2]) * t3))  # fmt: skip
    return np.asarray(out)


def extend_to_water(coords: np.ndarray, manual: Path | None) -> tuple[np.ndarray, dict]:
    """coords: lon/lat, source -> mouth. Returns (coords, info for properties)."""
    lon, lat = coords[-1]
    before = water_distance_km(lon, lat)
    info = {"extended": False, "mouth_to_water_km_before": round(before, 2)}
    if manual is not None and manual.exists():
        pts = np.asarray(json.loads(manual.read_text(encoding="utf-8"))["points"], dtype=float)
        tail = _catmull(np.vstack([coords[-2:], pts]))[1:]
        coords = np.vstack([coords[:-1], tail])
        info.update(extended=True, extend_method=f"manual waypoints ({manual.name})")
    else:
        path = _estuary_path(lon, lat)
        if path is not None:
            coords = np.vstack([coords, path[1:]])
            info.update(extended=True, extend_method="auto: estuary centre line (ocean polygon)")
        elif before > MOUTH_KM:
            win = box(lon - 1, lat - 1, lon + 1, lat + 1)
            geoms = _layer_near("coastline", win) + [g.boundary for g in _layer_near("lakes", win)]
            fwd, inv = _local_km(lon, lat)
            if geoms:
                target = shapely.transform(shapely.union_all(geoms), fwd)
                near = nearest_points(Point(0, 0), target)[1]
                if near.distance(Point(0, 0)) <= MAX_GAP_KM:
                    coords = np.vstack([coords, inv(np.array([[near.x, near.y]]))])
                    info.update(extended=True, extend_method="auto: straight to nearest shore")
    lon, lat = coords[-1]
    info["mouth_to_water_km"] = round(water_distance_km(lon, lat), 2)
    return coords, info
