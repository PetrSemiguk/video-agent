"""Flicker metric for a section of a video where the camera is supposed to be static.

uv run python -m vap.qa.flicker <mp4> --from 9.2 --to 12

Compares the luma (Y, 0..255) of every pair of consecutive frames:
- mean: mean |dY| over all pixels and all pairs;
- max:  largest |dY| of any pixel in any pair;
- pct>4: share of pixels whose |dY| exceeds 4 levels (averaged over pairs);
- worst pair: highest per-pair mean |dY| and its frame index.
A perfectly static section scores ~0 on every metric.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .video import frames

THRESHOLD = 4


def measure(path: Path, start: float, end: float) -> dict:
    prev: np.ndarray | None = None
    means, pcts = [], []
    max_abs = 0
    for frame in frames(path, start, end, "gray"):
        cur = frame.astype(np.int16)
        if prev is not None:
            diff = np.abs(cur - prev)
            means.append(float(diff.mean()))
            pcts.append(float((diff > THRESHOLD).mean() * 100))
            max_abs = max(max_abs, int(diff.max()))
        prev = cur
    if not means:
        raise ValueError("fewer than two frames in the requested range")
    worst = int(np.argmax(means))
    return {
        "file": str(path),
        "range_s": [start, end],
        "pairs": len(means),
        "mean_abs": round(float(np.mean(means)), 4),
        "max_abs": max_abs,
        "pct_gt4": round(float(np.mean(pcts)), 4),
        "worst_pair_mean": round(means[worst], 4),
        "worst_pair_index": worst,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.qa.flicker", description=__doc__)
    ap.add_argument("video", type=Path)
    ap.add_argument("--from", dest="start", type=float, required=True)
    ap.add_argument("--to", dest="end", type=float, required=True)
    args = ap.parse_args(argv)
    print(json.dumps(measure(args.video, args.start, args.end), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
