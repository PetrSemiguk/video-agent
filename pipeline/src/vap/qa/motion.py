"""Camera motion from the rendered video or the camera plan, and the build rule on stills.

uv run python -m vap.qa.motion <mp4> [--out <png>] [--marks 4,9,12,24]
uv run python -m vap.qa.motion --plan <slug>-camera-plan.json --check [--report <json>]
uv run python -m vap.qa.motion <mp4> --plan <slug>-camera-plan.json --check [--report <json>]

Video: each pair of consecutive frames is compared by phase correlation (grey, downscaled to
480x270, Hann window, sub-pixel peak). The shift is converted back to full-frame pixels;
speed = |shift| per frame. A "jump" is the change of the shift vector between consecutive
frame pairs (px/frame²). Zoom is not a translation, so pure zooms read as ~0 speed; the
metric is about pans and their continuity. Writes a PNG chart (speed and jump over time)
and prints max speed, max jump and where it happens.

Plan: the camera pose of every frame, written by `render:episode` before any video exists.
Speed = pan in screen px per frame combined with zoom, as the RMS shift of screen points.

--check applies the build rules. The camera may not stand still: no stretch over MAX_STILL_S below
MIN_SPEED_PX. It may not move too fast either: with a plan, how far the picture moves on screen, pan
and zoom together at the frame's corners, stays within the plan's speedLimitPx. A `drift` passes.
A `hold` passes only when its storyboard shot gives a reason. With a video and a plan, a stretch
where the plan shows a zoom is not counted, since phase correlation cannot see a zoom.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .video import frames, probe_size

SMALL = (480, 270)
# Pilot v1 measured 0.007-0.014 px/frame on its frozen stretch and 0.10-0.15 on a default drift.
MIN_SPEED_PX = 0.03
MAX_STILL_S = 2.0
SMOOTH_FRAMES = 15


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


def plan_speeds(plan: dict) -> tuple[np.ndarray, np.ndarray]:
    """Per-frame pan and zoom motion of a camera plan, in screen px per frame."""
    poses = np.asarray(plan["frames"], dtype=np.float64)
    if len(poses) < 2:
        return np.zeros(0), np.zeros(0)
    world = 2 * math.pi * 6378137.0
    mid_zoom = (poses[1:, 2] + poses[:-1, 2]) / 2
    metres_per_px = world / (512 * 2**mid_zoom)
    deltas = np.diff(poses, axis=0)
    pan = np.hypot(deltas[:, 0], deltas[:, 1]) / metres_per_px
    # RMS distance of a screen point from the centre: a zoom moves points in proportion to it.
    radius = math.hypot(plan["width"], plan["height"]) / math.sqrt(12)
    zoom = np.abs(np.log(2) * deltas[:, 2]) * radius
    return pan, zoom


def screen_motion(plan: dict) -> np.ndarray:
    """How far the picture moves per frame, pan and zoom, at the corner where it moves most."""
    poses = np.asarray(plan["frames"], dtype=np.float64)
    if len(poses) < 2:
        return np.zeros(0)
    world = 2 * math.pi * 6378137.0
    metres_per_px = world / (512 * 2 ** ((poses[1:, 2] + poses[:-1, 2]) / 2))
    deltas = np.diff(poses, axis=0)
    dx, dy = deltas[:, 0] / metres_per_px, deltas[:, 1] / metres_per_px
    k = 2 ** deltas[:, 2] - 1
    half_w, half_h = plan["width"] / 2, plan["height"] / 2
    corners = [np.hypot(dx - k * u * half_w, dy - k * v * half_h) for u in (-1, 1) for v in (-1, 1)]
    return np.max(corners, axis=0)


def too_fast(plan: dict, fps: float) -> list[dict]:
    """Shots where the picture moves faster than the plan's limit."""
    limit = plan.get("speedLimitPx")
    if not limit:
        return []
    motion = screen_motion(plan)
    found = []
    for shot in plan["shots"]:
        span = motion[max(0, shot["from"] - 1) : shot["from"] - 1 + shot["frames"]]
        if len(span) and float(span.max()) > limit:
            found.append(
                {
                    "shot": shot["id"],
                    "peak_px": round(float(span.max()), 2),
                    "at_s": round((shot["from"] + int(span.argmax())) / fps, 2),
                }
            )
    return found


def smoothed(speed: np.ndarray, window: int = SMOOTH_FRAMES) -> np.ndarray:
    """Rolling median, so one noisy frame pair neither breaks nor fakes a still stretch."""
    if not len(speed):
        return speed
    half = window // 2
    padded = np.pad(speed, half, mode="edge")
    return np.median(np.lib.stride_tricks.sliding_window_view(padded, window), axis=1)


def still_stretches(speed: np.ndarray, fps: float, min_speed: float, max_still: float) -> list:
    """(first_pair, last_pair_exclusive) of every run below min_speed longer than max_still."""
    low = smoothed(speed) < min_speed
    runs, start = [], None
    for i, value in enumerate([*low, False]):
        if value and start is None:
            start = i
        elif not value and start is not None:
            if (i - start) / fps > max_still:
                runs.append((start, i))
            start = None
    return runs


def gate(
    speed: np.ndarray,
    plan: dict | None,
    fps: float,
    min_speed: float = MIN_SPEED_PX,
    max_still: float = MAX_STILL_S,
    zoom: np.ndarray | None = None,
) -> dict:
    """Apply the rule. A stretch is allowed only inside hold shots that give a reason."""
    shots = plan["shots"] if plan else []
    stills = []
    for start, end in still_stretches(speed, fps, min_speed, max_still):
        touching = [s for s in shots if s["from"] < end and start < s["from"] + s["frames"]]
        explained_by_zoom = zoom is not None and float(np.median(zoom[start:end])) >= min_speed
        held = bool(touching) and all(
            s["preset"] == "hold" and s.get("reason") for s in touching
        )  # fmt: skip
        stills.append(
            {
                "from_s": round(start / fps, 2),
                "to_s": round(end / fps, 2),
                "seconds": round((end - start) / fps, 2),
                "shots": [s["id"] for s in touching],
                "allowed": held or explained_by_zoom,
                "why": (
                    "explicit hold: " + "; ".join(s["reason"] for s in touching)
                    if held
                    else "zoom, which phase correlation cannot see"
                    if explained_by_zoom
                    else None
                ),
            }
        )
    failures = [s for s in stills if not s["allowed"]]
    return {
        "passed": not failures,
        "min_speed_px": min_speed,
        "max_still_s": max_still,
        "stills": stills,
        "failures": failures,
    }


def failure_message(report: dict) -> str:
    messages = []
    if report["failures"]:
        parts = [
            f"{f['from_s']:.1f}-{f['to_s']:.1f} s in {'/'.join(f['shots']) or 'the video'}"
            for f in report["failures"]
        ]
        messages.append(
            f"Motion QA: camera below {report['min_speed_px']} px/frame for over "
            f"{report['max_still_s']:.0f} s at {', '.join(parts)}. Move the camera, use drift, or "
            "give the shot a hold with a reason (docs/visual-grammar.md)."
        )
    if report.get("too_fast"):
        parts = [f"{f['shot']} ({f['peak_px']} px/frame)" for f in report["too_fast"]]
        messages.append(
            f"Motion QA: picture moves too fast in {', '.join(parts)}. Bring the framings or zooms "
            "closer or lengthen the shot (docs/visual-grammar.md)."
        )
    return " ".join(messages)


def windows(speed: np.ndarray, fps: float, seconds: float = 5.0) -> list:
    """Median speed per window, for comparing cuts of an episode."""
    size = max(1, int(seconds * fps))
    return [
        {
            "from_s": round(i / fps, 1),
            "median_px": round(float(np.median(speed[i : i + size])), 3),
        }
        for i in range(0, len(speed), size)
    ]


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
    ap.add_argument("video", type=Path, nargs="?")
    ap.add_argument(
        "--out", type=Path, default=None, help="chart PNG (default: <video>-motion.png)"
    )
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--marks", default="", help="seconds to mark on the chart (e.g. joints)")
    ap.add_argument("--plan", type=Path, default=None, help="camera plan from render:episode")
    ap.add_argument("--check", action="store_true", help="exit 1 on a still stretch")
    ap.add_argument("--report", type=Path, default=None, help="write the result as JSON here")
    args = ap.parse_args(argv)
    if not args.video and not args.plan:
        ap.error("give a video, a --plan, or both")
    plan = json.loads(args.plan.read_text(encoding="utf-8")) if args.plan else None
    summary: dict = {}
    fps = plan["fps"] if plan else args.fps
    if plan:
        pan, zoom = plan_speeds(plan)
        plan_speed = np.hypot(pan, zoom)
    if args.video:
        r = measure(args.video)
        out = args.out or args.video.with_name(args.video.stem + "-motion.png")
        marks = [float(m) for m in args.marks.split(",") if m.strip()]
        plot(r["speed"], r["jump"], fps, out, marks)
        j = int(np.argmax(r["jump"]))
        summary = {
            "pairs": len(r["speed"]),
            "max_speed_px": round(float(r["speed"].max()), 2),
            "mean_speed_px": round(float(r["speed"].mean()), 2),
            "max_jump_px": round(float(r["jump"][j]), 2),
            "max_jump_at_s": round((j + 1) / fps, 2),
            "p99_jump_px": round(float(np.percentile(r["jump"], 99)), 2),
            "chart": str(out),
            "windows": windows(r["speed"], fps),
        }
        if marks:
            near = {}
            for m in marks:
                f = int(m * fps)
                near[m] = round(float(r["jump"][max(0, f - 3) : f + 3].max()), 2)
            summary["max_jump_near_marks"] = near
        result = gate(r["speed"], plan, fps, zoom=zoom if plan else None)
        if plan:
            result["too_fast"] = too_fast(plan, fps)
    else:
        summary = {
            "pairs": len(plan_speed),
            "max_speed_px": round(float(plan_speed.max()), 2) if len(plan_speed) else 0.0,
            "mean_speed_px": round(float(plan_speed.mean()), 2) if len(plan_speed) else 0.0,
            "windows": windows(plan_speed, fps),
        }
        result = gate(plan_speed, plan, fps)
        result["too_fast"] = too_fast(plan, fps)
        motion = screen_motion(plan)
        summary["max_screen_motion_px"] = round(float(motion.max()), 2) if len(motion) else 0.0
    summary["gate"] = result
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    result["passed"] = result["passed"] and not result.get("too_fast")
    if args.report:
        args.report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if args.check and not result["passed"]:
        print(failure_message(result), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
