"""Contact sheet: one row per video, one column per timestamp.

uv run python -m vap.qa.contact a.mp4 b.mp4 --times 0,2,4,6,8,10 --out sheet.png [--thumb 480]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from .video import frames

GAP = 8
LABEL_H = 28


def grab(path: Path, t: float) -> Image.Image:
    frame = next(frames(path, t, None, "rgb24", max_frames=1))
    return Image.fromarray(frame.copy(), "RGB")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.qa.contact", description=__doc__)
    ap.add_argument("videos", type=Path, nargs="+")
    ap.add_argument("--times", required=True, help="comma-separated seconds")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--thumb", type=int, default=480, help="thumbnail width in px")
    ap.add_argument("--labels", help="comma-separated row labels (default: file names)")
    args = ap.parse_args(argv)

    times = [float(t) for t in args.times.split(",")]
    labels = args.labels.split(",") if args.labels else [v.stem for v in args.videos]
    rows = [[grab(v, t) for t in times] for v in args.videos]
    tw = args.thumb
    th = round(rows[0][0].height * tw / rows[0][0].width)
    sheet = Image.new(
        "RGB",
        (len(times) * (tw + GAP) + GAP, len(rows) * (th + LABEL_H + GAP) + GAP),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for r, (row, label) in enumerate(zip(rows, labels, strict=True)):
        y = GAP + r * (th + LABEL_H + GAP)
        for c, (img, t) in enumerate(zip(row, times, strict=True)):
            x = GAP + c * (tw + GAP)
            draw.text((x, y + 6), f"{label} · {t:g} s", fill="black")
            sheet.paste(img.resize((tw, th), Image.Resampling.LANCZOS), (x, y + LABEL_H))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"{args.out} ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
