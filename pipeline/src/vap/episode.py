"""Sequential, content-cached episode builds. Run from pipeline/ through uv."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import wave
from contextlib import contextmanager
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

from vap import system
from vap.geo import errata, hist_attribution
from vap.qa import motion
from vap.voice import pace

ROOT = Path(__file__).resolve().parents[3]
STAGES = ("voice", "align", "preview", "render")


class StageError(RuntimeError):
    pass


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path: Path, value) -> None:
    data = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(data, encoding="utf-8")
    temporary.replace(path)


@contextmanager
def build_lock(root: Path):
    """One CLI build at a time, including across different episode slugs."""
    path = root / "studio/out/.episode-build.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise StageError(
            f"[setup] Build lock exists: {path}; check its owner before retrying"
        ) from error
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump({"pid": os.getpid(), "started": datetime.now(UTC).isoformat()}, stream)
        yield
    finally:
        path.unlink(missing_ok=True)


class Builder:
    def __init__(self, root: Path, slug: str):
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,79}", slug):
            raise StageError(
                "[setup] Slug must be 1–80 lowercase letters/digits/hyphens, starting with a letter"
            )
        self.root = root.resolve()
        self.slug = slug
        self.episode = (self.root / "episodes" / slug).resolve()
        if not self.episode.is_relative_to(self.root / "episodes") or not self.episode.is_dir():
            raise StageError(f"[setup] Missing local episode directory: {slug}")
        self.audio = self.episode / "audio"
        self.out = self.root / "studio/out"
        self.work = self.out / "episodes" / slug
        self.work.mkdir(parents=True, exist_ok=True)
        self.state_path = self.work / "build-state.json"
        try:
            self.state = read_json(self.state_path)
            if (
                not isinstance(self.state, dict)
                or self.state.get("version") != 1
                or not isinstance(self.state.get("stages"), dict)
            ):
                self.state = {"version": 1, "stages": {}}
        except (OSError, ValueError):
            self.state = {"version": 1, "stages": {}}
        self.results = []
        self.current = "setup"
        self.log = self.work / "setup.log"
        self.environment = dict(os.environ)
        self.environment["PYTHONIOENCODING"] = "utf-8"
        self.environment["PYTHONUNBUFFERED"] = "1"

    def note(self, message: str) -> None:
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(message + "\n")

    def command(self, arguments: list[str], cwd: Path, *, capture=False) -> bytes:
        self.note("command: " + json.dumps(arguments))
        with self.log.open("ab") as stream:
            result = subprocess.run(
                arguments,
                cwd=cwd,
                env=self.environment,
                shell=False,
                stdout=subprocess.PIPE if capture else stream,
                stderr=stream,
            )
            if capture:
                stream.write(result.stdout)
        if result.returncode:
            raise RuntimeError(f"Command exited {result.returncode}")
        return result.stdout if capture else b""

    def hashes(self, files) -> dict[str, str]:
        return {
            os.path.relpath(p, self.root).replace("\\", "/"): digest(p) for p in sorted(set(files))
        }

    def code(self, *directories: str) -> list[Path]:
        files = [
            Path(__file__),
            self.root / "pipeline/uv.lock",
            self.root / "pipeline/pyproject.toml",
        ]
        for name in directories:
            files.extend(
                p
                for p in (self.root / name).rglob("*")
                if p.is_file() and p.suffix in {".py", ".yaml", ".ts", ".tsx", ".cjs", ".mjs"}
            )
        return files

    def runtime(self, visual=False) -> dict:
        packages = [
            "torch",
            "torchaudio",
            "numpy",
            "chatterbox-tts",
            "faster-whisper",
            "ctranslate2",
            "Pillow",
        ]
        result = {"python": sys.version, "packages": {p: version(p) for p in packages}}
        result["ffmpeg"] = (
            self.command(["ffmpeg", "-version"], self.root, capture=True).decode().splitlines()[0]
        )
        if visual:
            result["node"] = (
                self.command(["node", "--version"], self.root, capture=True).decode().strip()
            )
        return result

    def voice_job(self) -> dict:
        source = self.episode / "voice.job.json"
        settings = read_json(source) if source.exists() else {}
        allowed = {
            "script",
            "out",
            "voice",
            "exaggeration",
            "cfg",
            "seed",
            "max_chars",
            "seed_overrides",
            "tempo",
        }
        if not isinstance(settings, dict) or settings.keys() - allowed:
            raise ValueError("voice.job.json must be an object with supported voice settings")
        job = {
            "exaggeration": 0.3,
            "cfg": 0.5,
            "seed": 42,
            "max_chars": 240,
            "seed_overrides": {},
            "tempo": 1.0,
            **settings,
        }
        for name in ("exaggeration", "cfg"):
            if type(job[name]) not in (int, float) or not 0 <= job[name] <= 1:
                raise ValueError(f"Invalid {name}: expected a number in 0..1")
        if type(job["tempo"]) not in (int, float) or not 0.5 <= job["tempo"] <= 2:
            raise ValueError("Invalid tempo: expected a number in 0.5..2")
        for name, low, high in (("seed", 0, 2**32 - 100000), ("max_chars", 40, 10000)):
            if type(job[name]) is not int or not low <= job[name] <= high:
                raise ValueError(f"Invalid {name}")
        seeds = job["seed_overrides"]
        if not isinstance(seeds, dict) or any(
            not re.fullmatch(r"0|[1-9]\d*", key) or type(seed) is not int or not 0 <= seed < 2**32
            for key, seed in seeds.items()
        ):
            raise ValueError("Invalid per-chunk seed_overrides")
        reference = job.get("voice")
        if reference is not None:
            reference = (self.root / "pipeline" / reference).resolve()
            if not reference.is_file():
                raise ValueError(f"Missing voice reference: {reference}")
        return {
            **job,
            "script": str(self.episode / "script.md"),
            "out": str(self.audio),
            "voice": str(reference) if reference else None,
        }

    def voice_inputs(self):
        job = self.voice_job()
        files = self.code("pipeline/src/vap/voice") + [
            self.episode / "script.md",
            self.root / "pipeline/src/vap/align/repair.py",
        ]
        if job["voice"]:
            files.append(Path(job["voice"]))
        return {"job": job, "files": self.hashes(files), "runtime": self.runtime()}

    def voice(self):
        job = self.work / "voice-job.json"
        write_json(job, self.voice_job())
        self.command(
            [sys.executable, "-m", "vap.align.repair", "--job", str(job)], self.root / "pipeline"
        )
        manifest = read_json(self.audio / "voice.manifest.json")
        if manifest["script_sha256"] != digest(self.episode / "script.md") or manifest[
            "audio_sha256"
        ] != digest(self.audio / "voice.wav"):
            raise ValueError("Voice manifest does not match script/WAV")
        with wave.open(str(self.audio / "voice.wav")) as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (
                1,
                2,
                24000,
            ) or audio.getnframes() != manifest["samples"]:
                raise ValueError("Invalid mastered WAV sample contract")
        report = pace.pace(manifest)
        write_json(self.work / "pace.json", report)
        print(pace.summary(report), flush=True)
        return [
            self.audio / name
            for name in ("voice.wav", "voice.manifest.json", "voice.pre-loudnorm.wav")
        ]

    def align_inputs(self):
        files = self.code("pipeline/src/vap/align", "pipeline/src/vap/voice")
        files += [
            self.episode / "script.md",
            self.audio / "voice.wav",
            self.audio / "voice.manifest.json",
        ]
        return {"files": self.hashes(files), "runtime": self.runtime()}

    def align(self):
        self.command(
            [
                sys.executable,
                "-m",
                "vap.align.words",
                "--script",
                str(self.episode / "script.md"),
                "--audio",
                str(self.audio / "voice.wav"),
                "--out",
                str(self.audio),
            ],
            self.root / "pipeline",
        )
        data = read_json(self.audio / "words.json")
        if (
            data.get("complete") is not True
            or data["audio_sha256"] != digest(self.audio / "voice.wav")
            or data["script_sha256"] != digest(self.episode / "script.md")
        ):
            raise ValueError("Alignment must be complete and match the current script/WAV")
        end = 0
        for index, word in enumerate(data["words"]):
            if (
                word["index"] != index
                or word["status"] != "matched"
                or not math.isfinite(word["start"])
                or not math.isfinite(word["end"])
                or not end <= word["start"] < word["end"] <= data["duration"]
            ):
                raise ValueError(f"Invalid original-word interval at index {index}")
            end = word["end"]
        if not data["words"]:
            raise ValueError("Alignment has no words")
        return [self.audio / "words.json", self.audio / "recognition-0.json"]

    def visual_inputs(self):
        story = read_json(self.episode / "storyboard.json")
        if story["episode"]["slug"] != self.slug:
            raise ValueError("Storyboard episode.slug must match its episode directory")
        problems = errata.blocking_issues(story, self.root)
        if problems:
            raise ValueError("; ".join(problems))
        hist_attribution.update_episode(self.episode / "attributions.md", self.root, story)
        # Runtime copy always binds this episode's canonical audio/words outputs,
        # without editing the authored storyboard.
        story["audio"] = {
            "src": f"episodes/{self.slug}/audio/voice.wav",
            "words": f"episodes/{self.slug}/audio/words.json",
        }
        runtime = self.work / "storyboard.json"
        write_json(runtime, story)
        raw = self.command(
            ["node", "scripts/episode-inputs.cjs", str(runtime)], self.root / "studio", capture=True
        )
        media = [self.root / p for p in json.loads(raw)]
        files = self.code("studio/src", "studio/scripts", "pipeline/src/vap/qa")
        files += [
            self.root / "studio" / name
            for name in ("package.json", "package-lock.json", "remotion.config.ts", "tsconfig.json")
        ]
        files += [runtime, self.audio / "voice.wav", self.audio / "words.json", *media]
        return {"files": self.hashes(files), "runtime": self.runtime(visual=True)}

    def motion_gate(self, stage: str) -> Path:
        """Fail the stage on a still camera. Preview checks the plan, render the actual video."""
        report = self.work / f"{stage}-motion.json"
        args = [
            sys.executable,
            "-m",
            "vap.qa.motion",
            "--plan",
            str(self.out / f"{self.slug}-camera-plan.json"),
            "--check",
            f"--report={report}",
        ]
        if stage == "render":
            args += [str(self.out / f"episode-{self.slug}-synced.mp4")]
        try:
            self.command(args, self.root / "pipeline")
        except RuntimeError as error:
            if report.is_file():
                raise ValueError(motion.failure_message(read_json(report)["gate"])) from error
            raise
        return report

    def visual(self, stage: str):
        metadata = self.work / f"{stage}-metadata.json"
        args = [
            "node",
            "scripts/render-episode.mjs",
            f"--storyboard={self.work / 'storyboard.json'}",
            f"--metadata={metadata}",
            "--stills-only" if stage == "preview" else "--video-only",
        ]
        if stage == "render":
            # Ask the machine before starting: out of memory the render is killed, not slowed.
            workers, note = system.check_render_memory()
            self.note(f"[{stage}] {note}")
            args.append(f"--concurrency={workers}")
        self.command(args, self.root / "studio")
        if stage == "render":
            report = self.motion_gate(stage)
            return [self.out / f"episode-{self.slug}-synced.mp4", metadata, report]
        report = self.motion_gate(stage)
        print(
            self.command(
                [sys.executable, "-m", "vap.qa.rhythm", self.slug],
                self.root / "pipeline",
                capture=True,
            ).decode("utf-8", "replace"),
            end="",
            flush=True,
        )
        payload = read_json(self.out / f"{self.slug}-preview-input.json")
        frames = [Path(s["image"]).resolve() for s in payload["shots"]]
        if not frames or any(not p.is_relative_to(self.out) for p in frames):
            raise ValueError("Preview must contain local rendered first frames")
        return (
            [
                self.out / f"{self.slug}-{suffix}"
                for suffix in (
                    "preview.png",
                    "preview-input.json",
                    "assembly.json",
                    "sync.json",
                    "camera-plan.json",
                )
            ]
            + frames
            + [metadata, report]
        )

    def run_stage(self, stage: str):
        self.current, self.log = stage, self.work / f"{stage}.log"
        started = time.perf_counter()
        self.note(f"\n[{stage}] {datetime.now(UTC).isoformat()}")
        try:
            inputs = getattr(self, f"{stage}_inputs", self.visual_inputs)()
            key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
            cached = self.state["stages"].get(stage, {})
            if not isinstance(cached, dict):
                cached = {}
            valid = (
                cached.get("fingerprint") == key
                and bool(cached.get("outputs"))
                and all(
                    (self.root / p).is_file() and digest(self.root / p) == checksum
                    for p, checksum in cached.get("outputs", {}).items()
                )
            )
            if valid:
                status = "cached"
                self.note(f"[{stage}] cache hit {key}")
            else:
                print(f"[{stage}] running; log: {self.log}", flush=True)
                self.state["stages"].pop(stage, None)
                write_json(self.state_path, self.state)
                outputs = (
                    self.visual(stage) if stage in ("preview", "render") else getattr(self, stage)()
                )
                self.state["stages"][stage] = {"fingerprint": key, "outputs": self.hashes(outputs)}
                write_json(self.state_path, self.state)
                status = "built"
            elapsed = round(time.perf_counter() - started, 3)
            self.results.append({"stage": stage, "status": status, "seconds": elapsed})
            print(f"[{stage}] {status} ({elapsed}s)", flush=True)
        except Exception as error:
            self.note(f"[{stage}] FAILED: {error}")
            self.results.append({"stage": stage, "status": "failed", "error": str(error)})
            raise StageError(f"[{stage}] FAILED: {error}; log: {self.log}") from error

    def build(self, target: str):
        try:
            with build_lock(self.root):
                for stage in STAGES[: STAGES.index(target) + 1] if target != "all" else STAGES:
                    self.run_stage(stage)
        finally:
            write_json(
                self.work / "build-summary.json",
                {
                    "slug": self.slug,
                    "target": target,
                    "stages": self.results,
                    "completed": bool(self.results)
                    and all(s["status"] != "failed" for s in self.results),
                },
            )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser(
        "build", help="Build through the selected stage, reusing valid outputs"
    )
    build.add_argument("slug")
    build.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    args = parser.parse_args(argv)
    try:
        Builder(ROOT, args.slug).build(args.stage)
    except (StageError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
