import json
from argparse import Namespace
from copy import deepcopy

import numpy as np
import pytest
import soundfile as sf

from vap.align import words
from vap.align.match import align_chunk, edit_path, owned_forms
from vap.align.qa import audit, onsets
from vap.align.transcribe import MODEL_REVISION
from vap.voice.normalize import normalize
from vap.voice.tts import sha256_file


def chunk(text, index=0):
    return {
        "id": index,
        "original": text,
        "normalized": normalize(text),
        "paragraph": 0,
        "seed": 42 + index,
        "start": 0,
        "end": 10,
    }


def recognized(*text):
    return {
        "chunk_id": 0,
        "words": [{"text": t, "start": i * 0.2, "end": (i + 1) * 0.2} for i, t in enumerate(text)],
    }


@pytest.mark.parametrize(
    "text", ["St. Louis is 3,000 km away.", "In 1900 years.", "Qing ruled Xi'an."]
)
def test_context_normalization_owners(text):
    forms, owners = owned_forms(text.split())
    assert len(forms) == len(owners)
    assert all(0 <= owner < len(text.split()) for owner in owners)
    assert forms


def test_numbers_keep_original_words_and_union_expanded_timing():
    original = chunk("In 1644, 2,000 people lived here.")
    output, issues = align_chunk(
        original,
        recognized("In", "sixteen", "forty-four,", "2", ",000", "people", "lived", "here."),
        7,
    )
    assert not issues
    assert [w["text"] for w in output] == original["original"].split()
    assert output[1]["index"] == 8
    assert output[1]["start"] == 0.2 and output[1]["end"] == pytest.approx(0.6)
    assert output[2]["start"] == pytest.approx(0.6) and output[2]["end"] == 1.0


def test_missing_and_extra_are_explicit_with_chunk_ids():
    output, issues = align_chunk(
        chunk("The river flows east."), recognized("The", "river", "east.", "now."), 0
    )
    assert issues and all(i["chunk_id"] == 0 for i in issues)
    assert any(w["status"] == "unresolved" for w in output)
    assert all(w["start"] is None for w in output if w["status"] == "unresolved")
    _, extra = align_chunk(chunk("The river."), recognized("The", "great", "river."), 0)
    assert any(i["type"] == "extra" for i in extra)


def test_sequence_alignment_handles_repeated_words_monotonically():
    path = edit_path(["the", "river", "the", "river"], ["the", "river", "river"])
    assert sum(op == "missing" for op, _, _ in path) == 1
    assert [j for _, _, j in path if j is not None] == [0, 1, 2]


def test_zero_duration_is_unresolved():
    heard = recognized("River.")
    heard["words"][0]["end"] = 0
    output, issues = align_chunk(chunk("River."), heard, 0)
    assert issues[0]["type"] == "zero_duration"
    assert output[0]["start"] is None


def test_sentence_and_paragraph_spans():
    first, second = chunk("St. Louis. A river!"), chunk("A valley.", 1)
    second["paragraph"] = 1
    heard2 = recognized("A", "valley.")
    heard2["chunk_id"] = 1
    result = words.build_alignment(
        {"chunks": [first, second]},
        {
            "chunks": [recognized("Saint", "Louis.", "A", "river!"), heard2],
            "model": {},
            "runtime": {},
        },
    )
    assert result["complete"]
    assert len(result["sentences"]) == 3 and len(result["paragraphs"]) == 2
    assert result["sentences"][0]["word_end"] == 2


def test_repair_changes_only_affected_seeds_and_requires_same_reference(tmp_path):
    manifest = {
        "chunks": [chunk("A."), chunk("B.", 1)],
        "voice": {"kind": "publisher-built-in"},
        "settings": {"exaggeration": 0.3, "cfg_weight": 0.5},
        "seed": 42,
        "max_chars": 240,
    }
    job = words.repair_job(tmp_path / "script.md", None, manifest, [1], tmp_path / "repair")
    assert job["seed_overrides"] == {"0": 42, "1": 100046}
    with pytest.raises(ValueError, match="cannot change voice"):
        words.repair_job(tmp_path / "s", tmp_path / "ref.wav", manifest, [0], tmp_path)
    manifest["voice"] = {"kind": "reference", "sha256": "unknown"}
    with pytest.raises(ValueError, match="original owned/licensed"):
        words.repair_job(tmp_path / "s", None, manifest, [0], tmp_path)


def test_fix_loop_is_bounded_and_never_has_simultaneous_workers(tmp_path, monkeypatch):
    script, audio = tmp_path / "script.md", tmp_path / "voice.wav"
    script.write_text("River.")
    sf.write(audio, np.ones(24000) * 0.1, 24000)
    manifest = {
        "script_sha256": sha256_file(script),
        "audio_sha256": sha256_file(audio),
        "samples": 24000,
        "sample_rate": 24000,
        "max_chars": 240,
        "duration": 1,
        "seed": 42,
        "settings": {"exaggeration": 0.3, "cfg_weight": 0.5},
        "voice": {"kind": "publisher-built-in"},
        "chunks": [{**chunk("River."), "start_sample": 0, "end_sample": 24000, "end": 1}],
    }
    path = tmp_path / "voice.manifest.json"
    words.write_json(path, manifest)
    calls = []

    def fake_worker(module, args, log):
        calls.append(module)
        if module.endswith("transcribe"):
            target = args[args.index("--out") + 1]
            words.write_json(
                words.Path(target),
                {
                    "audio_sha256": sha256_file(audio),
                    "chunk_spans": [[0, 0, 24000]],
                    "model": {"revision": MODEL_REVISION},
                    "runtime": {},
                    "chunks": [{"chunk_id": 0, "words": []}],
                },
            )
        else:
            job = json.loads(words.Path(args[1]).read_text())
            directory = words.Path(job["out"])
            directory.mkdir()
            (directory / "voice.wav").write_bytes(audio.read_bytes())
            repaired = deepcopy(manifest)
            repaired["chunks"][0]["seed"] = job["seed_overrides"]["0"]
            words.write_json(directory / "voice.manifest.json", repaired)

    monkeypatch.setattr(words, "worker", fake_worker)
    result = words.run(
        Namespace(
            script=script,
            audio=audio,
            manifest=path,
            out=tmp_path / "align",
            fix=True,
            max_tries=3,
            voice=None,
        )
    )
    assert not result["complete"] and len(result["repair_history"]) == 4
    assert calls == ["vap.align.transcribe", "vap.align.repair"] * 3 + ["vap.align.transcribe"]
    assert result["words"][0]["start"] is None


def test_mismatched_source_hash_is_rejected(tmp_path):
    script = tmp_path / "script.md"
    script.write_text("A river.")
    with pytest.raises(ValueError, match="Script hash"):
        words.check_inputs(script, tmp_path / "none.wav", {"script_sha256": "wrong"})


@pytest.mark.parametrize("timestamp", [float("nan"), -1, 12])
def test_invalid_recognition_times_are_rejected(timestamp):
    heard = recognized("River.")
    heard["words"][0]["start"] = timestamp
    with pytest.raises(ValueError, match="invalid/out-of-chunk"):
        align_chunk(chunk("River."), heard, 0)


def test_onset_detector_finds_synthetic_attack_without_asr_guidance():
    sr = 24000
    tone = np.sin(2 * np.pi * 200 * np.arange(sr) / sr).astype(np.float32) * 0.1
    waveform = np.concatenate([np.zeros(sr // 2), tone])
    landmarks = onsets(waveform, sr)
    assert min(abs(landmarks - 0.5)) < 0.02
    assert not len(onsets(np.zeros(sr), sr))


def test_onset_audit_uses_reproducible_random_words_and_does_not_invent_ground_truth():
    sr = 1000
    waveform = np.tile(np.concatenate([np.zeros(100), np.ones(100) * 0.1]), 20)
    alignment = {
        "words": [
            {"index": i, "text": str(i), "start": i * 0.2 + 0.1, "status": "matched"}
            for i in range(15)
        ]
    }
    first = audit(alignment, waveform, sr)
    assert first == audit(alignment, waveform, sr)
    assert first["count"] == 10 and len({w["word_index"] for w in first["words"]}) == 10
    assert "not independently labelled" in first["limitation"]
    with pytest.raises(ValueError, match="Need 10"):
        audit({"words": []}, waveform, sr)
