import json
import shutil
from argparse import Namespace

import numpy as np
import pytest
import soundfile as sf

from vap.voice import tts
from vap.voice.chunk import chunks, sentences
from vap.voice.normalize import normalize


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("In 1644.", "In sixteen forty-four."),
        ("In 1644, an army arrived.", "In sixteen forty-four, an army arrived."),
        ("The 1900s.", "The nineteen hundreds."),
        ("The 1920s.", "The nineteen twenties."),
        ("In 1900.", "In nineteen hundred."),
        ("In 1905.", "In nineteen oh five."),
        ("In 2000.", "In two thousand."),
        ("In 2005.", "In two thousand five."),
        ("In 2015.", "In twenty fifteen."),
        ("3,000 km", "three thousand kilometers"),
        ("1 km", "one kilometer"),
        ("2.5 km", "two point five kilometers"),
        ("50%", "fifty percent"),
        ("3000 years", "three thousand years"),
        ("2,000 years", "two thousand years"),
        (
            "1,234,567 people",
            "one million two hundred thirty-four thousand five hundred sixty-seven people",
        ),
        ("1644 CE", "sixteen forty-four common era"),
        ("221 BCE", "two hundred twenty-one before the common era"),
        ("44 BC", "forty-four before Christ"),
        ("AD 1066", "anno Domini ten sixty-six"),
        ("17th century", "seventeenth century"),
        ("21st-century", "twenty-first-century"),
        ("U.S. rivers", "United States rivers"),
        ("St. Louis", "Saint Louis"),
        ("Dr. Smith", "Doctor Smith"),
        ("  Plain   English. ", "Plain English."),
    ],
)
def test_normalization(text, expected):
    assert normalize(text) == expected


def test_chunking_preserves_paragraphs_abbreviations_and_budget():
    prose = (
        "# Heading\n\nSt. Louis is in the U.S. river basin. A short sentence.\n\n"
        + "River plains connect people. " * 8
    )
    prepared = chunks(prose, 60)
    assert prepared[0].original == "St. Louis is in the U.S. river basin."
    assert prepared[1].paragraph == 0
    assert prepared[2].paragraph == 1
    assert all(len(chunk.normalized) <= 60 for chunk in prepared)
    assert "Heading" not in " ".join(chunk.original for chunk in prepared)
    assert sentences("A 2.5 km river. Another sentence.") == [
        "A 2.5 km river.",
        "Another sentence.",
    ]


def test_long_sentences_split_at_words_without_losing_original_words():
    original = "The river flows through valleys and plains " * 20
    prepared = chunks(original, 80)
    assert " ".join(chunk.original for chunk in prepared).split() == original.split()
    assert max(len(chunk.normalized) for chunk in prepared) <= 80
    with pytest.raises(ValueError):
        chunks("W" * 100, 80)
    with pytest.raises(ValueError):
        chunks("# No prose")


def test_assembly_samples_pause_types_and_fades():
    parts = [np.ones(2400, dtype=np.float32) for _ in range(3)]
    audio, spans = tts.assemble(parts, [0, 0, 1])
    assert spans[0]["pause_after_samples"] == 6000
    assert spans[1]["pause_after_samples"] == 14400
    assert spans[1]["start_sample"] == 8400
    assert spans[2]["end_sample"] == len(audio)
    assert audio[0] == audio[-1] == 0
    assert np.all(audio[2400:8400] == 0)


def test_cache_keys_include_model_settings_voice_and_seed():
    base = tts.cache_key("River", {"cfg": 0.5}, "voice", 42)
    assert base == tts.cache_key("River", {"cfg": 0.5}, "voice", 42)
    assert (
        len(
            {
                base,
                tts.cache_key("River", {"cfg": 0.6}, "voice", 42),
                tts.cache_key("River", {"cfg": 0.5}, "other", 42),
                tts.cache_key("River", {"cfg": 0.5}, "voice", 43),
            }
        )
        == 4
    )


def test_cache_only_run_joins_without_loading_gpu(tmp_path, monkeypatch):
    monkeypatch.setattr(tts, "ROOT", tmp_path)

    def fake_loudness(source, destination, sr, spans):
        shutil.copyfile(source, destination)
        return {"test": "cache integration only"}

    monkeypatch.setattr(tts, "normalize_loudness", fake_loudness)
    script = tmp_path / "script.md"
    script.write_text("A river.\n\nA valley.")
    settings = {
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "temperature": 0.8,
        "repetition_penalty": 1.2,
        "min_p": 0.05,
        "top_p": 1.0,
    }
    cache = tmp_path / ".cache" / "voice"
    cache.mkdir(parents=True)
    for index, chunk in enumerate(chunks(script.read_text())):
        key = tts.cache_key(chunk.normalized, settings, "publisher-built-in-conds", 42 + index)
        sf.write(cache / f"{key}.wav", np.ones(2400) * 0.1, tts.SAMPLE_RATE, subtype="FLOAT")
    manifest = tts.run(
        Namespace(
            script=script,
            out=tmp_path / "audio",
            max_chars=240,
            voice=None,
            seed=42,
            exaggeration=0.5,
            cfg=0.5,
        )
    )
    assert manifest["metrics"]["cache_hits"] == 2
    assert manifest["metrics"]["model_load_seconds"] == 0
    assert manifest["metrics"]["peak_allocated_mib"] == 0
    assert (
        json.loads((tmp_path / "audio" / "voice.manifest.json").read_text())["chunks"][1]["start"]
        == 0.7
    )


def test_corrupt_cache_is_not_accepted(tmp_path):
    path = tmp_path / "broken.wav"
    path.write_bytes(b"not a wave")
    assert tts.read_cached(path) is None
    sf.write(path, np.zeros(100), 16000)
    assert tts.read_cached(path) is None


def test_pcm_headroom_prevents_clipping_without_boosting_quiet_audio():
    audio, gain, peak = tts.headroom(np.array([-1.2, 0, 1.2], dtype=np.float32))
    assert peak > 1
    assert gain < 1
    assert float(np.max(np.abs(audio))) == pytest.approx(0.98)
    quiet = np.array([-0.2, 0, 0.2], dtype=np.float32)
    output, gain, _ = tts.headroom(quiet)
    np.testing.assert_array_equal(output, quiet)
    assert gain == 1
