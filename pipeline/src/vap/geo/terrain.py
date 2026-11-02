"""AWS Terrain Tiles (Mapzen/Tilezen joerd), terrarium PNG encoding, Web Mercator XYZ."""

from __future__ import annotations

import math

import numpy as np
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject

from .download import download_many
from .mercator import WORLD_M, Extent
from .paths import TERRAIN_DIR

URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TILE = 256
MAX_ZOOM = 12
MAX_TILES = 2500


def tile_range(ext: Extent, z: int) -> tuple[int, int, int, int]:
    """Inclusive XYZ tile range (x0, x1, y0, y1) covering ext at zoom z."""
    n = 2**z
    tile_m = WORLD_M / n
    x0 = max(0, math.floor((ext.min_x + WORLD_M / 2) / tile_m))
    x1 = min(n - 1, math.floor((ext.max_x + WORLD_M / 2) / tile_m))
    y0 = max(0, math.floor((WORLD_M / 2 - ext.max_y) / tile_m))
    y1 = min(n - 1, math.floor((WORLD_M / 2 - ext.min_y) / tile_m))
    return x0, x1, y0, y1


def pick_zoom(ext: Extent) -> int:
    """Smallest zoom whose native pixel is at least as fine as the plate pixel."""
    z = max(0, min(MAX_ZOOM, math.ceil(math.log2(WORLD_M / TILE / ext.pixel_size))))
    while z > 0:
        x0, x1, y0, y1 = tile_range(ext, z)
        if (x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES:
            break
        z -= 1
    return z


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    """Terrarium: elevation_m = R * 256 + G + B / 256 - 32768."""
    rgb = rgb.astype(np.float32)
    return rgb[..., 0] * 256.0 + rgb[..., 1] + rgb[..., 2] / 256.0 - 32768.0


def tile_path(z: int, x: int, y: int):
    return TERRAIN_DIR / "terrarium" / str(z) / str(x) / f"{y}.png"


def render(ext: Extent) -> tuple[np.ndarray, int]:
    """Elevation in metres on ext's grid (float32, shape (H, W)) and the zoom used."""
    z = pick_zoom(ext)
    x0, x1, y0, y1 = tile_range(ext, z)
    coords = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    download_many([(URL.format(z=z, x=x, y=y), tile_path(z, x, y)) for x, y in coords], 16)

    mosaic = np.zeros(((y1 - y0 + 1) * TILE, (x1 - x0 + 1) * TILE), dtype=np.float32)
    for x, y in coords:
        path = tile_path(z, x, y)
        if path.stat().st_size == 0:  # tile missing upstream (404) -> sea level
            continue
        with Image.open(path) as im:
            elev = decode_terrarium(np.asarray(im.convert("RGB")))
        r, c = (y - y0) * TILE, (x - x0) * TILE
        mosaic[r : r + TILE, c : c + TILE] = elev

    tile_m = WORLD_M / 2**z
    src_transform = from_origin(
        -WORLD_M / 2 + x0 * tile_m, WORLD_M / 2 - y0 * tile_m, tile_m / TILE, tile_m / TILE
    )
    dst = np.zeros((ext.height, ext.width), dtype=np.float32)
    reproject(
        mosaic,
        dst,
        src_transform=src_transform,
        src_crs="EPSG:3857",
        dst_transform=from_origin(ext.min_x, ext.max_y, ext.pixel_size, ext.pixel_size),
        dst_crs="EPSG:3857",
        resampling=Resampling.bilinear,
    )
    return dst, z
