"""Align original script words; isolate GPU workers and optionally repair TTS."""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import soundfile as sf

from vap.voice.chunk import chunks
from vap.voice.tts import sha256_file

from .match import align_chunk
from .transcribe import MODEL_REVISION, RECOGNITION_POLICY, TRANSCRIBE_OPTIONS


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def worker(module: str, arguments: list[str], log: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-m", module, *arguments],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    log.write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"{module} exited {result.returncode}; see {log}")
    print(result.stdout.strip(), flush=True)


def check_inputs(script: Path, audio: Path, manifest: dict) -> None:
    if manifest["script_sha256"] != sha256_file(script):
        raise ValueError("Script hash differs from voice manifest")
    if manifest["audio_sha256"] != sha256_file(audio):
        raise ValueError("WAV hash differs from voice manifest")
    info = sf.info(audio)
    if info.frames != manifest["samples"] or info.samplerate != manifest["sample_rate"]:
        raise ValueError("WAV sample contract differs from manifest")
    prepared = chunks(script.read_text(encoding="utf-8-sig"), manifest["max_chars"])
    if [c.original for c in prepared] != [c["original"] for c in manifest["chunks"]]:
        raise ValueError("Script chunks differ from voice manifest")
    if [c.normalized for c in prepared] != [c["normalized"] for c in manifest["chunks"]]:
        raise ValueError("Current normalizer differs from voice manifest; regenerate narration")
    previous = 0
    for index, chunk in enumerate(manifest["chunks"]):
        if (
            chunk["id"] != index
            or not previous <= chunk["start_sample"] < chunk["end_sample"] <= info.frames
        ):
            raise ValueError("Invalid/non-monotone manifest chunk spans")
        previous = chunk["end_sample"]
        if (
            abs(chunk["start"] - chunk["start_sample"] / info.samplerate) > 1e-8
            or abs(chunk["end"] - chunk["end_sample"] / info.samplerate) > 1e-8
        ):
            raise ValueError("Manifest seconds differ from sample spans")


def group_spans(words: list[dict], field: str) -> list[dict]:
    result = []
    for word in words:
        if not result or result[-1]["id"] != word[field]:
            result.append(
                {
                    "id": word[field],
                    "word_start": word["index"],
                    "word_end": word["index"] + 1,
                    "start": word["start"],
                    "end": word["end"],
                    "complete": word["status"] == "matched",
                }
            )
        else:
            row = result[-1]
            row["word_end"] = word["index"] + 1
            row["end"] = word["end"]
            row["complete"] &= word["status"] == "matched"
    return result


def build_alignment(manifest: dict, recognition: dict) -> dict:
    if len(recognition["chunks"]) != len(manifest["chunks"]):
        raise ValueError("Recognition chunk count differs from voice manifest")
    words, issues, sentence = [], [], 0
    for chunk, heard in zip(manifest["chunks"], recognition["chunks"], strict=True):
        if chunk["id"] != heard["chunk_id"]:
            raise ValueError("Recognition chunk id differs from manifest")
        aligned, errors = align_chunk(chunk, heard, len(words))
        for word in aligned:
            word["sentence"] = sentence
            # Match the project's abbreviation-aware sentence splitter.
            if re.search(r"""[.!?]["”’)\]]*$""", word["text"]) and word["text"] not in {
                "U.S.",
                "U.S.A.",
                "U.K.",
                "St.",
                "Dr.",
            }:
                sentence += 1
        words.extend(aligned)
        issues.extend(errors)
    return {
        "schema_version": 1,
        "complete": not issues,
        "words": words,
        "sentences": group_spans(words, "sentence"),
        "paragraphs": group_spans(words, "paragraph"),
        "issues": issues,
        "affected_chunk_ids": sorted({i["chunk_id"] for i in issues}),
        "model": recognition["model"],
        "runtime": recognition["runtime"],
        "options": recognition.get("options", {}),
        "recognition_policy": recognition.get("recognition_policy", "legacy"),
    }


def repair_job(
    script: Path, voice: Path | None, manifest: dict, affected: list[int], out: Path
) -> dict:
    if manifest["voice"]["kind"] == "reference":
        if voice is None or sha256_file(voice) != manifest["voice"]["sha256"]:
            raise ValueError("Repair requires the original owned/licensed --voice reference")
    elif voice is not None:
        raise ValueError("Publisher-built-in narration cannot change voice during repair")
    seeds = {str(c["id"]): c["seed"] for c in manifest["chunks"]}
    for index in affected:
        seeds[str(index)] = (seeds[str(index)] + 100003) % 2**32
    return {
        "script": str(script.resolve()),
        "out": str(out.resolve()),
        "voice": str(voice.resolve()) if voice else None,
        "exaggeration": manifest["settings"]["exaggeration"],
        "cfg": manifest["settings"]["cfg_weight"],
        "seed": manifest["seed"],
        "max_chars": manifest["max_chars"],
        "seed_overrides": seeds,
    }


def run(args: argparse.Namespace) -> dict:
    args.out = args.out.resolve()
    args.script = args.script.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    audio, manifest_path = args.audio.resolve(), args.manifest.resolve()
    history = []
    for attempt in range(args.max_tries + 1 if args.fix else 1):
        manifest = read_json(manifest_path)
        check_inputs(args.script, audio, manifest)
        recognition_path = args.out / f"recognition-{attempt}.json"
        recognition = read_json(recognition_path) if recognition_path.exists() else None
        if (
            not recognition
            or recognition.get("audio_sha256") != sha256_file(audio)
            or recognition["model"]["revision"] != MODEL_REVISION
            or recognition.get("options") != TRANSCRIBE_OPTIONS
            or recognition.get("recognition_policy") != RECOGNITION_POLICY
            or recognition.get("chunk_spans")
            != [[c["id"], c["start_sample"], c["end_sample"]] for c in manifest["chunks"]]
        ):
            worker(
                "vap.align.transcribe",
                [
                    "--audio",
                    str(audio),
                    "--manifest",
                    str(manifest_path),
                    "--out",
                    str(recognition_path),
                ],
                args.out / f"whisper-{attempt}.log",
            )
            recognition = read_json(recognition_path)
        result = build_alignment(manifest, recognition)
        history.append(
            {
                "attempt": attempt,
                "audio": str(audio),
                "audio_sha256": sha256_file(audio),
                "issues": result["issues"],
                "affected_chunk_ids": result["affected_chunk_ids"],
            }
        )
        result.update(
            {
                "audio": str(audio),
                "audio_sha256": sha256_file(audio),
                "script_sha256": sha256_file(args.script),
                "voice_manifest": str(manifest_path),
                "voice_manifest_sha256": sha256_file(manifest_path),
                "duration": manifest["duration"],
                "repair_history": history,
            }
        )
        write_json(args.out / "words.json", result)
        if result["complete"] or attempt == args.max_tries or not args.fix:
            return result
        directory = args.out / f"repair-{attempt + 1}"
        job = repair_job(args.script, args.voice, manifest, result["affected_chunk_ids"], directory)
        job_path = args.out / f"repair-{attempt + 1}.job.json"
        write_json(job_path, job)
        # The Whisper child has exited before this TTS child is created.
        worker("vap.align.repair", ["--job", str(job_path)], args.out / f"tts-{attempt + 1}.log")
        audio, manifest_path = directory / "voice.wav", directory / "voice.manifest.json"
    raise AssertionError("Unreachable repair loop")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--fix", action="store_true")
    parser.add_argument("--max-tries", type=int, choices=range(1, 4), default=3)
    parser.add_argument("--voice", type=Path, help="Owned/licensed original reference for repair")
    args = parser.parse_args(argv)
    args.manifest = args.manifest or args.audio.with_name("voice.manifest.json")
    result = run(args)
    print(
        json.dumps(
            {
                "complete": result["complete"],
                "words": len(result["words"]),
                "affected_chunk_ids": result["affected_chunk_ids"],
            }
        ),
        flush=True,
    )
    return 0 if result["complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
