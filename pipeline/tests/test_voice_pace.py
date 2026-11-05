"""Speaking pace: whole file and per chunk, warning outside 145-175 words per minute."""

import json

import numpy as np
import pytest

from vap.voice import pace, postprocess


def chunk(index, words, seconds, start=0.0):
    return {
        "id": index,
        "original": " ".join(["word"] * words),
        "normalized": " ".join(["word"] * words),
        "start": start,
        "end": start + seconds,
    }


def manifest(*chunks, duration):
    return {"chunks": list(chunks), "duration": duration}


def test_good_pace_has_no_warnings():
    report = pace.pace(manifest(chunk(0, 16, 6.0), chunk(1, 24, 9.0), duration=15.0))
    assert report["wpm"] == 160
    assert report["warnings"] == []


def test_file_too_fast_and_too_slow_warn():
    fast = pace.pace(manifest(chunk(0, 97, 30.0), duration=30.0))
    assert fast["wpm"] == 194
    assert "194 words per minute" in fast["warnings"][0]
    slow = pace.pace(manifest(chunk(0, 60, 30.0), duration=30.0))
    assert "120 words per minute" in slow["warnings"][0]


def test_limits_themselves_are_in_range():
    for words, _ in ((145, 0), (175, 0)):
        assert pace.pace(manifest(chunk(0, words, 60.0), duration=60.0))["warnings"] == []


def test_pauses_slow_the_file_but_not_the_speech_rate():
    report = pace.pace(manifest(chunk(0, 40, 10.0), duration=15.0))
    assert report["wpm"] == 160
    assert report["speech_wpm"] == 240


def test_a_fast_chunk_is_named_even_when_the_file_is_fine():
    report = pace.pace(
        manifest(chunk(0, 3, 0.5), chunk(1, 40, 15.0, 1.0), chunk(2, 40, 15.0, 17.0), duration=31.0)
    )
    assert len(report["warnings"]) == 1
    assert "1 of 3 chunks" in report["warnings"][0]
    assert "0 (360)" in report["warnings"][0]


def test_syllables_are_estimated_from_vowel_groups():
    assert pace.syllables("Egypt") == 2
    assert pace.syllables("administration") == 5
    assert pace.syllables("the lake") == 2
    assert pace.syllables("little") == 2


def test_short_words_run_at_more_words_per_minute_at_the_same_syllable_rate():
    def spoken(text, seconds):
        return {"id": 0, "original": text, "normalized": text, "start": 0.0, "end": seconds}

    short = pace.pace(manifest(spoken("the lake is so big and hot", 2.0), duration=2.0))
    long = pace.pace(manifest(spoken("administration agricultural", 2.0), duration=2.0))
    assert short["wpm"] > long["wpm"] * 2
    assert short["speech_syllables_per_second"] < long["speech_syllables_per_second"]


def test_stretch_keeps_the_rate_and_changes_the_length():
    audio = np.sin(np.linspace(0, 2000, 24000)).astype(np.float32)
    slower = postprocess.stretch(audio, 24000, 0.8)
    assert len(slower) == pytest.approx(30000, rel=0.02)
    assert postprocess.stretch(audio, 24000, 1) is audio
    with pytest.raises(ValueError):
        postprocess.stretch(audio, 24000, 0.4)


def test_empty_manifest_does_not_crash():
    report = pace.pace({"duration": 0})
    assert report["wpm"] is None and report["warnings"] == []


def test_cli_prints_and_writes_a_report(tmp_path, capsys):
    source = tmp_path / "voice.manifest.json"
    source.write_text(json.dumps(manifest(chunk(0, 97, 30.0), duration=30.0)), encoding="utf-8")
    target = tmp_path / "pace.json"
    assert pace.main([str(source), f"--report={target}"]) == 0
    assert "Pace warning" in capsys.readouterr().out
    assert json.loads(target.read_text(encoding="utf-8"))["wpm"] == 194
