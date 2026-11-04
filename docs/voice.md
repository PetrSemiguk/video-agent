# Voice pipeline (steps 3.1–3.2)

Run Python only through uv from pipeline. Original English ChatterboxTTS **0.1.7**
uses the MIT-licensed ResembleAI/chatterbox model, pinned to revision
`5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`. No Turbo/multilingual substitution.
Code/model/Perth sources are recorded in licenses.md before use.

## CLI and outputs

```powershell
$env:UV_CACHE_DIR='C:/Users/semig/video-agent/studio/out/uv-cache'
uv run python -m vap.voice.tts --script ../episodes/_sandbox/tts-test/script.md --out ../studio/out/voice-3.2
```

`--script` accepts UTF-8 Markdown/plain text. `--out` receives `voice.wav` (mono
24 kHz PCM16), `voice.pre-loudnorm.wav` (float audit input), and
`voice.manifest.json` (schema version 2). Manifest records original and normalized
chunk text, paragraph, effective seed, parameters, cache key/hit, sample/second
spans, pauses, audio SHA-256, package versions and pinned model revision. The
sample end is exclusive; pauses follow that end. `metrics` describes the latest
run; `first_generation_metrics` retains a matching previous cold generation when
the same cache keys are reassembled. No false cold-generation timing is inferred
from a cache hit.

Exaggeration and cfg must be 0–1. The owner selected variant 1 on 2026-11-04:
default exaggeration **0.3**, cfg **0.5**; the seed defaults to 42.
Each chunk uses seed + chunk index for Python, NumPy and torch/CUDA. A fixed seed
controls sampling; bit-identical fresh generation across different GPU/software
stacks is not promised. Repeated cache assembly is tested bit-identical.

## Normalization and chunking

`normalize.py` expands years (1644 -> sixteen forty-four), decades (1900s ->
nineteen hundreds), cardinal quantities, separated numbers/decimals and common
units, ordinal centuries, BCE/CE/BC/AD and U.S./U.K./St./Dr. Quantity context takes
precedence over a bare four-digit year. Otherwise unseparated 1000–2999 is treated
as a year; ambiguous quantities should include a unit/context word or separator.
St. before a capitalized name is Saint; elsewhere Street. These are deliberate
English heuristics, not a general semantic parser; review the manifest text.

`pipeline/src/vap/voice/lexicon.yaml` holds editable English TTS respellings:
Qing -> Ching, Xi'an -> Shee ahn, Chongqing -> Chong ching, Wrocław -> Vrots wahf.
It uses JSON-compatible YAML (a flat string dictionary), parsed by the standard
library without a new dependency. Matching is case-insensitive, whole-name only;
curly apostrophes are normalized first. Replacements are applied once, before
number expansion. Original text stays intact in the manifest. These are English
voice steering hints, not IPA or guarantees of native-language pronunciation;
listen to `pronunciation.md` output when changing them. Lexicon changes affect
normalized text/cache keys; normalizer version is now 3.

Markdown headings and HTML comments are omitted; links retain visible text and
simple emphasis markup is removed. Paragraphs split on blank lines. Sentence
boundaries preserve common dotted abbreviations and decimal points. Each sentence
is its own chunk, splitting at words only if its normalized text exceeds **240
characters** (`--max-chars`, minimum 40). A single over-budget token fails rather
than being truncated. This budget keeps narration chunks short relative to the
model's 1000-token speech ceiling and localizes cache/regeneration errors. The
sandbox produces six chunks in two paragraphs. Original chunk words are retained.

## Caches and GPU lifetime

Raw watermarked float WAV chunks live in ignored `.cache/voice/`. SHA-256 cache
keys include normalized text, all generation parameters, effective seed,
reference-file hash or publisher built-in voice identity, model repository/revision,
Chatterbox/torch/Perth versions and normalizer version. Bad-rate, empty, nonfinite
or unreadable cache entries are regenerated.

Model loading is lazy, once per cache-missing CLI run. A full cache hit never
imports/loads Chatterbox onto the GPU. Model weights use HF_HOME (default ignored
`.cache/huggingface`); no weights are committed. A finally block releases the model,
collects objects and empties the CUDA allocator, including on inference failure.
The process also exits between variant generations. **Never run TTS and whisper
concurrently or keep both models resident.** No whisper is installed by this step.

## Trimming, pauses and loudness

Before joining, trim edge-only silence with 10 ms RMS frames at -50 dBFS and
retain 20 ms safety handles on each side. Internal silence is untouched; an
entirely silent chunk is rejected. Handles reduce the risk of cutting quiet word
onsets/tails, but listening remains necessary. Each manifest chunk records source,
trimmed-start, trimmed-end and retained sample counts. Raw float caches stay intact.

Join behavior: 0.25 s sentence, 0.60 s paragraph, 1.00 s section pause. Markdown
headings are unspoken section boundaries. Budget-split continuations have no
automatic sentence pause. Apply 5 ms linear edge fades, then sample-accurate gaps.
These durations specify inserted gaps; retained handles can add quiet time.

`[pause 1.0]` inserts exactly one second, overriding the automatic gap at that
boundary. Use 0–30 seconds per directive, decimal point, lowercase `pause`;
consecutive directives add. Leading/trailing explicit pauses are retained, while
no automatic trailing pause is appended. Directives never reach TTS. Malformed
directives fail before GPU work. Mid-sentence directives split the spoken chunk.

Pre-loudnorm headroom attenuation only reduces peaks above 0.98; the audit file
and `output_gain` record it. System ffmpeg 9 then measures loudness (pass 1) and
applies all measured values and offset (pass 2), targeting **-16 LUFS** integrated,
LRA 11, filter true peak -1.6 dBTP (0.1 dB delivery margin). Linear mode is requested;
ffmpeg can fall back to dynamic when peak/LRA constraints require it. Force output
back to mono 24 kHz PCM16. Independently remeasure the encoded WAV and require
-16 +/-0.2 LUFS, true peak <= -1.5 dBTP, unchanged sample count and valid format.
This is the voice-stem target; final mix -14 LUFS belongs to stage 6.

Check sample steps at every chunk start/end and file edge both before and after
mastering. Reject steps above 0.001 (-60 dBFS). This catches splice discontinuities,
not every possible audible click inside generated speech. Manifest postprocess
records ffmpeg version, both passes, final measurement and individual join checks.
Final WAV replaces its destination only after all checks pass. Float chunks keep
the real upstream watermark; post-processing does not deliberately remove it.

FFmpeg's [official loudnorm documentation](https://ffmpeg.org/pipermail/ffmpeg-cvslog/2020-January/120713.html)
explains measured parameters, dynamic fallback and explicit output sample rate.

## Rights and watermark

Without `--voice`, use the publisher's bundled conditioning. `--voice ref.wav` may
only use a recording we own or have a license/permission for, including permission
for the intended synthetic voice use. **Never clone a real person without their
consent.** A model license does not grant speaker rights. Keep evidence of ownership,
license and consent with episode production records. The CLI records the actual
reference hash; it cannot independently verify consent. No cloned real-person
reference was used for these comparisons.

Retain the actual PerthImplicitWatermarker in upstream generation; missing Perth
is an error, not a reason to install a dummy implementation. The watermark is an
inaudible provenance signal, not an on-screen/audible credit. MIT model/code terms
allow commercial use, but do not replace source/speaker rights or any platform
disclosure requirements. Do not claim independent robustness guarantees from
upstream marketing. Detection on the joined comparison files is measured in the
benchmark JSON (approximately 0.999–1.000), without removing the watermark.

## Comparison and performance definitions

```powershell
uv run python -m vap.voice.benchmark
```

This resumes valid existing sandbox generations, runs missing variants serially,
exports `episodes/_sandbox/tts-test/audio/voice-ex03.wav`, `voice-ex05.wav`,
`voice-ex07.wav` with adjacent manifests, then reassembles each into cache-check/
and requires 6/6 hits and identical output hashes. It writes committed evidence to
`docs/reports/3.1/benchmark.json`. WAVs and working manifests under audio/ are ignored.

RTF is synthesis wall seconds divided by generated speech seconds, excluding
inserted pauses, model load and weight download. Initial model load is reported
separately; first-run compilation/warmup can still increase synthesis time. Peak
memory is **torch CUDA allocator** allocated/reserved MiB, not total driver/GPU
memory. Cache rerun time is the in-process run time; CLI interpreter startup is
additional. No subjective quality winner is selected automatically.
