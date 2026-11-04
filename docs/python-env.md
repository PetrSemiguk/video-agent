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
| ctranslate2 | 4.8.4 | CUDA 12 build. The Windows wheel bundles `ctranslate2.dll` (cudart linked statically), `cudnn64_9.dll`; it loads **`cublas64_12.dll` dynamically** and does not ship it. cuDNN is optional since 4.6.3. |

- torch 2.6.0 exists for cu118, cu124 and cu126; **cu126** is the newest and satisfies
  ctranslate2's "CUDA 12 + cuDNN 9".
- The torch cu126 wheel ships `cublas64_12.dll`, `cublasLt64_12.dll` and cuDNN 9 in
  `torch/lib`, and registers that folder as a DLL directory on `import torch`.
- RTX 4060 is sm_89 and is supported by all of the above.

### Known risk for step 3.3 (faster-whisper on Windows)

DLL lookup on Windows is the usual failure (`Could not load library cublas64_12.dll` /
`cudnn_ops64_9.dll`). Planned mitigation, to be verified in step 3.3:
1. `import torch` before `faster_whisper`, so ctranslate2 finds cuBLAS in `torch/lib`.
2. If ctranslate2 needs a newer cuBLAS than torch's 12.6, add `nvidia-cublas-cu12` and register
   its `bin/` folder with `os.add_dll_directory` before importing ctranslate2.

The `nvidia-*-cu12` pip packages are not needed for torch itself.

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
