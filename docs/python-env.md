# Python environment (`pipeline/`)

The pipeline is a uv project (`vap` package, src-layout) pinned to **Python 3.11**.
Run everything from `pipeline/` with `uv run …`. Never activate the venv by hand, never use pip,
never use the system Python (3.14).

## Chosen stack

| Component | Version | Source |
|---|---|---|
| Python | 3.11 (`.python-version`) | uv-managed |
| torch | 2.6.0+cu126 | `https://download.pytorch.org/whl/cu126` (explicit uv index) |
| torchaudio | 2.6.0+cu126 | same index |
| CUDA runtime | 12.6 (bundled in the torch wheel) | — |
| cuDNN | 9.5.1 (bundled in the torch wheel) | — |
| NVIDIA driver | 621.01 (supports CUDA up to 13.5) | system |

`pyproject.toml` maps torch/torchaudio to the cu126 index via `[tool.uv.sources]`, so
`uv sync` always installs the CUDA builds, never the CPU builds from PyPI. The lockfile is
restricted to Windows (`tool.uv.environments`).

## Why this stack (research, 2026-11-02)

| Package | Latest | Needs |
|---|---|---|
| chatterbox-tts | 0.1.7 | Python ≥3.10 (developed on 3.11). **Hard pins** `torch==2.6.0`, `torchaudio==2.6.0` on Python < 3.14 (≥2.9 only on 3.14). Also pins `numpy<2`, `transformers==5.2.0`. Multilingual model: `ChatterboxMultilingualTTS` (`chatterbox.mtl_tts`, HF repo `ResembleAI/chatterbox`, 23 languages). English: `ChatterboxTTS`, `ChatterboxTurboTTS`. |
| faster-whisper | 1.2.1 | `ctranslate2>=4.0,<5`. GPU needs cuBLAS for CUDA 12 and cuDNN 9 (ctranslate2 ≥4.5). |
| ctranslate2 | 4.8.5 (verified in step 3.3) | CUDA 12 build. Uses cuBLAS/CUDA DLLs available through torch/lib on this Windows environment; see actual verification below. |

- torch 2.6.0 exists for cu118, cu124 and cu126; **cu126** is the newest and satisfies
  ctranslate2's "CUDA 12 + cuDNN 9".
- The torch cu126 wheel ships `cublas64_12.dll`, `cublasLt64_12.dll` and cuDNN 9 in
  `torch/lib`, and registers that folder as a DLL directory on `import torch`.
- RTX 4060 is sm_89 and is supported by all of the above.

### Verified step 3.3 (faster-whisper on Windows, 2026-11-04)

Installed via uv: faster-whisper **1.2.1**, CTranslate2 **4.8.5**, av **18.1.0**,
onnxruntime **1.31.1**, flatbuffers **25.12.19**. torch/torchaudio remain
**2.6.0+cu126**, numpy **1.26.4**. Full geo and audio tests still pass.

Actual successful DLL strategy: import torch first, retain an explicit
`os.add_dll_directory(Path(torch.__file__).parent / "lib")` handle on Windows,
then import CTranslate2/faster-whisper. GPU FP16 small.en transcription works on
RTX 4060. **No nvidia-cublas-cu12 or additional CUDA/cuDNN install was needed.**
No CPU fallback or torch downgrade was used.

Pinned MIT model `Systran/faster-whisper-small.en` revision
`d1d751a5f8271d482d14ca55d9e2deeebbae577f` is cached under the same ignored
workspace HF_HOME as voice models. CUDA driver snapshots during the verified
24.74 s sample observed 594 MiB additional system-wide usage, with about 1.64 GiB
total used. This is checkpoint sampling, not an instrumented allocation peak.

GPU transcription and TTS repair run in separate child processes, joined before
the next starts. CTranslate2 owns allocations outside torch's allocator, so
`torch.cuda.empty_cache()` alone is not treated as sufficient to unload Whisper.

If a future environment reports missing DLLs, diagnose its exact versions before
adding NVIDIA packages; they are not needed for torch itself or this verified run.

## Model cache

Step 3.1 verification (2026-11-04): installed chatterbox-tts 0.1.7 with
transformers 5.2.0, diffusers 0.29.0 and resemble-perth 1.0.1. The owner approved
Pillow `>=12,<13` (resolved 12.3.0) because Gradio 6.8.0 requires Pillow<13.
torch/torchaudio remain **2.6.0+cu126**, numpy **1.26.4**, rasterio **1.4.4** and
shapely **2.2.0**. All geo tests pass with this environment. Perth needs the
otherwise undeclared `pkg_resources`; setuptools `>=75,<81` (80.10.2) supplies it.
The genuine PerthImplicitWatermarker runs on Windows; no dummy/substitute is used.

The voice CLI honors explicit cache environment overrides, otherwise sets HF_HOME
to `.cache/huggingface`, TORCH_HOME to `.cache/torch` and NUMBA_CACHE_DIR to
`.cache/numba` under the repository, all git-ignored and writable in the sandbox.
Only the pinned original English checkpoint files are downloaded. These workspace
defaults override the generic Hugging Face library default described below.

Hugging Face normally defaults to `%USERPROFILE%\.cache\huggingface` outside the repo;
the voice CLI overrides that default as described above. Other tools may retain the
library default. Set `HF_HOME` in the shell before launching to share a different cache.
Never commit model weights.

## VRAM rule

The GPU has 8 GB. **Never keep the TTS model and the whisper model in VRAM at the same time.**
Run TTS and alignment as separate, sequential processes (or free the model with `del` +
`torch.cuda.empty_cache()` before loading the next one).

## Check

```
cd pipeline
uv run python -m vap.gpu_check
```

It prints versions, the device and VRAM, and a 4096×4096 matmul benchmark, then ends with
`GPU OK: <device>` (exit 0) or `GPU FAIL: <reason>` (exit 1).
