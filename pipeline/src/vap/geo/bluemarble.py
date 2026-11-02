"""NASA Blue Marble Next Generation (topography + bathymetry, 500 m, 2004).

Eight 21600x21600 JPEG tiles per month, plate carree. Columns A-D span 90 degrees of
longitude from -180; row 1 is 90N..0, row 2 is 0..90S. 240 px per degree (15 arc-seconds).
"""

from __future__ import annotations

import math
import warnings

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import NotGeoreferencedWarning
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.windows import Window

from .download import download_many
from .mercator import Extent, R
from .paths import BLUEMARBLE_DIR

MONTH = 8  # August 2004: least snow over mid-latitude mountains (see docs/maps.md)
MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]  # fmt: skip
BASE_URL = (
    "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/"
    "bmng-topography-bathymetry/{month_name}/"
)
TILE_PX = 21600
TILE_DEG = 90.0
PX_PER_DEG = TILE_PX / TILE_DEG


def tile_name(col: str, row: int, month: int = MONTH) -> str:
    return f"world.topo.bathy.2004{month:02d}.3x21600x21600.{col}{row}.jpg"


def tile_url(col: str, row: int, month: int = MONTH) -> str:
    return BASE_URL.format(month_name=MONTH_NAMES[month - 1]) + tile_name(col, row, month)


def tiles_for(bounds: tuple[float, float, float, float]) -> list[tuple[str, int]]:
    """Tiles (column letter, row) intersecting lon/lat bounds."""
    min_lon, min_lat, max_lon, max_lat = bounds
    out = []
    for i, col in enumerate("ABCD"):
        lon0 = -180 + i * TILE_DEG
        if max_lon <= lon0 or min_lon >= lon0 + TILE_DEG:
            continue
        for row, (lat_lo, lat_hi) in ((1, (0.0, 90.0)), (2, (-90.0, 0.0))):
            if max_lat > lat_lo and min_lat < lat_hi:
                out.append((col, row))
    return out


def tile_origin(col: str, row: int) -> tuple[float, float]:
    """Top-left (lon, lat) of a tile."""
    return -180 + "ABCD".index(col) * TILE_DEG, 90.0 if row == 1 else 0.0


def render(ext: Extent, month: int = MONTH) -> np.ndarray:
    """Blue Marble reprojected onto ext; float32 RGB in 0..1, shape (H, W, 3)."""
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    paths = {t: BLUEMARBLE_DIR / tile_name(*t, month) for t in tiles_for(ext.bbox_lonlat)}
    download_many([(tile_url(*t, month), p) for t, p in paths.items()], workers=3)

    # Source sampling: ~2x the plate's finest angular density, never finer than native.
    deg_per_px = math.degrees(ext.pixel_size / R)
    lat_factor = math.cos(math.radians(max(abs(min_lat), abs(max_lat))))
    src_deg = max(1 / PX_PER_DEG, deg_per_px * lat_factor / 2)
    decim = src_deg * PX_PER_DEG

    dst = np.zeros((3, ext.height, ext.width), dtype=np.float32)
    dst_transform = from_origin(ext.min_x, ext.max_y, ext.pixel_size, ext.pixel_size)
    pad = 4 * src_deg  # a few source px around the window for resampling
    for (col, row), path in paths.items():
        lon0, lat0 = tile_origin(col, row)
        c0 = max(0, math.floor((min_lon - pad - lon0) * PX_PER_DEG))
        c1 = min(TILE_PX, math.ceil((max_lon + pad - lon0) * PX_PER_DEG))
        r0 = max(0, math.floor((lat0 - max_lat - pad) * PX_PER_DEG))
        r1 = min(TILE_PX, math.ceil((lat0 - min_lat + pad) * PX_PER_DEG))
        if c1 <= c0 or r1 <= r0:
            continue
        out_w = max(1, round((c1 - c0) / decim))
        out_h = max(1, round((r1 - r0) / decim))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", NotGeoreferencedWarning)
            with rasterio.open(path) as src:
                data = src.read(
                    window=Window(c0, r0, c1 - c0, r1 - r0),
                    out_shape=(3, out_h, out_w),
                    resampling=Resampling.average,
                )
        src_transform = from_origin(
            lon0 + c0 / PX_PER_DEG,
            lat0 - r0 / PX_PER_DEG,
            (c1 - c0) / PX_PER_DEG / out_w,
            (r1 - r0) / PX_PER_DEG / out_h,
        )
        # An extra coverage band marks where this tile has data, so tiles mosaic seamlessly.
        src_arr = np.concatenate(
            [data.astype(np.float32) / 255.0, np.ones((1, out_h, out_w), np.float32)]
        )
        part = np.zeros((4, ext.height, ext.width), dtype=np.float32)
        reproject(
            src_arr,
            part,
            src_transform=src_transform,
            src_crs="EPSG:4326",
            dst_transform=dst_transform,
            dst_crs="EPSG:3857",
            resampling=Resampling.bilinear,
            src_nodata=None,
            dst_nodata=None,
        )
        mask = part[3] > 0.5
        dst[:, mask] = part[:3, mask] / part[3, mask]
    return np.clip(dst.transpose(1, 2, 0), 0.0, 1.0)
