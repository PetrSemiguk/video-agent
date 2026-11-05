"""Review sheet and mobile legibility sheets from `review:episode` stills.

Needs the preview stage and `npm run review:episode -- <slug>` first.
"""

import argparse
import json
import math
from pathlib import Path

from PIL import Image

from vap.qa.storyboard_preview import render

ROOT = Path(__file__).resolve().parents[4]
MOBILE_WIDTHS = (384, 640)
COLUMNS = 2


def build(slug: str, out: Path) -> dict:
    reviews = json.loads((out / f"{slug}-review.json").read_text(encoding="utf-8"))
    payload = json.loads((out / f"{slug}-preview-input.json").read_text(encoding="utf-8"))
    for row, review in zip(payload["shots"], reviews, strict=True):
        if row["id"] != review["id"]:
            raise ValueError(f"Shot order differs: {row['id']} / {review['id']}")
        row["image"], row["from"] = review["image"], review["frame"]
    result = render(payload, out / f"{slug}-review-sheet.png")
    ratio = payload["height"] / payload["width"]
    rows = math.ceil(len(reviews) / COLUMNS)
    for width in MOBILE_WIDTHS:
        height = round(width * ratio)
        sheet = Image.new("RGB", (COLUMNS * width, rows * height), payload["style"]["background"])
        for index, review in enumerate(reviews):
            with Image.open(review["image"]) as frame:
                mobile = frame.resize((width, height), Image.Resampling.LANCZOS)
            mobile.save(out / f"{slug}-mobile-{width}-{review['id']}.png")
            sheet.paste(mobile, ((index % COLUMNS) * width, (index // COLUMNS) * height))
        sheet.save(out / f"{slug}-mobile-{width}.png")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug")
    args = parser.parse_args()
    print(json.dumps(build(args.slug, ROOT / "studio/out")))


if __name__ == "__main__":
    main()
