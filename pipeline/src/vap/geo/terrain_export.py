"""Copy terrarium tiles covering a plate into studio/public/terrain/{z}/{x}/{y}.png.

uv run python -m vap.geo.terrain_export --plate china-east-hs05 [--min-zoom 3 --max-zoom 7]

Used by MapLibre's raster-dem source (variant A). Missing tiles are downloaded into the
data/raw/terrain/ cache first; tiles that do not exist upstream (404) are skipped.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys

from .download import download_many
from .mercator import Extent
from .paths import PLATES_DIR, REPO_ROOT
from .terrain import URL, tile_path, tile_range

PUBLIC_TERRAIN = REPO_ROOT / "studio" / "public" / "terrain"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.geo.terrain_export", description=__doc__)
    ap.add_argument("--plate", required=True, help="plate name (studio/public/plates/<name>.json)")
    ap.add_argument("--min-zoom", type=int, default=3)
    ap.add_argument("--max-zoom", type=int, default=7)
    args = ap.parse_args(argv)

    meta = json.loads((PLATES_DIR / f"{args.plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])

    copied = skipped = total_bytes = 0
    for z in range(args.min_zoom, args.max_zoom + 1):
        x0, x1, y0, y1 = tile_range(ext, z)
        coords = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
        download_many([(URL.format(z=z, x=x, y=y), tile_path(z, x, y)) for x, y in coords], 16)
        for x, y in coords:
            src = tile_path(z, x, y)
            if src.stat().st_size == 0:
                skipped += 1
                continue
            dst = PUBLIC_TERRAIN / str(z) / str(x) / f"{y}.png"
            if not dst.exists() or dst.stat().st_size != src.stat().st_size:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)
            copied += 1
            total_bytes += src.stat().st_size
        print(f"z{z}: {len(coords)} tiles")
    print(f"{copied} tiles ({total_bytes / 1e6:.1f} MB) in {PUBLIC_TERRAIN}, {skipped} missing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
