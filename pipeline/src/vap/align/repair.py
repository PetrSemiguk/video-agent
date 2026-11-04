"""Isolated TTS worker; no Whisper imports or resident Whisper allocations."""

import argparse
import json
from pathlib import Path

from vap.voice.tts import run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", type=Path, required=True)
    args = parser.parse_args()
    job = json.loads(args.job.read_text(encoding="utf-8"))
    for field in ("script", "out", "voice"):
        job[field] = Path(job[field]) if job[field] else None
    run(argparse.Namespace(**job))


if __name__ == "__main__":
    main()
