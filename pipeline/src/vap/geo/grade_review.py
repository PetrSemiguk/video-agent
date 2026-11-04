"""Rebuild the two step 2.1 plates and save reproducible v1/v2 review images.

uv run python -m vap.geo.grade_review
Uses the original metadata extents and existing licensed source cache.
"""

import json

import numpy as np
from PIL import Image

from . import bluemarble, terrain
from .look import (
    LUMA,
    apply_grade,
    apply_hillshade,
    hillshade,
    load_grades,
    load_plate_look,
    ocean_mask,
)
from .mercator import Extent
from .paths import PLATES_DIR, REPO_ROOT


def save(path, rgb):
    Image.fromarray(np.uint8(np.clip(rgb * 255 + 0.5, 0, 255))).save(path)


def main():
    grades = load_grades()
    metrics = {}
    for name, label in [("china-east-hs05", "china"), ("europe", "europe")]:
        path = PLATES_DIR / f"{name}.json"
        meta = json.loads(path.read_text(encoding="utf-8"))
        ext = Extent(*meta["bbox_3857"], meta["width"], meta["height"])
        print(f"Rebuilding {name}", flush=True)
        rgb = bluemarble.render(ext)
        elev, _ = terrain.render(ext)
        shade = hillshade(elev, ext, exaggeration=meta["params"]["exaggeration"])
        old_input = apply_hillshade(rgb, shade, 0.5)
        new_input = apply_hillshade(rgb, shade, load_plate_look()["hillshade"])
        v1 = apply_grade(old_input, grades["dark_v1"], elev)
        v2 = apply_grade(new_input, grades["dark"], elev)
        grade_only = apply_grade(old_input, grades["dark"], elev)
        water = ocean_mask(old_input, elev, grades["dark"]["ocean"]["feather_px"])
        before, after = v1 @ LUMA, grade_only @ LUMA
        mid = (water == 0) & (before > 0.06) & (before < 0.35)
        sea = water == 1
        metrics[label] = {
            "land_midtone_pixels": int(mid.sum()),
            "grade_only_midtone_lift_percent": float(np.median(after[mid] / before[mid] - 1) * 100),
            "sea_pixels": int(sea.sum()),
            "grade_only_sea_max_delta": float(np.max(np.abs(grade_only[sea] - v1[sea]))),
            "combined_sea_mean_delta": float(np.mean(np.abs(v2[sea] - v1[sea]))),
            "v1_land_p99": float(np.percentile(before[water == 0], 99)),
            "v2_land_p99": float(np.percentile((v2 @ LUMA)[water == 0], 99)),
        }
        for version, image in [("v1", v1), ("v2", v2)]:
            save(PLATES_DIR / f"review-{label}-{version}.png", image)
        save(PLATES_DIR / f"{name}.png", v2)
        meta["params"].update(
            hillshade=load_plate_look()["hillshade"], grade="dark", grade_version=2
        )
        path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(metrics[label], flush=True)
    out = REPO_ROOT / "studio" / "out" / "grade-metrics.json"
    out.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
