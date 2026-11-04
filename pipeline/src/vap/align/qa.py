"""Reproducible waveform-onset audit; acoustic landmarks are not word ground truth."""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import soundfile as sf

from vap.voice.tts import sha256_file


def onsets(audio: np.ndarray, sr: int) -> np.ndarray:
    """Detect positive RMS rises over the entire waveform, independent of ASR."""
    hop, frame = max(1, round(sr * 0.002)), max(1, round(sr * 0.005))
    energy = np.array(
        [
            np.sqrt(np.mean(audio[i : i + frame].astype(np.float64) ** 2))
            for i in range(0, len(audio), hop)
        ]
    )
    if len(energy) < 5:
        return np.array([])
    rise = energy - np.concatenate([np.zeros(4), energy[:-4]])
    positive = rise[rise > 0]
    if not len(positive):
        return np.array([])
    threshold = max(0.003, float(np.percentile(positive, 75)))
    candidates = []
    for i in range(1, len(rise) - 1):
        if rise[i] >= threshold and rise[i] >= rise[max(0, i - 5) : i + 6].max():
            candidates.append(i)
    selected = []
    blocked = np.zeros(len(rise), dtype=bool)
    for i in sorted(candidates, key=lambda index: rise[index], reverse=True):
        if not blocked[i]:
            selected.append(i)
            blocked[max(0, i - 14) : i + 15] = True
    return np.array(sorted((i * hop + frame // 2) / sr for i in selected))


def audit(alignment: dict, audio: np.ndarray, sr: int, count: int = 10, seed: int = 33) -> dict:
    eligible = [w for w in alignment["words"] if w["status"] == "matched"]
    if len(eligible) < count:
        raise ValueError(f"Need {count} matched words for the requested random audit")
    landmarks = onsets(audio, sr)
    if not len(landmarks):
        raise ValueError("Waveform contains no detectable energy-rise landmarks")
    rows = []
    for word in random.Random(seed).sample(eligible, count):
        reference = float(landmarks[np.argmin(np.abs(landmarks - word["start"]))])
        rows.append(
            {
                "word_index": word["index"],
                "text": word["text"],
                "whisper_start": word["start"],
                "waveform_onset": reference,
                "absolute_error_ms": abs(reference - word["start"]) * 1000,
            }
        )
    errors = [r["absolute_error_ms"] for r in rows]
    return {
        "seed": seed,
        "count": count,
        "method": (
            "5 ms RMS / 2 ms hop; positive 8 ms rise; independent global peaks; "
            "nearest acoustic landmark"
        ),
        "limitation": (
            "Energy rises can be syllables within connected speech. These distances are "
            "an onset proxy, not independently labelled word-boundary accuracy."
        ),
        "median_error_ms": float(np.median(errors)),
        "max_error_ms": max(errors),
        "landmark_count": len(landmarks),
        "words": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--words", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    alignment = json.loads(args.words.read_text(encoding="utf-8"))
    path = Path(alignment["audio"])
    if sha256_file(path) != alignment["audio_sha256"]:
        raise ValueError("Aligned audio has changed")
    audio, sr = sf.read(path, dtype="float32")
    evidence = audit(alignment, audio, sr)
    evidence["audio_sha256"] = alignment["audio_sha256"]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
