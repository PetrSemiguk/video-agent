"""Speech boundaries, script control and delivered audio acceptance."""

import numpy as np
import pytest
import soundfile as sf

from vap.voice import tts
from vap.voice.chunk import chunks
from vap.voice.normalize import normalize
from vap.voice.postprocess import join_check, normalize_loudness, trim_edges


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Qing dynasty", "Ching dynasty"),
        ("QING", "Ching"),
        ("Xi’an", "Shee ahn"),
        ("Chongqing.", "Chong ching."),
        ("Wrocław", "Vrots wahf"),
        ("Qinghai is not Qing.", "Qinghai is not Ching."),
    ],
)
def test_pronunciation_whole_names(text, expected):
    assert normalize(text) == expected


def test_explicit_pauses_and_sections_do_not_reach_spoken_text():
    prepared = chunks("[pause 0.2] One. [pause 1.0] Two.\n\n# New section\nThree. [pause 0.4]")
    assert [c.normalized for c in prepared] == ["One.", "Two.", "Three."]
    audio, spans = tts.assemble([np.ones(2400)] * 3, [c.paragraph for c in prepared], prepared)
    assert spans[0]["start_sample"] == 4800
    assert spans[0]["pause_after_samples"] == 24000
    assert spans[1]["pause_after_samples"] == 24000  # section default
    assert spans[2]["pause_after_samples"] == 9600  # explicit trailing pause
    assert len(audio) == spans[-1]["end_sample"] + 9600
    assert join_check(audio, spans)["maximum_step"] == 0


@pytest.mark.parametrize(
    "directive", ["[pause -1]", "[pause nan]", "[pause 31]", "[pause]", "[pause 1"]
)
def test_invalid_pause_fails_before_synthesis(directive):
    with pytest.raises(ValueError, match="[Pp]ause"):
        chunks(f"One. {directive} Two.")


def test_continuations_have_no_sentence_pause_and_explicit_zero_overrides_paragraph():
    prepared = chunks("River valleys connect people " * 8 + ". [pause 0]\n\nNext.", 60)
    audio, spans = tts.assemble(
        [np.ones(1000)] * len(prepared), [c.paragraph for c in prepared], prepared
    )
    assert all(span["pause_after_samples"] == 0 for span in spans)
    assert len(audio) == 1000 * len(prepared)


def test_trim_keeps_safety_handles_and_internal_silence():
    # 100 ms padding, 100 ms speech, 100 ms internal silence, speech, padding.
    raw = np.concatenate(
        [np.zeros(2400), np.ones(2400) * 0.1, np.zeros(2400), np.ones(2400) * 0.1, np.zeros(2400)]
    ).astype(np.float32)
    trimmed, info = trim_edges(raw, 24000)
    assert info["trim_start_samples"] == info["trim_end_samples"] == 1920
    np.testing.assert_array_equal(trimmed, raw[1920:-1920])
    assert np.all(trimmed[2880:5280] == 0)
    with pytest.raises(ValueError, match="no signal"):
        trim_edges(np.zeros(24000), 24000)


def test_join_check_rejects_nonzero_splice():
    with pytest.raises(ValueError, match="discontinuity"):
        join_check(np.array([0, 0.8, 0, 0]), [{"start_sample": 0, "end_sample": 2}])


def test_real_ffmpeg_two_pass_and_output_sample_contract(tmp_path):
    sr = 24000
    phase = np.arange(sr * 6) / sr
    raw = (0.03 * np.sin(2 * np.pi * 220 * phase)).astype(np.float32)
    audio, spans = tts.assemble([raw, raw], [0, 1])
    source, destination = tmp_path / "raw.wav", tmp_path / "voice.wav"
    sf.write(source, audio, sr, subtype="FLOAT")
    evidence = normalize_loudness(source, destination, sr, spans)
    assert abs(float(evidence["after"]["input_i"]) + 16) <= 0.2
    assert float(evidence["after"]["input_tp"]) <= -1.5
    assert evidence["join_check"]["passed"]
    assert sf.info(destination).frames == len(audio)
