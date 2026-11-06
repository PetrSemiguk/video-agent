"""Two grades of one plate side by side, whole frame and a crop at full resolution.

uv run python -m vap.geo.grade_compare --plate egypt --before dark_v2 --after dark \
    --crop 29.5,28.5,32.5,31.2 --out studio/out/grade-compare-egypt.png

Renders the plate's own source once from the licensed cache and grades it twice, so the two
halves differ only by the grade. The crop is a lon/lat box shown at the plate's own pixels,
for judging whether a feature reads, which a downscaled frame cannot show.
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

from . import bluemarble, terrain
from .look import apply_grade, apply_hillshade, hillshade, load_grades
from .mercator import Extent
from .paths import PLATES_DIR, REPO_ROOT

LABEL_PAD = 14


def to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(np.uint8(np.clip(rgb * 255 + 0.5, 0, 255)))


def stack(pairs: list[tuple[str, Image.Image]]) -> Image.Image:
    width = max(image.width for _, image in pairs)
    height = sum(image.height for _, image in pairs)
    sheet = Image.new("RGB", (width, height), (12, 14, 18))
    draw_y = 0
    for name, image in pairs:
        sheet.paste(image, (0, draw_y))
        draw = ImageDraw.Draw(sheet)
        draw.rectangle([0, draw_y, 260, draw_y + 34 + LABEL_PAD], fill=(12, 14, 18))
        draw.text((LABEL_PAD, draw_y + LABEL_PAD), name, fill=(235, 238, 242))
        draw_y += image.height
    return sheet


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.geo.grade_compare", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)  # fmt: skip
    ap.add_argument("--plate", required=True)
    ap.add_argument("--before", default="dark_v2")
    ap.add_argument("--after", default="dark")
    ap.add_argument("--crop", default=None, help="lon,lat,lon,lat shown at plate resolution")
    ap.add_argument("--width", type=int, default=1600, help="width of each whole-frame row")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    meta = json.loads((PLATES_DIR / f"{args.plate}.json").read_text(encoding="utf-8"))
    ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
    grades = load_grades()
    print(f"Rendering {args.plate} source once", flush=True)
    rgb = bluemarble.render(ext)
    elev, _ = terrain.render(ext)
    shade = hillshade(elev, ext, exaggeration=meta["params"]["exaggeration"])
    base = apply_hillshade(rgb, shade, meta["params"]["hillshade"])

    rows: list[tuple[str, Image.Image]] = []
    crops: list[tuple[str, Image.Image]] = []
    for name in (args.before, args.after):
        graded = to_image(apply_grade(base, grades[name], elev))
        scale = args.width / graded.width
        rows.append((name, graded.resize((args.width, max(1, round(graded.height * scale))))))
        if args.crop:
            west, south, east, north = (float(v) for v in args.crop.split(","))
            x0, y0 = ext.lonlat_to_px(west, north)
            x1, y1 = ext.lonlat_to_px(east, south)
            crops.append((f"{name} (crop)", graded.crop((int(x0), int(y0), int(x1), int(y1)))))
    sheet = stack(rows + crops)
    out = REPO_ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{sheet.width}x{sheet.height} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
