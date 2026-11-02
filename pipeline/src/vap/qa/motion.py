"""Camera smoothness from the rendered video: image shift speed between consecutive frames.

uv run python -m vap.qa.motion <mp4> [--out <png>] [--marks 4,9,12,24]

Each pair of consecutive frames is compared by phase correlation (grey, downscaled to
480x270, Hann window, sub-pixel peak). The shift is converted back to full-frame pixels;
speed = |shift| per frame. A "jump" is the change of the shift vector between consecutive
frame pairs (px/frame²). Zoom is not a translation, so pure zooms read as ~0 speed; the
metric is about pans and their continuity. Writes a PNG chart (speed and jump over time)
and prints max speed, max jump and where it happens.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .video import frames, probe_size

SMALL = (480, 270)


def shift(a: np.ndarray, b: np.ndarray, win: np.ndarray) -> tuple[float, float]:
    """Translation (dx, dy) that maps frame a onto frame b, in small-frame pixels."""
    fa = np.fft.fft2((a - a.mean()) * win)
    fb = np.fft.fft2((b - b.mean()) * win)
    r = fb * np.conj(fa)
    r /= np.abs(r) + 1e-9
    c = np.fft.ifft2(r).real
    py, px = np.unravel_index(np.argmax(c), c.shape)
    h, w = c.shape

    def sub(c0: float, cm: float, cp: float) -> float:
        d = cm - 2 * c0 + cp
        return 0.0 if abs(d) < 1e-12 else 0.5 * (cm - cp) / d

    dy = py + sub(c[py, px], c[(py - 1) % h, px], c[(py + 1) % h, px])
    dx = px + sub(c[py, px], c[py, (px - 1) % w], c[py, (px + 1) % w])
    if dy > h / 2:
        dy -= h
    if dx > w / 2:
        dx -= w
    return float(dx), float(dy)


def measure(path: Path) -> dict:
    full_w, _ = probe_size(path)
    k = full_w / SMALL[0]
    win = np.outer(np.hanning(SMALL[1]), np.hanning(SMALL[0]))
    prev = None
    shifts = []
    for f in frames(path, pix_fmt="gray", size=SMALL):
        cur = f.astype(np.float64)
        if prev is not None:
            dx, dy = shift(prev, cur, win)
            shifts.append((dx * k, dy * k))
        prev = cur
    s = np.asarray(shifts)
    speed = np.hypot(s[:, 0], s[:, 1])
    jump = np.hypot(*np.diff(s, axis=0).T)
    return {"shifts": s, "speed": speed, "jump": jump}


def plot(speed: np.ndarray, jump: np.ndarray, fps: float, out: Path, marks: list[float]) -> None:
    W, H, pad = 1600, 600, 60
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    n = len(speed)
    top = max(float(speed.max()), float(jump.max()), 1.0) * 1.1

    def xy(i: float, v: float) -> tuple[float, float]:
        return pad + i / max(n - 1, 1) * (W - 2 * pad), H - pad - v / top * (H - 2 * pad)

    d.rectangle([pad, pad, W - pad, H - pad], outline=(180, 180, 180))
    for t in range(0, int(n / fps) + 1):
        x, _ = xy(t * fps, 0)
        d.line([x, H - pad, x, H - pad + 6], fill=(120, 120, 120))
        d.text((x - 6, H - pad + 10), f"{t}s", fill=(80, 80, 80))
    for m in marks:
        x, _ = xy(m * fps, 0)
        d.line([x, pad, x, H - pad], fill=(230, 200, 120))
    d.line([xy(i, v) for i, v in enumerate(speed)], fill=(40, 110, 200), width=2)
    d.line([xy(i + 1, v) for i, v in enumerate(jump)], fill=(220, 60, 60), width=1)
    d.text((pad, 20), f"speed px/frame (blue), jump px/frame^2 (red); max {top / 1.1:.2f}",
           fill=(0, 0, 0))  # fmt: skip
    img.save(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.qa.motion", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)  # fmt: skip
    ap.add_argument("video", type=Path)
    ap.add_argument(
        "--out", type=Path, default=None, help="chart PNG (default: <video>-motion.png)"
    )
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--marks", default="", help="seconds to mark on the chart (e.g. joints)")
    args = ap.parse_args(argv)
    r = measure(args.video)
    out = args.out or args.video.with_name(args.video.stem + "-motion.png")
    marks = [float(m) for m in args.marks.split(",") if m.strip()]
    plot(r["speed"], r["jump"], args.fps, out, marks)
    j = int(np.argmax(r["jump"]))
    summary = {
        "pairs": len(r["speed"]),
        "max_speed_px": round(float(r["speed"].max()), 2),
        "mean_speed_px": round(float(r["speed"].mean()), 2),
        "max_jump_px": round(float(r["jump"][j]), 2),
        "max_jump_at_s": round((j + 1) / args.fps, 2),
        "p99_jump_px": round(float(np.percentile(r["jump"], 99)), 2),
        "chart": str(out),
    }
    if marks:
        near = {}
        for m in marks:
            f = int(m * args.fps)
            near[m] = round(float(r["jump"][max(0, f - 3) : f + 3].max()), 2)
        summary["max_jump_near_marks"] = near
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
