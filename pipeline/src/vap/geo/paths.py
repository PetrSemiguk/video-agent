"""Repository paths used by the geo tools."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
RAW_DIR = REPO_ROOT / "data" / "raw"
BLUEMARBLE_DIR = RAW_DIR / "bluemarble"
TERRAIN_DIR = RAW_DIR / "terrain"
PLATES_DIR = REPO_ROOT / "studio" / "public" / "plates"
