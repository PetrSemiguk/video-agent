"""Cached English Chatterbox CLI. Model load is lazy and occurs at most once per run."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import platform
import random
import time
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

from .chunk import DEFAULT_MAX_CHARS, Chunk, chunks
from .normalize import VERSION as NORMALIZER_VERSION
from .postprocess import (
    TRIM_DB,
    TRIM_FRAME_SECONDS,
    TRIM_PAD_SECONDS,
    join_check,
    normalize_loudness,
    trim_edges,
)

ROOT = Path(__file__).resolve().parents[4]
MODEL_REPO = "ResembleAI/chatterbox"
MODEL_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
MODEL_FILES = [
    "ve.safetensors",
    "t3_cfg.safetensors",
    "s3gen.safetensors",
    "tokenizer.json",
    "conds.pt",
]
SAMPLE_RATE = 24000
SENTENCE_PAUSE = 0.25
PARAGRAPH_PAUSE = 0.60
SECTION_PAUSE = 1.0
FADE_SECONDS = 0.005
OUTPUT_PEAK = 0.98


def configure_caches() -> None:
    """Honor user overrides, otherwise keep model caches in ignored workspace paths."""
    for key, relative in [
        ("HF_HOME", "huggingface"),
        ("TORCH_HOME", "torch"),
        ("NUMBA_CACHE_DIR", "numba"),
    ]:
        os.environ.setdefault(key, str(ROOT / ".cache" / relative))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def cache_key(text: str, settings: dict, voice: str, seed: int) -> str:
    payload = {
        "text": text,
        "settings": settings,
        "voice_sha256": voice,
        "seed": seed,
        "model_repo": MODEL_REPO,
        "model_revision": MODEL_REVISION,
        "chatterbox_version": version("chatterbox-tts"),
        "torch_version": version("torch"),
        "perth_version": version("resemble-perth"),
        "normalizer_version": NORMALIZER_VERSION,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def read_cached(path: Path) -> np.ndarray | None:
    if not path.exists():
        return None
    try:
        audio, sr = sf.read(path, dtype="float32")
        if sr == SAMPLE_RATE and audio.ndim == 1 and audio.size > 0 and np.isfinite(audio).all():
            return audio
    except (OSError, sf.LibsndfileError):
        pass
    return None


def fade(audio: np.ndarray) -> np.ndarray:
    result = audio.copy()
    count = min(round(FADE_SECONDS * SAMPLE_RATE), len(result) // 2)
    if count:
        ramp = np.linspace(0, 1, count, dtype=np.float32)
        result[:count] *= ramp
        result[-count:] *= ramp[::-1]
    return result


def headroom(audio: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Prevent PCM clipping; this is not loudness normalization or limiting."""
    peak = float(np.max(np.abs(audio)))
    gain = OUTPUT_PEAK / peak if peak > OUTPUT_PEAK else 1.0
    return audio * gain, gain, peak


def assemble(
    parts: list[np.ndarray],
    paragraphs: list[int],
    prepared: list[Chunk] | None = None,
) -> tuple[np.ndarray, list[dict]]:
    joined, spans, cursor = [], [], 0
    if prepared and prepared[0].pause_before:
        cursor = round(prepared[0].pause_before * SAMPLE_RATE)
        joined.append(np.zeros(cursor, dtype=np.float32))
    for index, (audio, paragraph) in enumerate(zip(parts, paragraphs, strict=True)):
        joined.append(fade(audio))
        end = cursor + len(audio)
        pause = (
            round(
                (
                    PARAGRAPH_PAUSE
                    if index + 1 < len(parts) and paragraphs[index + 1] != paragraph
                    else SENTENCE_PAUSE
                )
                * SAMPLE_RATE
            )
            if index + 1 < len(parts)
            else 0
        )
        if prepared:
            current = prepared[index]
            if current.pause_after is not None:
                pause = round(current.pause_after * SAMPLE_RATE)
            elif index + 1 < len(parts):
                following = prepared[index + 1]
                if following.section != current.section:
                    pause = round(SECTION_PAUSE * SAMPLE_RATE)
                elif (
                    following.paragraph == current.paragraph and current.boundary == "continuation"
                ):
                    pause = 0
        spans.append(
            {
                "start_sample": cursor,
                "end_sample": end,
                "start": cursor / SAMPLE_RATE,
                "end": end / SAMPLE_RATE,
                "pause_after_samples": pause,
            }
        )
        if pause:
            joined.append(np.zeros(pause, dtype=np.float32))
        cursor = end + pause
    return np.concatenate(joined), spans


def run(args: argparse.Namespace) -> dict:
    configure_caches()
    start = time.perf_counter()
    prior_path = args.out / "voice.manifest.json"
    try:
        prior = json.loads(prior_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        prior = None
    prepared = chunks(args.script.read_text(encoding="utf-8-sig"), args.max_chars)
    settings = {
        "exaggeration": args.exaggeration,
        "cfg_weight": args.cfg,
        "temperature": 0.8,
        "repetition_penalty": 1.2,
        "min_p": 0.05,
        "top_p": 1.0,
    }
    voice_hash = sha256_file(args.voice) if args.voice else "publisher-built-in-conds"
    cache = ROOT / ".cache" / "voice"
    cache.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)
    outputs, records = [], []
    model = torch = None
    load_seconds = synthesis_seconds = 0.0
    peak_allocated = peak_reserved = 0
    try:
        for index, chunk in enumerate(prepared):
            seed = args.seed + index
            key = cache_key(chunk.normalized, settings, voice_hash, seed)
            path = cache / f"{key}.wav"
            audio = read_cached(path)
            hit = audio is not None
            elapsed = 0.0
            if not hit:
                if model is None:
                    import torch as torch_module
                    from chatterbox.tts import ChatterboxTTS
                    from huggingface_hub import snapshot_download

                    torch = torch_module
                    if not torch.cuda.is_available():
                        raise RuntimeError(
                            "CUDA required for synthesis; cache-only runs do not require a GPU"
                        )
                    torch.cuda.reset_peak_memory_stats()
                    begin_load = time.perf_counter()
                    directory = snapshot_download(
                        MODEL_REPO, revision=MODEL_REVISION, allow_patterns=MODEL_FILES
                    )
                    model = ChatterboxTTS.from_local(directory, device="cuda")
                    if model.sr != SAMPLE_RATE or model.watermarker is None:
                        raise RuntimeError(
                            "Unexpected model sample rate or missing real watermarker"
                        )
                    if args.voice:
                        model.prepare_conditionals(str(args.voice), exaggeration=args.exaggeration)
                    torch.cuda.synchronize()
                    load_seconds = time.perf_counter() - begin_load
                random.seed(seed)
                np.random.seed(seed)
                torch.manual_seed(seed)
                torch.cuda.manual_seed_all(seed)
                torch.cuda.synchronize()
                begin_synthesis = time.perf_counter()
                waveform = model.generate(chunk.normalized, **settings)
                torch.cuda.synchronize()
                audio = waveform.detach().cpu().numpy().reshape(-1).astype(np.float32)
                del waveform
                elapsed = time.perf_counter() - begin_synthesis
                synthesis_seconds += elapsed
                if not audio.size or not np.isfinite(audio).all():
                    raise RuntimeError(f"Invalid waveform for chunk {index}")
                # Lossless float cache avoids generation/join/cache-hit quantization differences.
                temp = path.with_suffix(".tmp.wav")
                sf.write(temp, audio, SAMPLE_RATE, subtype="FLOAT")
                temp.replace(path)
            outputs.append(audio)
            records.append(
                {
                    "id": index,
                    **asdict(chunk),
                    "seed": seed,
                    "cache_key": key,
                    "cache_hit": hit,
                    "generation_seconds": elapsed,
                    "params": settings,
                }
            )
            print(
                f"chunk {index + 1}/{len(prepared)}: {'cache' if hit else 'generated'} "
                f"{len(audio) / SAMPLE_RATE:.2f}s",
                flush=True,
            )
    finally:
        if torch is not None:
            peak_allocated = torch.cuda.max_memory_allocated() / 1024**2
            peak_reserved = torch.cuda.max_memory_reserved() / 1024**2
            del model
            gc.collect()
            torch.cuda.empty_cache()
    trimmed = [trim_edges(part, SAMPLE_RATE) for part in outputs]
    audio, spans = assemble(
        [part for part, _ in trimmed], [c.paragraph for c in prepared], prepared
    )
    audio, output_gain, pre_gain_peak = headroom(audio)
    before_joins = join_check(audio, spans)
    source = args.out / "voice.pre-loudnorm.wav"
    sf.write(source, audio, SAMPLE_RATE, subtype="FLOAT")
    loudness = normalize_loudness(source, args.out / "voice.wav", SAMPLE_RATE, spans)
    for record, span, (_, trim) in zip(records, spans, trimmed, strict=True):
        record.update(span)
        record["trim"] = trim
    speech_seconds = sum(len(part) for part in outputs) / SAMPLE_RATE
    manifest = {
        "schema_version": 2,
        "python": platform.python_version(),
        "script_sha256": sha256_file(args.script),
        "model": {
            "repo": MODEL_REPO,
            "revision": MODEL_REVISION,
            "package": version("chatterbox-tts"),
        },
        "versions": {
            name: version(name)
            for name in [
                "torch",
                "torchaudio",
                "numpy",
                "Pillow",
                "rasterio",
                "shapely",
                "transformers",
                "diffusers",
                "resemble-perth",
                "setuptools",
            ]
        },
        "settings": settings,
        "seed": args.seed,
        "max_chars": args.max_chars,
        "voice": {
            "kind": "reference" if args.voice else "publisher-built-in",
            "sha256": voice_hash,
        },
        "watermark": "PerthImplicitWatermarker; enabled in upstream generate",
        "sample_rate": SAMPLE_RATE,
        "samples": len(audio),
        "duration": len(audio) / SAMPLE_RATE,
        "sentence_pause": SENTENCE_PAUSE,
        "paragraph_pause": PARAGRAPH_PAUSE,
        "section_pause": SECTION_PAUSE,
        "postprocess": {
            "version": 1,
            "trim_threshold_dbfs": TRIM_DB,
            "trim_frame_seconds": TRIM_FRAME_SECONDS,
            "trim_pad_seconds": TRIM_PAD_SECONDS,
            "before_join_check": before_joins,
            "loudness": loudness,
        },
        "edge_fade_seconds": FADE_SECONDS,
        "output_gain": output_gain,
        "pre_gain_peak": pre_gain_peak,
        "chunks": records,
        "metrics": {
            "cache_hits": sum(record["cache_hit"] for record in records),
            "chunk_count": len(records),
            "model_load_seconds": load_seconds,
            "synthesis_seconds": synthesis_seconds,
            "speech_seconds": speech_seconds,
            "synthesis_rtf": synthesis_seconds / speech_seconds,
            "peak_allocated_mib": peak_allocated,
            "peak_reserved_mib": peak_reserved,
            "wall_seconds": time.perf_counter() - start,
        },
        "audio_sha256": sha256_file(args.out / "voice.wav"),
    }
    # Preserve actual cold-generation measurements when rebuilding from raw float caches.
    first = prior.get("first_generation_metrics") or prior.get("metrics") if prior else None
    if (
        first
        and first["cache_hits"] == 0
        and prior
        and [c["cache_key"] for c in prior["chunks"]] == [c["cache_key"] for c in records]
    ):
        manifest["first_generation_metrics"] = first
    elif manifest["metrics"]["cache_hits"] == 0:
        manifest["first_generation_metrics"] = manifest["metrics"]
    (args.out / "voice.manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["metrics"], indent=2), flush=True)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--voice",
        type=Path,
        help="Owned/licensed reference only; never clone someone without consent",
    )
    parser.add_argument("--exaggeration", type=float, default=0.3)
    parser.add_argument("--cfg", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    args = parser.parse_args(argv)
    if not 0 <= args.exaggeration <= 1 or not 0 <= args.cfg <= 1:
        parser.error("exaggeration and cfg must be in 0..1")
    if not 0 <= args.seed <= 2**32 - 100000:
        parser.error("seed must be a nonnegative 32-bit value with room for chunk offsets")
    run(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
