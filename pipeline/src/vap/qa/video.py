"""Read video frames through the system ffmpeg (no extra Python dependencies)."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Iterator
from pathlib import Path

import numpy as np


def probe_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout  # fmt: skip
    stream = json.loads(out)["streams"][0]
    return int(stream["width"]), int(stream["height"])


def frames(
    path: Path,
    start: float | None = None,
    end: float | None = None,
    pix_fmt: str = "gray",
    max_frames: int | None = None,
    size: tuple[int, int] | None = None,
) -> Iterator[np.ndarray]:
    """Yield decoded frames (uint8; HxW for gray, HxWx3 for rgb24) between start and end.

    Pass max_frames when the caller stops early, so ffmpeg is not cut off mid-stream.
    """
    width, height = size or probe_size(path)
    channels = {"gray": 1, "rgb24": 3}[pix_fmt]
    cmd = ["ffmpeg", "-v", "error"]
    # -ss/-to after -i: frame-accurate decoding (input seeking may land on a keyframe).
    cmd += ["-i", str(path)]
    if start is not None:
        cmd += ["-ss", f"{start}"]
    if end is not None:
        cmd += ["-to", f"{end}"]
    if max_frames is not None:
        cmd += ["-frames:v", str(max_frames)]
    if size is not None:
        cmd += ["-vf", f"scale={size[0]}:{size[1]}:flags=area"]
    cmd += ["-f", "rawvideo", "-pix_fmt", pix_fmt, "-"]
    frame_bytes = width * height * channels
    shape = (height, width) if channels == 1 else (height, width, channels)
    with subprocess.Popen(cmd, stdout=subprocess.PIPE) as proc:
        assert proc.stdout is not None
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(shape)
        if proc.wait() != 0:
            raise RuntimeError(f"ffmpeg failed on {path}")
