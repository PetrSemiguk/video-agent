"""Conservative edge trimming, verified two-pass loudnorm and join checks."""

import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

TRIM_DB = -50.0
TRIM_FRAME_SECONDS = 0.01
TRIM_PAD_SECONDS = 0.02
TARGET_I = -16.0
TARGET_TP = -1.5
# Leave resampling/PCM rounding margin below the delivery true-peak ceiling.
FILTER_TP = -1.6
TARGET_LRA = 11
JOIN_LIMIT = 0.001  # -60 dBFS maximum sample step at a splice.


def trim_edges(audio: np.ndarray, sr: int) -> tuple[np.ndarray, dict]:
    """Trim only edge frames below -50 dBFS RMS, retaining 20 ms safety handles."""
    frame = max(1, round(TRIM_FRAME_SECONDS * sr))
    rms = np.array(
        [
            np.sqrt(np.mean(audio[i : i + frame].astype(np.float64) ** 2))
            for i in range(0, len(audio), frame)
        ]
    )
    active = np.flatnonzero(rms > 10 ** (TRIM_DB / 20))
    if not len(active):
        raise ValueError("Chunk contains no signal above the edge-trim threshold")
    pad = round(TRIM_PAD_SECONDS * sr)
    start = max(0, int(active[0]) * frame - pad)
    end = min(len(audio), (int(active[-1]) + 1) * frame + pad)
    return audio[start:end], {
        "source_samples": len(audio),
        "trim_start_samples": start,
        "trim_end_samples": len(audio) - end,
        "retained_samples": end - start,
    }


def join_check(audio: np.ndarray, spans: list[dict], limit: float = JOIN_LIMIT) -> dict:
    boundaries = {0, len(audio)}
    for span in spans:
        boundaries.update((span["start_sample"], span["end_sample"]))
    steps = []
    for boundary in sorted(boundaries):
        left = float(audio[boundary - 1]) if boundary else 0.0
        right = float(audio[boundary]) if boundary < len(audio) else 0.0
        steps.append({"sample": boundary, "step": abs(right - left)})
    maximum = max(row["step"] for row in steps)
    if maximum > limit:
        raise ValueError(f"Join discontinuity {maximum:.6f} exceeds {limit}")
    return {"maximum_step": maximum, "limit": limit, "boundaries": steps, "passed": True}


def stretch(audio: np.ndarray, sr: int, tempo: float) -> np.ndarray:
    """Change speed without changing pitch. Tempo below 1 is slower."""
    if not 0.5 <= tempo <= 2:
        raise ValueError("Tempo must be in 0.5..2")
    if tempo == 1:
        return audio
    done = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-f",
            "f32le",
            "-ar",
            str(sr),
            "-ac",
            "1",
            "-i",
            "pipe:0",
            "-af",
            f"atempo={tempo}",
            "-f",
            "f32le",
            "pipe:1",
        ],
        input=audio.astype(np.float32).tobytes(),
        capture_output=True,
        check=True,
    )
    return np.frombuffer(done.stdout, dtype=np.float32).copy()


def _ffmpeg(args: list[str]) -> str:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-nostats", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"ffmpeg failed ({result.returncode}): {result.stderr[-4000:]}")
    return result.stderr


def _stats(stderr: str) -> dict:
    matches = re.findall(r'\{\s*"input_i".*?\}', stderr, flags=re.DOTALL)
    if not matches:
        raise RuntimeError("ffmpeg did not return loudnorm measurements")
    result = json.loads(matches[-1])
    for key in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset"):
        if not math.isfinite(float(result[key])):
            raise ValueError(f"Non-finite loudness measurement: {key}")
    return result


def measure(path: Path) -> dict:
    return _stats(
        _ffmpeg(
            [
                "-i",
                str(path),
                "-map",
                "0:a:0",
                "-af",
                f"loudnorm=I={TARGET_I}:TP={FILTER_TP}:LRA={TARGET_LRA}:print_format=json",
                "-f",
                "null",
                "-",
            ]
        )
    )


def normalize_loudness(source: Path, destination: Path, sr: int, spans: list[dict]) -> dict:
    """Pass 1 measures; pass 2 applies measurements; independently measure delivery."""
    before = measure(source)
    options = (
        f"loudnorm=I={TARGET_I}:TP={FILTER_TP}:LRA={TARGET_LRA}"
        f":measured_I={before['input_i']}:measured_TP={before['input_tp']}"
        f":measured_LRA={before['input_lra']}:measured_thresh={before['input_thresh']}"
        f":offset={before['target_offset']}:linear=true:print_format=json"
    )
    temporary = destination.with_name(destination.stem + ".normalizing.wav")
    try:
        applied = _stats(
            _ffmpeg(
                [
                    "-y",
                    "-i",
                    str(source),
                    "-map",
                    "0:a:0",
                    "-af",
                    options,
                    "-ar",
                    str(sr),
                    "-ac",
                    "1",
                    "-c:a",
                    "pcm_s16le",
                    str(temporary),
                ]
            )
        )
        after = measure(temporary)
        if abs(float(after["input_i"]) - TARGET_I) > 0.2:
            raise ValueError(f"Integrated loudness outside -16 +/-0.2 LUFS: {after['input_i']}")
        if float(after["input_tp"]) > TARGET_TP:
            raise ValueError(f"True peak exceeds {TARGET_TP} dBTP: {after['input_tp']}")
        audio, actual_sr = sf.read(temporary, dtype="float32")
        if actual_sr != sr or audio.ndim != 1 or not np.isfinite(audio).all():
            raise ValueError("Invalid normalized audio format")
        if len(audio) != sf.info(source).frames:
            raise ValueError("Normalization changed sample count; manifest would be invalid")
        check = join_check(audio, spans)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    version = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=True)
    return {
        "ffmpeg": version.stdout.splitlines()[0],
        "target_i": TARGET_I,
        "target_tp": TARGET_TP,
        "filter_tp": FILTER_TP,
        "before": before,
        "applied": applied,
        "after": after,
        "join_check": check,
    }
