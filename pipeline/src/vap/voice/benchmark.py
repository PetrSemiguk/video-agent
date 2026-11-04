"""Build/resume sandbox comparisons, then prove lossless cache-only reruns."""

import json
import platform
import shutil
from argparse import Namespace

import numpy as np
import soundfile as sf

from .chunk import chunks
from .tts import MODEL_REVISION, ROOT, run, sha256_file


def main():
    script = ROOT / "episodes" / "_sandbox" / "tts-test" / "script.md"
    audio_dir = script.parent / "audio"
    report_dir = ROOT / "docs" / "reports" / "3.1"
    report_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    normalized = []
    for tag, exaggeration in [("03", 0.3), ("05", 0.5), ("07", 0.7)]:
        directory = audio_dir / f"ex{tag}"
        manifest_path = directory / "voice.manifest.json"
        args = Namespace(
            script=script,
            out=directory,
            voice=None,
            exaggeration=exaggeration,
            cfg=0.5,
            seed=42,
            max_chars=240,
        )
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
        valid = (
            manifest
            and "output_gain" in manifest
            and manifest["script_sha256"] == sha256_file(script)
            and manifest["model"]["revision"] == MODEL_REVISION
            and manifest["settings"]["exaggeration"] == exaggeration
            and manifest["settings"]["cfg_weight"] == 0.5
            and manifest["seed"] == 42
            and [c["normalized"] for c in manifest["chunks"]]
            == [c.normalized for c in chunks(script.read_text(encoding="utf-8"), 240)]
            and sha256_file(directory / "voice.wav") == manifest["audio_sha256"]
            and all(
                (ROOT / ".cache" / "voice" / f"{c['cache_key']}.wav").exists()
                for c in manifest["chunks"]
            )
        )
        if not valid:
            manifest = run(args)
        manifest["python"] = platform.python_version()
        for record in manifest["chunks"]:
            record["params"] = manifest["settings"]
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        shutil.copyfile(directory / "voice.wav", audio_dir / f"voice-ex{tag}.wav")
        shutil.copyfile(manifest_path, audio_dir / f"voice-ex{tag}.manifest.json")
        args.out = audio_dir / "cache-check" / f"ex{tag}"
        repeated = run(args)
        assert repeated["metrics"]["cache_hits"] == len(manifest["chunks"])
        assert repeated["audio_sha256"] == manifest["audio_sha256"]
        assert repeated["metrics"]["model_load_seconds"] == 0
        # A resumed generation may first have been measured in cache-check/.
        if "first_generation_metrics" not in manifest and "first_generation_metrics" in repeated:
            manifest["first_generation_metrics"] = repeated["first_generation_metrics"]
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
            shutil.copyfile(manifest_path, audio_dir / f"voice-ex{tag}.manifest.json")
        audio, sr = sf.read(directory / "voice.wav", dtype="float32")
        assert sr == 24000 and np.isfinite(audio).all()
        assert audio[0] == audio[-1] == 0
        normalized = [chunk["normalized"] for chunk in manifest["chunks"]]
        rows.append(
            {
                "exaggeration": exaggeration,
                "audio": f"episodes/_sandbox/tts-test/audio/voice-ex{tag}.wav",
                "duration": manifest["duration"],
                "original_metrics": manifest.get("first_generation_metrics", manifest["metrics"]),
                "rerun_metrics": repeated["metrics"],
                "bit_identical_rerun": True,
                "audio_sha256": manifest["audio_sha256"],
                "peak_amplitude": float(np.max(np.abs(audio))),
                "clipped_samples": int(np.sum(np.abs(audio) >= 1 - 1 / 32768)),
                "output_gain": manifest["output_gain"],
            }
        )
        assert rows[-1]["clipped_samples"] == 0
    # Detect the unmodified real watermark after joining; do not load whisper.
    import perth

    detector = perth.PerthImplicitWatermarker(device="cpu")
    for row in rows:
        audio, sr = sf.read(ROOT / row["audio"], dtype="float32")
        row["perth_detector_mean"] = float(
            np.asarray(detector.get_watermark(audio, sample_rate=sr, round=False)).mean()
        )
    report = {
        "model_revision": MODEL_REVISION,
        "selected_exaggeration": 0.3,
        "cfg": 0.5,
        "seed": 42,
        "normalised_sentences": normalized,
        "variants": rows,
    }
    (report_dir / "benchmark.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
