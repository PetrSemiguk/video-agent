"""Independent audit of a built episode: words, cuts, leads, MP4 and decoded audio.

Run `vap.episode build <slug>` first. Writes studio/out/episodes/<slug>/audit.json.
`--check-cache` also rebuilds every stage target and requires all of them to stay
cached, with output hashes and modification times unchanged.
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from vap.episode import ROOT, STAGES, digest, read_json, write_json

LAG_LIMIT_SECONDS = 0.1
MIN_CORRELATION = 0.98


class AuditError(RuntimeError):
    pass


def check(condition, message: str) -> None:
    if not condition:
        raise AuditError(message)


def lead_is_valid(lead: dict, starts: dict, config: dict) -> bool:
    """The full lead, or less when the shot's first frame leaves no room for it."""
    if lead["leadFrames"] == config["labelLeadFrames"]:
        return True
    return (
        0 <= lead["leadFrames"] < config["labelLeadFrames"] and lead["from"] == starts[lead["shot"]]
    )


def audit_words(episode: Path) -> dict:
    words = read_json(episode / "audio/words.json")
    manifest = read_json(episode / "audio/voice.manifest.json")
    check(words["complete"] and not words["issues"], "Alignment is unresolved")
    end = 0
    for word in words["words"]:
        check(end <= word["start"] < word["end"] <= words["duration"], f"Bad word: {word}")
        end = word["end"]
    audio = digest(episode / "audio/voice.wav")
    check(audio == words["audio_sha256"] == manifest["audio_sha256"], "WAV hash mismatch")
    spoken = " ".join(w["text"] for w in words["words"])
    check(
        " ".join(c["original"] for c in manifest["chunks"]) == spoken,
        "Aligned words differ from the script chunks",
    )
    return {"words": words, "spoken": spoken, "audio_sha256": audio}


def audit_plan(slug: str, out: Path, samples, rate: int, fps: int, spoken: str) -> dict:
    sync = read_json(out / f"{slug}-sync.json")
    assembly = read_json(out / f"{slug}-assembly.json")
    preview = read_json(out / f"{slug}-preview-input.json")
    config = sync["config"]
    threshold = 10 ** (config["silenceThresholdDbfs"] / 20)
    window = round(rate * config["silenceWindowMs"] / 1000)
    cursor, cuts = 0, []
    for shot in assembly["shots"]:
        check(shot["from"] == cursor, f"Gap or overlap at {shot['id']}")
        check(shot["durationInFrames"] >= config["minShotFrames"], f"Short shot: {shot['id']}")
        if cursor:
            check(
                any(p["from"] <= cursor < p["to"] for p in sync["pauses"]),
                f"Cut outside a pause: {cursor}",
            )
            start = round(cursor * rate / fps)
            chunk = samples[start : start + window].astype(np.float64)
            rms = float(np.sqrt(np.mean(chunk**2)))
            check(rms <= threshold, f"Cut over audible narration: {cursor}")
            cuts.append({"frame": cursor, "rms": rms})
        cursor += shot["durationInFrames"]
    check(cursor == math.ceil(len(samples) * fps / rate), "Plan does not cover the audio")
    starts = {shot["id"]: shot["from"] for shot in assembly["shots"]}
    check(all(lead_is_valid(lead, starts, config) for lead in sync["leads"]), "Label lead mismatch")
    for name, shots in (("sync", sync["shots"]), ("preview", preview["shots"])):
        check(" ".join(s["text"] for s in shots) == spoken, f"{name} captions lose words")
    check(len(preview["shots"]) == len(assembly["shots"]), "Preview shot count mismatch")
    return {
        "total_frames": cursor,
        "shots": len(assembly["shots"]),
        "minimum_shot_frames": min(s["durationInFrames"] for s in assembly["shots"]),
        "label_leads": len(sync["leads"]),
        "quiet_cut_checks": cuts,
    }


def probe_video(video: Path, frames: int, fps: int) -> dict:
    probe = json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
            encoding="utf-8",
        )
    )
    streams = probe["streams"]
    pictures = [s for s in streams if s["codec_type"] == "video"]
    sounds = [s for s in streams if s["codec_type"] == "audio"]
    check(len(pictures) == len(sounds) == 1, "Expected one video and one audio stream")
    check(int(pictures[0]["nb_frames"]) == frames, "Encoded frame count mismatch")
    check(pictures[0]["r_frame_rate"] == f"{fps}/1", "Encoded frame rate mismatch")
    return probe


def compare_audio(video: Path, decoded: Path, samples, rate: int) -> dict:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", str(video)]
        + ["-map", "0:a:0", "-ar", str(rate), "-ac", "1", "-c:a", "pcm_s16le", str(decoded)],
        check=True,
    )
    rendered, _ = sf.read(decoded, dtype="float32")
    size = len(rendered) + len(samples)
    spectrum = np.fft.rfft(rendered, size) * np.conj(np.fft.rfft(samples, size))
    correlation = np.fft.irfft(spectrum, size)
    limit = int(rate * LAG_LIMIT_SECONDS)
    lags = np.arange(-limit, limit + 1)
    lag = int(lags[np.argmax(correlation[lags])])
    head = rendered[: len(samples)]
    similarity = float(np.dot(head, samples) / (np.linalg.norm(head) * np.linalg.norm(samples)))
    check(lag == 0, f"Rendered audio is offset by {lag} samples")
    check(similarity > MIN_CORRELATION, f"Rendered audio differs: {similarity}")
    return {"lag_samples": lag, "correlation": similarity}


def check_cache(slug: str, work: Path) -> list[dict]:
    state = read_json(work / "build-state.json")
    outputs = sorted({ROOT / p for stage in state["stages"].values() for p in stage["outputs"]})

    def snapshot() -> dict:
        return {str(p): (digest(p), p.stat().st_mtime_ns) for p in outputs}

    before = snapshot()
    runs = []
    for target in ("all", *STAGES):
        command = [sys.executable, "-m", "vap.episode", "build", slug, "--stage", target]
        subprocess.run(command, cwd=ROOT / "pipeline", check=True)
        summary = read_json(work / "build-summary.json")
        check(
            summary["completed"] and all(s["status"] == "cached" for s in summary["stages"]),
            f"Target {target} was not fully cached",
        )
        runs.append({"target": target, "stages": len(summary["stages"])})
    check(before == snapshot(), "Cached runs changed an output")
    return runs


def audit(slug: str, cache: bool) -> dict:
    episode = ROOT / "episodes" / slug
    out = ROOT / "studio/out"
    work = out / "episodes" / slug
    video = out / f"episode-{slug}-synced.mp4"
    samples, rate = sf.read(episode / "audio/voice.wav", dtype="float32")
    fps = read_json(episode / "storyboard.json")["episode"]["fps"]
    words = audit_words(episode)
    plan = audit_plan(slug, out, samples, rate, fps, words["spoken"])
    probe = probe_video(video, plan["total_frames"], fps)
    comparison = compare_audio(video, work / "decoded-audio.wav", samples, rate)
    evidence = {
        "slug": slug,
        "words": len(words["words"]["words"]),
        "duration": len(samples) / rate,
        **plan,
        "source_audio_sha256": words["audio_sha256"],
        "mp4_sha256": digest(video),
        "container": probe,
        "audio_comparison": comparison,
    }
    if cache:
        evidence["cached_runs"] = check_cache(slug, work)
    write_json(work / "audit.json", evidence)
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug")
    parser.add_argument("--check-cache", action="store_true")
    args = parser.parse_args()
    try:
        evidence = audit(args.slug, args.check_cache)
    except AuditError as error:
        print(f"AUDIT FAILED: {error}", file=sys.stderr)
        return 1
    hidden = ("container", "quiet_cut_checks")
    print(json.dumps({k: v for k, v in evidence.items() if k not in hidden}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
