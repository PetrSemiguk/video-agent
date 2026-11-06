"""Hillshade and colour grading for map plates (numpy only)."""

from __future__ import annotations

import json
import math
import re

import numpy as np

from .mercator import Extent, y_to_lat
from .paths import REPO_ROOT

TOKENS_PATH = REPO_ROOT / "studio" / "src" / "design" / "tokens.ts"
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def load_plate_look() -> dict:
    """Read the JSON-compatible token block without executing TypeScript."""
    match = re.search(
        r"export const plateLookJson = String.raw`(\{.*?\})`;",
        TOKENS_PATH.read_text(encoding="utf-8"),
        re.DOTALL,
    )
    if match is None:
        raise ValueError("Missing JSON-compatible plateLook design tokens")
    return json.loads(match.group(1))


def load_grades() -> dict:
    return load_plate_look()["grades"]


def box_blur(a: np.ndarray, radius: int) -> np.ndarray:
    """Separable box blur of a 2D array (edge-padded)."""
    if radius <= 0:
        return a
    k = 2 * radius + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius + 1, radius)
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
        hi = np.take(c, range(k, c.shape[axis]), axis=axis)
        lo = np.take(c, range(0, c.shape[axis] - k), axis=axis)
        a = ((hi - lo) / k).astype(np.float32)
    return a


def hillshade(
    elev: np.ndarray,
    ext: Extent,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    exaggeration: float = 1.0,
) -> np.ndarray:
    """Hillshade normalised so that flat ground == 1.0 (>1 lit slopes, <1 shaded).

    Ground pixel size is the Mercator pixel size scaled by cos(latitude) per row.
    Elevations below sea level are flattened so the ocean stays neutral.
    """
    z = np.maximum(elev, 0.0).astype(np.float32)
    rows = np.arange(ext.height, dtype=np.float64) + 0.5
    lat = np.array([y_to_lat(ext.max_y - r * ext.pixel_size) for r in rows])
    ground = (ext.pixel_size * np.cos(np.radians(lat))).astype(np.float32)[:, None]

    dz_dcol = np.gradient(z, axis=1)
    dz_drow = np.gradient(z, axis=0)
    dzdx = dz_dcol / ground * exaggeration  # east
    dzdy = -dz_drow / ground * exaggeration  # north (rows grow southward)

    az, alt = math.radians(azimuth), math.radians(altitude)
    light = (math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt))
    norm = np.sqrt(dzdx**2 + dzdy**2 + 1.0)
    shade = (-dzdx * light[0] - dzdy * light[1] + light[2]) / norm
    return np.clip(shade, 0.0, None) / math.sin(alt)


def apply_hillshade(rgb: np.ndarray, shade: np.ndarray, strength: float) -> np.ndarray:
    """Flat-normalised multiply: rgb * lerp(1, shade, strength); flat ground is unchanged."""
    if strength <= 0:
        return rgb
    factor = 1.0 + strength * (np.clip(shade, 0.0, 1.6) - 1.0)
    return np.clip(rgb * factor[..., None], 0.0, 1.0)


def ocean_mask(rgb: np.ndarray, elev: np.ndarray | None, feather_px: int) -> np.ndarray:
    """Soft 0..1 water mask: below sea level and blue-dominant (keeps dry depressions)."""
    blueish = rgb[..., 2] > rgb[..., 0] + 0.02
    mask = blueish if elev is None else (elev <= 0.0) & blueish
    return np.clip(box_blur(mask.astype(np.float32), feather_px), 0.0, 1.0)


def apply_grade(rgb: np.ndarray, grade: dict, elev: np.ndarray | None) -> np.ndarray:
    out = rgb.astype(np.float32)
    luma = (out @ LUMA)[..., None]
    out = luma + grade["saturation"] * (out - luma)
    out = np.clip(out * grade["exposure"], 0.0, 1.0) ** grade["gamma"]

    land = grade.get("land")
    if land:
        water_mask = ocean_mask(rgb, elev, int(grade["ocean"]["feather_px"]))
        lum = out @ LUMA
        # Smoothly isolate land midtones; the sea uses exactly the v1 transform.
        low = np.clip(lum / land["mid_start"], 0, 1)
        high = np.clip(
            (land["highlight_start"] - lum) / (land["highlight_start"] - land["mid_end"]), 0, 1
        )
        gain = 1 + land["midtone_lift"] * low * low * (3 - 2 * low) * high * high * (3 - 2 * high)
        lifted = out * gain[..., None]
        ll = lifted @ LUMA
        knee, scale = land["highlight_start"], land["highlight_scale"]
        excess = np.maximum(ll - knee, 0)
        target = np.minimum(ll, knee) + scale * (-np.expm1(-excess / scale))
        lifted *= (target / np.maximum(ll, 1e-8))[..., None]
        out += (1 - water_mask)[..., None] * (lifted - out)

    # Vegetation last among the land terms: the cultivated ground of a dry country is the only
    # green in frame, and it has to read as a dark ribbon against the sand rather than blend in.
    veg = grade.get("vegetation")
    if veg:
        green = out[..., 1] - np.maximum(out[..., 0], out[..., 2])
        on_land = 1.0 - ocean_mask(rgb, elev, int(grade["ocean"]["feather_px"]))
        mask = np.clip(green / veg["pivot"], 0.0, 1.0) * veg["strength"] * on_land
        lum = (out @ LUMA)[..., None]
        toned = (lum + veg["saturate"] * (out - lum)) * (1.0 - veg["darken"])
        out = out + mask[..., None] * (np.clip(toned, 0.0, 1.0) - out)

    ocean = grade["ocean"]
    if ocean["multiply"] != 1.0 or ocean["tint_mix"] > 0:
        m = ocean_mask(rgb, elev, int(ocean["feather_px"]))[..., None]
        tint = np.array(ocean["tint"], dtype=np.float32)
        water = out * ocean["multiply"]
        water = water + ocean["tint_mix"] * (tint - water)
        out = out + m * (water - out)

    vig = grade["vignette"]
    if vig["strength"] > 0:
        h, w = out.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        # r = 1 at the corners, independent of aspect ratio.
        r = np.hypot((xx + 0.5) / w - 0.5, (yy + 0.5) / h - 0.5) / math.hypot(0.5, 0.5)
        t = np.clip((r - vig["inner"]) / (vig["outer"] - vig["inner"]), 0.0, 1.0)
        t = t * t * (3 - 2 * t)  # smoothstep
        out = out * (1.0 - vig["strength"] * t)[..., None]
    return np.clip(out, 0.0, 1.0)
