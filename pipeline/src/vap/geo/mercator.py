"""Web Mercator (EPSG:3857) math shared by the plate generator and its metadata contract.

Pixel convention: pixel (0, 0) is the top-left *corner* of the image, (width, height) the
bottom-right corner; the centre of pixel (i, j) is (i + 0.5, j + 0.5). The TypeScript side
(studio/src/geo/plate.ts) implements exactly the same formulas — keep them in sync.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

R = 6378137.0  # EPSG:3857 sphere radius, metres
MAX_LAT = 85.0511287798066  # Web Mercator latitude limit
WORLD_M = 2 * math.pi * R  # world width in metres


def lon_to_x(lon: float) -> float:
    return R * math.radians(lon)


def lat_to_y(lat: float) -> float:
    lat = max(-MAX_LAT, min(MAX_LAT, lat))
    return R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def x_to_lon(x: float) -> float:
    return math.degrees(x / R)


def y_to_lat(y: float) -> float:
    return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


@dataclass(frozen=True)
class Extent:
    """A Web Mercator extent mapped onto a width x height pixel grid."""

    min_x: float
    min_y: float
    max_x: float
    max_y: float
    width: int
    height: int

    @property
    def pixel_size(self) -> float:
        """Metres (EPSG:3857) per pixel; identical on both axes."""
        return (self.max_x - self.min_x) / self.width

    @property
    def bbox_lonlat(self) -> tuple[float, float, float, float]:
        return (
            x_to_lon(self.min_x),
            y_to_lat(self.min_y),
            x_to_lon(self.max_x),
            y_to_lat(self.max_y),
        )

    def lonlat_to_px(self, lon: float, lat: float) -> tuple[float, float]:
        px = (lon_to_x(lon) - self.min_x) / (self.max_x - self.min_x) * self.width
        py = (self.max_y - lat_to_y(lat)) / (self.max_y - self.min_y) * self.height
        return px, py

    def zoom(self, tile_size: int = 512) -> float:
        """Equivalent web-mercator zoom: the world is tile_size * 2**z px wide.

        tile_size=512 matches MapLibre GL; tile_size=256 matches classic XYZ tiles.
        """
        return math.log2(WORLD_M / self.pixel_size / tile_size)


def fit_extent(bbox: tuple[float, float, float, float], width: int, height: int) -> Extent:
    """Grow a lon/lat bbox to the width:height aspect in EPSG:3857, keeping its centre."""
    min_lon, min_lat, max_lon, max_lat = bbox
    if not (min_lon < max_lon and min_lat < max_lat):
        raise ValueError(f"invalid bbox {bbox}")
    x0, x1 = lon_to_x(min_lon), lon_to_x(max_lon)
    y0, y1 = lat_to_y(min_lat), lat_to_y(max_lat)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    aspect = width / height
    if w / h < aspect:
        w = h * aspect
    else:
        h = w / aspect
    ext = Extent(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, width, height)
    if ext.max_y > lat_to_y(MAX_LAT) or ext.min_y < lat_to_y(-MAX_LAT):
        raise ValueError("expanded bbox exceeds the Web Mercator latitude limit")
    if ext.min_x < -WORLD_M / 2 or ext.max_x > WORLD_M / 2:
        raise ValueError("expanded bbox crosses the antimeridian (not supported)")
    return ext
