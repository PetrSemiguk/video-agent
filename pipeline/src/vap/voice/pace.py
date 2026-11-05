"""Speaking pace of a mastered voice, for the whole file and per chunk.

uv run python -m vap.voice.pace <voice.manifest.json>

Target 155-165 words per minute over the whole file, pauses included. It warns outside 145-175, and
never fails a build: a short chunk can run fast and still sound right. Words are those read aloud.
Syllables per second are reported too, as an estimate: the voice keeps a steady syllable rate, so a
script of short words runs at more words per minute with no change of voice.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

WARN_WPM = (145.0, 175.0)
TARGET_WPM = (155.0, 165.0)


def syllables(text: str) -> int:
    """Vowel groups, a silent final e aside. An estimate for comparing scripts, not phonetics."""
    total = 0
    for word in re.findall(r"[a-z]+", text.lower()):
        count = len(re.findall(r"[aeiouy]+", word))
        if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
            count -= 1
        total += max(count, 1)
    return total


def pace(manifest: dict) -> dict:
    chunks = []
    for chunk in manifest.get("chunks", []):
        words = len(chunk["normalized"].split())
        seconds = chunk["end"] - chunk["start"]
        chunks.append(
            {
                "id": chunk["id"],
                "words": words,
                "seconds": round(seconds, 2),
                "wpm": round(words / seconds * 60, 1) if seconds > 0 else None,
                "text": chunk["original"],
            }
        )
    total = sum(c["words"] for c in chunks)
    duration = manifest.get("duration") or 0.0
    speech = sum(c["seconds"] for c in chunks)
    normalized = sum(syllables(c["normalized"]) for c in manifest.get("chunks", []))
    wpm = round(total / duration * 60, 1) if duration else None
    outside = [
        c for c in chunks if c["wpm"] is not None and not WARN_WPM[0] <= c["wpm"] <= WARN_WPM[1]
    ]
    warnings = []
    if wpm is not None and not WARN_WPM[0] <= wpm <= WARN_WPM[1]:
        warnings.append(
            f"{wpm:.0f} words per minute over the file, outside {WARN_WPM[0]:.0f}-{WARN_WPM[1]:.0f}"
        )
    if outside:
        warnings.append(
            f"{len(outside)} of {len(chunks)} chunks outside "
            f"{WARN_WPM[0]:.0f}-{WARN_WPM[1]:.0f} wpm: "
            + ", ".join(f"{c['id']} ({c['wpm']:.0f})" for c in outside)
        )
    return {
        "words": total,
        "seconds": duration,
        "wpm": wpm,
        "speech_wpm": round(total / speech * 60, 1) if speech else None,
        "syllables_per_word": round(normalized / total, 2) if total else None,
        "speech_syllables_per_second": round(normalized / speech, 2) if speech else None,
        "target_wpm": list(TARGET_WPM),
        "chunks": chunks,
        "warnings": warnings,
    }


def summary(report: dict) -> str:
    lines = [
        f"Pace: {report['wpm']} words per minute over the file, "
        f"{report['speech_wpm']} in speech, target "
        f"{report['target_wpm'][0]:.0f}-{report['target_wpm'][1]:.0f}; "
        f"{report['speech_syllables_per_second']} syllables/s, "
        f"{report['syllables_per_word']} per word"
    ]
    lines += [f"Pace warning: {warning}" for warning in report["warnings"]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m vap.voice.pace", description=__doc__)
    ap.add_argument("manifest", type=Path)
    ap.add_argument("--report", type=Path, default=None, help="write the result as JSON here")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    report = pace(json.loads(args.manifest.read_text(encoding="utf-8")))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(summary(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
