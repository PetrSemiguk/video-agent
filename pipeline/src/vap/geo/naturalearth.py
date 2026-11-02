"""Natural Earth v5.1.2 vector layers (public domain), cached as GeoJSON in data/raw/naturalearth/.

Source: the GeoJSON exports in github.com/nvkelso/natural-earth-vector at tag v5.1.2
(identical content to the naturalearthdata.com shapefiles, no GDAL needed to read them).
"""

from __future__ import annotations

import json
from pathlib import Path

from .download import download_many
from .paths import RAW_DIR

NE_VERSION = "v5.1.2"
BASE_URL = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_VERSION}/geojson/"
NE_DIR = RAW_DIR / "naturalearth" / NE_VERSION

# Source layer stems per scale. Output layers combine several sources (see extract.py).
SOURCES: dict[str, dict[str, list[str]]] = {
    "countries": {"10m": ["admin_0_countries"], "50m": ["admin_0_countries"]},
    "admin1": {"10m": ["admin_1_states_provinces"], "50m": ["admin_1_states_provinces"]},
    "coastline": {"10m": ["coastline"], "50m": ["coastline"]},
    "land": {"10m": ["land"], "50m": ["land"]},
    "ocean": {"10m": ["ocean"], "50m": ["ocean"]},
    "rivers": {
        "10m": ["rivers_lake_centerlines", "rivers_europe", "rivers_north_america"],
        "50m": ["rivers_lake_centerlines"],
    },
    "lakes": {"10m": ["lakes"], "50m": ["lakes"]},
    "regions": {
        "10m": ["geography_regions_polys", "geography_regions_points", "geography_marine_polys"],
        "50m": ["geography_regions_polys", "geography_regions_points", "geography_marine_polys"],
    },
    "places": {"10m": ["populated_places"], "50m": ["populated_places"]},
}
# admin_1 exists only at 10m; 50m requests fall back to it.
ONLY_10M = {"admin_1_states_provinces", "rivers_europe", "rivers_north_america"}


def file_name(scale: str, stem: str) -> str:
    return f"ne_{scale}_{stem}.geojson"


def path_for(scale: str, stem: str) -> Path:
    if stem in ONLY_10M:
        scale = "10m"
    return NE_DIR / file_name(scale, stem)


def ensure(scales: tuple[str, ...] = ("10m", "50m")) -> list[Path]:
    """Download every catalogued layer for the given scales (cached)."""
    paths = sorted({path_for(s, stem) for layer in SOURCES.values() for s in scales
                    for stem in layer[s]})  # fmt: skip
    download_many([(BASE_URL + p.name, p) for p in paths], workers=6)
    return paths


def load(scale: str, stem: str) -> dict:
    path = path_for(scale, stem)
    if not path.exists():
        download_many([(BASE_URL + path.name, path)], workers=1)
    return json.loads(path.read_text(encoding="utf-8"))
