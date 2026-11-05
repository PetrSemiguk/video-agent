"""Orchestration contracts without running GPU models or a browser in unit tests."""

import json
import sys
import wave
from pathlib import Path

import pytest

from vap import episode
from vap.episode import Builder, StageError, build_lock, digest, read_json, write_json


@pytest.fixture
def project(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    for file in (
        "pipeline/uv.lock",
        "pipeline/pyproject.toml",
        "pipeline/src/vap/align/repair.py",
        "studio/package.json",
        "studio/package-lock.json",
        "studio/remotion.config.ts",
        "studio/tsconfig.json",
        "studio/public/plates/test.png",
        "studio/src/design/tokens.ts",
        "episodes/pilot/script.md",
    ):
        path = root / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("// fixture\n" if path.suffix == ".ts" else "fixture", encoding="utf-8")
    write_json(
        root / "episodes/pilot/storyboard.json",
        {
            "episode": {"slug": "pilot"},
            "audio": {"src": "old.wav", "words": "old-report.json"},
        },
    )
    calls = []

    def command(self, arguments, cwd, *, capture=False):
        if "scripts/episode-inputs.cjs" in arguments:
            return json.dumps(["studio/public/plates/test.png"]).encode()
        calls.append(self.current)
        self.audio.mkdir(parents=True, exist_ok=True)
        if "vap.align.repair" in arguments:
            job = read_json(Path(arguments[-1]))
            with wave.open(str(self.audio / "voice.wav"), "wb") as stream:
                stream.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                stream.writeframes(job["seed"].to_bytes(2, "little") * 24000)
            write_json(
                self.audio / "voice.manifest.json",
                {
                    "script_sha256": digest(self.episode / "script.md"),
                    "audio_sha256": digest(self.audio / "voice.wav"),
                    "samples": 24000,
                },
            )
            (self.audio / "voice.pre-loudnorm.wav").write_bytes(b"audit")
        elif "vap.align.words" in arguments:
            write_json(
                self.audio / "words.json",
                {
                    "complete": True,
                    "audio_sha256": digest(self.audio / "voice.wav"),
                    "script_sha256": digest(self.episode / "script.md"),
                    "duration": 1,
                    "words": [
                        {
                            "index": 0,
                            "text": "River.",
                            "status": "matched",
                            "start": 0.1,
                            "end": 0.5,
                        }
                    ],
                },
            )
            write_json(self.audio / "recognition-0.json", {"recognized": "River."})
        else:
            metadata = Path(
                next(a.split("=", 1)[1] for a in arguments if a.startswith("--metadata="))
            )
            write_json(metadata, {"frames": 30})
            if "--video-only" in arguments:
                (self.out / "episode-pilot-synced.mp4").write_bytes(b"rendered")
            else:
                image = self.out / "pilot-first-opening.png"
                image.write_bytes(b"first frame")
                write_json(
                    self.out / "pilot-preview-input.json", {"shots": [{"image": str(image)}]}
                )
                for suffix in ("assembly.json", "sync.json"):
                    write_json(self.out / f"pilot-{suffix}", {})
                (self.out / "pilot-preview.png").write_bytes(b"preview sheet")
        return b""

    monkeypatch.setattr(Builder, "command", command)
    monkeypatch.setattr(Builder, "runtime", lambda self, visual=False: {"test": "pinned"})
    return root, calls


def build(project, target="all"):
    builder = Builder(project[0], "pilot")
    builder.build(target)
    return builder


def test_full_build_is_sequential_cached_and_preserves_authored_storyboard(project):
    root, calls = project
    authored = (root / "episodes/pilot/storyboard.json").read_bytes()
    first = build(project)
    assert calls == ["voice", "align", "preview", "render"]
    assert all(r["status"] == "built" for r in first.results)
    paths = [root / p for record in first.state["stages"].values() for p in record["outputs"]]
    times = {p: p.stat().st_mtime_ns for p in paths}
    again = build(project)
    assert calls == ["voice", "align", "preview", "render"]
    assert all(r["status"] == "cached" for r in again.results)
    assert times == {p: p.stat().st_mtime_ns for p in paths}
    assert (root / "episodes/pilot/storyboard.json").read_bytes() == authored
    assert read_json(again.work / "storyboard.json")["audio"] == {
        "src": "episodes/pilot/audio/voice.wav",
        "words": "episodes/pilot/audio/words.json",
    }


@pytest.mark.parametrize(
    ("stage", "expected"),
    [
        ("voice", ["voice"]),
        ("align", ["voice", "align"]),
        ("preview", ["voice", "align", "preview"]),
    ],
)
def test_selected_stage_builds_only_needed_predecessors(project, stage, expected):
    assert [r["stage"] for r in build(project, stage).results] == expected
    assert project[1] == expected


def test_changed_voice_settings_invalidate_downstream_inputs(project):
    build(project)
    write_json(project[0] / "episodes/pilot/voice.job.json", {"seed": 100})
    result = build(project)
    assert all(r["status"] == "built" for r in result.results)


def test_damaged_cached_output_is_rebuilt_without_needless_downstream_work(project):
    build(project)
    (project[0] / "episodes/pilot/audio/voice.wav").write_bytes(b"damaged")
    result = build(project)
    assert [r["status"] for r in result.results] == ["built", "cached", "cached", "cached"]


def test_plate_and_token_changes_invalidate_only_visual_stages(project):
    build(project)
    for filename in ("studio/public/plates/test.png", "studio/src/design/tokens.ts"):
        (project[0] / filename).write_text(
            "// changed\n" if filename.endswith(".ts") else "changed", encoding="utf-8"
        )
        assert [r["status"] for r in build(project).results] == [
            "cached",
            "cached",
            "built",
            "built",
        ]


def test_deleted_preview_frame_is_regenerated_but_valid_video_is_reused(project):
    build(project)
    (project[0] / "studio/out/pilot-first-opening.png").unlink()
    assert [r["status"] for r in build(project).results] == ["cached", "cached", "built", "cached"]


def test_unresolved_alignment_fails_loudly_and_does_not_cache_or_render(project, monkeypatch):
    command = Builder.command

    def broken(self, arguments, cwd, *, capture=False):
        result = command(self, arguments, cwd, capture=capture)
        if "vap.align.words" in arguments:
            data = read_json(self.audio / "words.json")
            data["complete"] = False
            write_json(self.audio / "words.json", data)
        return result

    monkeypatch.setattr(Builder, "command", broken)
    builder = Builder(project[0], "pilot")
    with pytest.raises(StageError, match=r"\[align\].*complete.*align.log"):
        builder.build("all")
    assert project[1] == ["voice", "align"]
    assert "align" not in read_json(builder.state_path)["stages"]
    assert read_json(builder.work / "build-summary.json")["completed"] is False
    assert not (project[0] / "studio/out/.episode-build.lock").exists()


def test_missing_media_error_names_preview_stage_and_its_log(project):
    build(project, "align")
    (project[0] / "studio/public/plates/test.png").unlink()
    with pytest.raises(StageError, match=r"\[preview\].*preview.log"):
        build(project)


def test_missing_storyboard_does_not_block_voice_or_alignment(project):
    (project[0] / "episodes/pilot/storyboard.json").unlink()
    build(project, "align")
    with pytest.raises(StageError, match=r"\[preview\]"):
        build(project)


def test_global_lock_rejects_parallel_build_and_preserves_owner_file(tmp_path):
    with build_lock(tmp_path):
        with pytest.raises(StageError, match=r"\[setup\].*lock"):
            with build_lock(tmp_path):
                pytest.fail("Second owner acquired the lock")
        assert (tmp_path / "studio/out/.episode-build.lock").is_file()
    assert not (tmp_path / "studio/out/.episode-build.lock").exists()


@pytest.mark.parametrize(
    "slug", ["../other", "C:/other", "a/b", "a\\b", "-flag", "Upper", "a" * 81]
)
def test_slug_cannot_escape_episode_directory(tmp_path, slug):
    with pytest.raises(StageError, match=r"\[setup\]"):
        Builder(tmp_path, slug)


def test_failed_subprocess_writes_stdout_stderr_and_exit_code(project, monkeypatch):
    monkeypatch.undo()
    builder = Builder(project[0], "pilot")
    builder.current, builder.log = "voice", builder.work / "voice.log"
    with pytest.raises(RuntimeError, match="exited 7"):
        builder.command(
            [
                sys.executable,
                "-c",
                "import sys; print('out'); print('err', file=sys.stderr); sys.exit(7)",
            ],
            project[0],
        )
    assert "out" in builder.log.read_text(encoding="utf-8") and "err" in builder.log.read_text(
        encoding="utf-8"
    )


def test_cli_reports_failure_without_traceback(project, monkeypatch, capsys):
    monkeypatch.setattr(episode, "ROOT", project[0])
    assert episode.main(["build", "missing", "--stage", "voice"]) == 1
    assert "[setup]" in capsys.readouterr().err


def test_changed_script_invalidates_all_stage_keys(project):
    build(project)
    (project[0] / "episodes/pilot/script.md").write_text("Revised narration.", encoding="utf-8")
    assert all(r["status"] == "built" for r in build(project).results)


def test_invalid_cache_json_is_a_miss_not_an_excuse_to_skip_work(project):
    builder = build(project)
    builder.state_path.write_text("{interrupted write", encoding="utf-8")
    assert all(r["status"] == "built" for r in build(project).results)


def test_real_worker_exit_is_reported_by_cli_with_stage_and_log(project, monkeypatch, capsys):
    # Restore only the subprocess launcher; keep the test environment fingerprint.
    def launch(self):
        with self.log.open("ab") as stream:
            import subprocess

            result = subprocess.run(
                [sys.executable, "-c", "print('controlled failure'); raise SystemExit(7)"],
                stdout=stream,
                stderr=stream,
                check=False,
            )
        raise RuntimeError(f"Command exited {result.returncode}")

    monkeypatch.setattr(episode, "ROOT", project[0])
    monkeypatch.setattr(Builder, "voice", launch)
    assert episode.main(["build", "pilot", "--stage", "all"]) == 1
    error = capsys.readouterr().err
    assert "[voice] FAILED" in error and "voice.log" in error and "exited 7" in error
    assert "Traceback" not in error
    work = project[0] / "studio/out/episodes/pilot"
    assert "controlled failure" in (work / "voice.log").read_text(encoding="utf-8")
    assert len(read_json(work / "build-summary.json")["stages"]) == 1
