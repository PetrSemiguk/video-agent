"""Isolated Whisper worker: exit before any TTS repair process starts."""

import argparse
import json
import os
import time
from importlib.metadata import version
from pathlib import Path

from vap.voice.tts import configure_caches, sha256_file

MODEL_REPO = "Systran/faster-whisper-small.en"
MODEL_REVISION = "d1d751a5f8271d482d14ca55d9e2deeebbae577f"
TRANSCRIBE_OPTIONS = {
    "language": "en",
    "beam_size": 5,
    "temperature": 0,
    "condition_on_previous_text": False,
    "word_timestamps": True,
    "vad_filter": False,
}


def run(audio: Path, manifest: dict, out: Path) -> dict:
    configure_caches()
    # Import torch first: its Windows loader registers torch/lib CUDA DLLs.
    import torch

    handles = []
    if os.name == "nt":
        handles.append(os.add_dll_directory(str(Path(torch.__file__).parent / "lib")))
    import ctranslate2
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    from huggingface_hub import snapshot_download

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for alignment; no silent CPU fallback")
    supported = sorted(ctranslate2.get_supported_compute_types("cuda", 0))
    if "float16" not in supported:
        raise RuntimeError(f"GPU FP16 unsupported: {supported}")
    begin = time.perf_counter()
    free_before, total = torch.cuda.mem_get_info()
    free_samples = [free_before]
    directory = snapshot_download(
        MODEL_REPO,
        revision=MODEL_REVISION,
        allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"],
    )
    model = WhisperModel(directory, device="cuda", device_index=0, compute_type="float16")
    free_samples.append(torch.cuda.mem_get_info()[0])
    load_seconds = time.perf_counter() - begin
    decoded = decode_audio(str(audio), sampling_rate=16000)
    results = []
    begin = time.perf_counter()
    for chunk in manifest["chunks"]:
        # Manifest spans exclude generated gap samples. No source prompt: do not
        # bias recognition into "hearing" script words that were skipped by TTS.
        start, end = round(chunk["start"] * 16000), round(chunk["end"] * 16000)
        segments, _ = model.transcribe(decoded[start:end], **TRANSCRIBE_OPTIONS)
        words = []
        for segment in segments:
            for word in segment.words or []:
                words.append(
                    {
                        "text": word.word.strip(),
                        "start": max(chunk["start"], chunk["start"] + word.start),
                        "end": min(chunk["end"], chunk["start"] + word.end),
                        "probability": word.probability,
                    }
                )
        results.append({"chunk_id": chunk["id"], "words": words})
        free_samples.append(torch.cuda.mem_get_info()[0])
        print(f"Whisper chunk {chunk['id']}: {' '.join(w['text'] for w in words)}", flush=True)
    result = {
        "audio_sha256": sha256_file(audio),
        "options": TRANSCRIBE_OPTIONS,
        "chunk_spans": [[c["id"], c["start_sample"], c["end_sample"]] for c in manifest["chunks"]],
        "model": {"repo": MODEL_REPO, "revision": MODEL_REVISION, "compute_type": "float16"},
        "runtime": {
            "torch": torch.__version__,
            "torchaudio": version("torchaudio"),
            "numpy": version("numpy"),
            "faster_whisper": version("faster-whisper"),
            "ctranslate2": version("ctranslate2"),
            "device": torch.cuda.get_device_name(0),
            "supported_compute_types": supported,
            "dll_strategy": "torch first; explicit torch/lib add_dll_directory on Windows",
            "gpu_memory": {
                "method": (
                    "CUDA driver snapshots before/after load and after each chunk; system-wide"
                ),
                "total_mib": total / 1024**2,
                "baseline_used_mib": (total - free_before) / 1024**2,
                "observed_peak_used_mib": (total - min(free_samples)) / 1024**2,
                "observed_increase_mib": (free_before - min(free_samples)) / 1024**2,
            },
            "load_seconds_including_download": load_seconds,
            "transcription_seconds": time.perf_counter() - begin,
        },
        "chunks": results,
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    del model
    # Process exit is the GPU ownership boundary, not torch.empty_cache(): CT2
    # owns allocations outside torch's allocator.
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    run(args.audio, json.loads(args.manifest.read_text(encoding="utf-8")), args.out)


if __name__ == "__main__":
    main()
